import { supabase } from '../core/supabase.js';
import { requireSession } from '../core/auth.js';
import { montarLayout } from '../core/layout.js';
import { hoyUY, esc } from '../core/util.js';

const fmt = (f) => f.split('-').reverse().join('/');
const pesos = (n) => '$ ' + Number(n).toLocaleString('es-UY');
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
const wa = (t) => { const d = t.replace(/\D/g, ''); return d.startsWith('598') ? d : '598' + d.replace(/^0/, ''); };
const estadoCamp = (c, hoy) => c.fechafin < hoy ? 'fin' : c.fechainicio > hoy ? 'prox' : 'curso';
const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es');

const session = await requireSession();
if (session) iniciar(session);

async function iniciar(session) {
  const main = montarLayout('campamentos.html', session);
  document.body.classList.remove('oculto');
  main.innerHTML = `<p id="aviso" class="error" role="alert" hidden></p><div id="vista"></div><dialog id="dlg"><form id="form"></form></dialog>`;
  const $ = (id) => main.querySelector('#' + id);
  const aviso = $('aviso'), vista = $('vista'), dlg = $('dlg'), form = $('form');
  const avisar = (t) => { aviso.textContent = t; aviso.hidden = !t; if (t) aviso.scrollIntoView({ block: 'nearest' }); };
  let camps = [], alumnos = [], profes = [], detalleId = null, filtro = 'todos', editando = null;

  async function cargar() {
    const [cs, al, pr] = await Promise.all([
      supabase.from('campamento')
        .select('id,descripcion,fechainicio,fechafin,precio,cupo,inscripcion_a_camp(id,pagado,alumno_id,alumno(nombre,tel_tutor,estado)),profesor_campamento(profesor_id,profesor(nombre))')
        .order('fechainicio', { ascending: false }),
      supabase.from('alumno').select('id,nombre').eq('estado', true).order('nombre'),
      supabase.from('profesor').select('id,nombre').order('nombre'),
    ]);
    if (cs.error || al.error || pr.error) { console.error(cs.error || al.error || pr.error); return avisar('No se pudieron cargar los campamentos. Revisá la conexión e intentá de nuevo.'); }
    camps = cs.data; alumnos = al.data; profes = pr.data;
    if (detalleId && !camps.some((c) => c.id === detalleId)) detalleId = null;
    render();
  }

  const render = () => { const c = camps.find((x) => x.id === detalleId); vista.innerHTML = c ? htmlDetalle(c) : htmlLista(); };

  // ---------- Lista ----------
  function htmlLista() {
    const hoy = hoyUY();
    const vigentes = camps.filter((c) => estadoCamp(c, hoy) !== 'fin').length;
    const lista = camps.filter((c) => filtro === 'todos' || (filtro === 'finalizados') === (estadoCamp(c, hoy) === 'fin'));
    const chips = [['todos', `Todos (${camps.length})`], ['vigentes', `Próximos y en curso (${vigentes})`], ['finalizados', `Finalizados (${camps.length - vigentes})`]]
      .map(([k, t]) => `<button class="chip" data-f="${k}" aria-pressed="${k === filtro}">${t}</button>`).join('');
    const filas = lista.length ? lista.map((c) => {
      const e = estadoCamp(c, hoy), n = c.inscripcion_a_camp.length, pag = c.inscripcion_a_camp.filter((i) => i.pagado).length;
      const badge = e === 'curso' ? '<span class="b-ok">En curso</span>' : e === 'prox' ? '<span class="b-pronto">Próximo</span>' : 'Finalizado';
      return `<tr><td>${esc(c.descripcion)}<small>${fmt(c.fechainicio)} al ${fmt(c.fechafin)}</small></td><td>${badge}</td><td>${pesos(c.precio)}</td>
        <td>${n} / ${c.cupo} ${n >= c.cupo ? '<span class="b-pronto">Completo</span>' : ''}<small>${plural(pag, 'pagado', 'pagados')}</small></td>
        <td>${c.profesor_campamento.length}</td>
        <td class="acc"><button class="btn" data-a="gestionar" data-id="${c.id}">Gestionar</button>
          <button class="btn-sec" data-a="editar" data-id="${c.id}">Editar</button>
          <button class="btn-peligro" data-a="eliminar" data-id="${c.id}">Eliminar</button></td></tr>`;
    }).join('') : `<tr><td colspan="6" class="vacio">${camps.length ? 'No hay campamentos en este filtro.' : 'Todavía no hay campamentos. Creá el primero con "Nuevo campamento".'}</td></tr>`;
    return `<div class="cabecera"><h1>Campamentos</h1><button class="btn" data-a="nuevo">Nuevo campamento</button></div>
      <div class="filtros">${chips}</div>
      <div class="tabla-caja"><table class="tabla"><thead><tr><th>Campamento</th><th>Estado</th><th>Precio</th><th>Inscriptos</th><th>Profesores</th><th></th></tr></thead><tbody>${filas}</tbody></table></div>`;
  }

  // ---------- Detalle ----------
  function htmlDetalle(c) {
    const insc = [...c.inscripcion_a_camp].sort((a, b) => porNombre(a.alumno, b.alumno));
    const pag = insc.filter((i) => i.pagado).length, pen = insc.length - pag;
    const inscritos = new Set(insc.map((i) => i.alumno_id)), asignados = new Set(c.profesor_campamento.map((p) => p.profesor_id));
    const opciones = (lista) => '<option value="">Elegí...</option>' + lista.map((x) => `<option value="${x.id}">${esc(x.nombre)}</option>`).join('');
    const filasAl = insc.length ? insc.map((i) => {
      const contacto = i.pagado ? '' : `<small><a href="https://wa.me/${wa(i.alumno.tel_tutor)}" target="_blank" rel="noopener">WhatsApp</a></small>`;
      // Un inscripto con pago registrado no se desvincula directo: primero se desmarca el pago (eso elimina el ingreso)
      const acc = i.pagado
        ? `<button class="btn-sec" data-a="desmarcar" data-id="${i.id}">Desmarcar pago</button>`
        : `<button class="btn" data-a="pagar" data-id="${i.id}">Registrar pago</button>
           <button class="btn-peligro" data-a="desvincular" data-id="${i.id}">Desvincular</button>`;
      return `<tr><td>${esc(i.alumno.nombre)}${i.alumno.estado ? '' : ' (baja)'}${contacto}</td>
        <td>${i.pagado ? '<span class="b-ok">Pagado</span>' : '<span class="b-pronto">Pendiente</span>'}</td><td class="acc">${acc}</td></tr>`;
    }).join('') : '<tr><td colspan="3" class="vacio">Todavía no hay alumnos inscriptos.</td></tr>';
    const filasPr = c.profesor_campamento.length
      ? [...c.profesor_campamento].sort((a, b) => porNombre(a.profesor, b.profesor)).map((p) =>
        `<tr><td>${esc(p.profesor.nombre)}</td><td class="acc"><button class="btn-peligro" data-a="quitar" data-id="${p.profesor_id}">Quitar</button></td></tr>`).join('')
      : '<tr><td colspan="2" class="vacio">Todavía no hay profesores asignados.</td></tr>';
    return `<div class="cabecera"><div><button class="btn-sec" data-a="volver">← Volver</button></div></div>
      <h1>${esc(c.descripcion)}</h1>
      <p class="sub">${fmt(c.fechainicio)} al ${fmt(c.fechafin)} - Precio ${pesos(c.precio)} por alumno</p>
      <div class="kpis">
        <div class="kpi">Inscriptos<b>${insc.length} / ${c.cupo}</b></div>
        <div class="kpi">Pagados<b>${pag}</b></div>
        <div class="kpi${pen ? ' rojo' : ''}">Pendiente de cobro<b>${pesos(pen * c.precio)}</b></div></div>
      <h2 class="mt">Alumnos inscriptos</h2>
      <div class="filtros"><select id="sel-alumno" aria-label="Alumno a inscribir" style="min-width:220px">${opciones(alumnos.filter((a) => !inscritos.has(a.id)))}</select>
        <button class="btn" data-a="inscribir">Inscribir</button></div>
      <div class="tabla-caja"><table class="tabla"><thead><tr><th>Alumno</th><th>Pago</th><th></th></tr></thead><tbody>${filasAl}</tbody></table></div>
      <h2 class="mt">Profesores a cargo</h2>
      <div class="filtros"><select id="sel-prof" aria-label="Profesor a asignar" style="min-width:220px">${opciones(profes.filter((p) => !asignados.has(p.id)))}</select>
        <button class="btn" data-a="asignar">Asignar</button></div>
      <div class="tabla-caja"><table class="tabla"><thead><tr><th>Profesor</th><th></th></tr></thead><tbody>${filasPr}</tbody></table></div>`;
  }

  // ---------- Alta / edición de campamento ----------
  function abrir(c) {
    editando = c?.id ?? null;
    form.innerHTML = `<h2>${editando ? 'Editar campamento' : 'Nuevo campamento'}</h2><div class="grid2">
      <label class="ancho">Descripción<input name="descripcion" value="${esc(c?.descripcion)}" required maxlength="200"></label>
      <label>Fecha de inicio<input name="fechainicio" type="date" value="${esc(c?.fechainicio)}" required></label>
      <label>Fecha de fin<input name="fechafin" type="date" value="${esc(c?.fechafin)}" required></label>
      <label>Precio por alumno ($)<input name="precio" type="number" min="0" step="1" value="${esc(c?.precio ?? 0)}" required></label>
      <label>Cupo<input name="cupo" type="number" min="1" step="1" value="${esc(c?.cupo)}" required></label></div>
      ${editando ? '<p class="ayuda">Cambiar el precio no modifica los pagos ya registrados.</p>' : ''}
      <p id="dlg-error" class="error" role="alert" hidden></p>
      <div class="acciones"><button type="button" class="btn-sec" data-cerrar>Cancelar</button><button class="btn" id="guardar">Guardar</button></div>`;
    dlg.showModal();
  }

  form.addEventListener('click', (e) => { if (e.target.closest('[data-cerrar]')) dlg.close(); });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form), btn = form.querySelector('#guardar'), err = form.querySelector('#dlg-error');
    const falla = (t) => { err.textContent = t; err.hidden = false; };
    const datos = { descripcion: fd.get('descripcion').trim(), fechainicio: fd.get('fechainicio'), fechafin: fd.get('fechafin'), precio: Number(fd.get('precio')), cupo: Number(fd.get('cupo')) };
    if (!datos.descripcion) return falla('Ingresá una descripción.');
    if (datos.fechafin < datos.fechainicio) return falla('La fecha de fin no puede ser anterior a la de inicio.');
    if (!Number.isInteger(datos.precio) || datos.precio < 0) return falla('El precio debe ser un entero de 0 o más.');
    if (!Number.isInteger(datos.cupo) || datos.cupo < 1) return falla('El cupo debe ser un entero mayor a 0.');
    btn.disabled = true;
    const { error } = editando
      ? await supabase.from('campamento').update(datos).eq('id', editando)
      : await supabase.from('campamento').insert(datos);
    btn.disabled = false;
    if (error) { console.error(error); return falla('No se pudo guardar. Revisá los datos e intentá de nuevo.'); }
    dlg.close(); cargar();
  });

  // ---------- Acciones ----------
  vista.addEventListener('click', async (e) => {
    const f = e.target.closest('[data-f]'); if (f) { filtro = f.dataset.f; return render(); }
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const a = b.dataset.a, id = Number(b.dataset.id);
    const c = camps.find((x) => x.id === (detalleId ?? id));
    avisar('');

    if (a === 'nuevo') return abrir(null);
    if (a === 'volver') { detalleId = null; return render(); }
    if (a === 'gestionar') { detalleId = id; render(); return window.scrollTo(0, 0); }
    if (a === 'editar') return abrir(c);
    if (a === 'eliminar') {
      const ni = c.inscripcion_a_camp.length, np = c.profesor_campamento.length;
      if (ni || np) return avisar(`No se puede eliminar "${c.descripcion}": tiene ${plural(ni, 'alumno inscripto', 'alumnos inscriptos')} y ${plural(np, 'profesor asignado', 'profesores asignados')}. Desvinculalos primero.`);
      if (!confirm(`¿Eliminar el campamento "${c.descripcion}"?`)) return;
      const { error } = await supabase.from('campamento').delete().eq('id', c.id);
      if (error) { console.error(error); return avisar('No se pudo eliminar el campamento.'); }
      return cargar();
    }

    b.disabled = true;
    const falla = (msg, err) => { console.error(err); b.disabled = false; avisar(msg); };

    if (a === 'inscribir') {
      const alumnoId = Number(vista.querySelector('#sel-alumno').value);
      if (!alumnoId) { b.disabled = false; return avisar('Elegí un alumno para inscribir.'); }
      const n = c.inscripcion_a_camp.length;
      // Cupo: solo aviso, el admin decide si inscribe igual
      if (n >= c.cupo && !confirm(`El campamento ya tiene ${n} inscriptos y el cupo es ${c.cupo}. ¿Inscribir igual?`)) { b.disabled = false; return; }
      const { error } = await supabase.from('inscripcion_a_camp').insert({ alumno_id: alumnoId, campamento_id: c.id });
      if (error) return falla('No se pudo inscribir al alumno. Intentá de nuevo.', error);
    } else if (a === 'pagar' || a === 'desmarcar') {
      const i = c.inscripcion_a_camp.find((x) => x.id === id), pagar = a === 'pagar';
      if (!pagar && !confirm(`¿Desmarcar el pago de ${i.alumno.nombre}? Se elimina el ingreso que se había registrado.`)) { b.disabled = false; return; }
      // El front solo cambia el booleano; los triggers crean o eliminan el ingreso (con el precio vigente del campamento)
      const { data, error } = await supabase.from('inscripcion_a_camp').update({ pagado: pagar }).eq('id', id).eq('pagado', !pagar).select('id');
      if (error) return falla('No se pudo actualizar el pago. Intentá de nuevo.', error);
      await cargar();
      if (!data.length) avisar('Esa inscripción ya había cambiado de estado. Se actualizó la lista.');
      return;
    } else if (a === 'desvincular') {
      const i = c.inscripcion_a_camp.find((x) => x.id === id);
      if (!confirm(`¿Desvincular a ${i.alumno.nombre} de "${c.descripcion}"?`)) { b.disabled = false; return; }
      // .eq('pagado', false): nunca borra una inscripción con pago (dejaría un ingreso suelto)
      const { error } = await supabase.from('inscripcion_a_camp').delete().eq('id', id).eq('pagado', false);
      if (error) return falla('No se pudo desvincular al alumno.', error);
    } else if (a === 'asignar') {
      const profId = Number(vista.querySelector('#sel-prof').value);
      if (!profId) { b.disabled = false; return avisar('Elegí un profesor para asignar.'); }
      const { error } = await supabase.from('profesor_campamento').insert({ profesor_id: profId, campamento_id: c.id });
      if (error) return falla('No se pudo asignar al profesor.', error);
    } else if (a === 'quitar') {
      const { error } = await supabase.from('profesor_campamento').delete().eq('profesor_id', id).eq('campamento_id', c.id);
      if (error) return falla('No se pudo quitar al profesor.', error);
    }
    cargar();
  });

  cargar();
}
