import { supabase } from '../core/supabase.js';
import { requireSession } from '../core/auth.js';
import { montarLayout } from '../core/layout.js';
import { hoyUY, esc } from '../core/util.js';

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const fmt = (f) => f.split('-').reverse().join('/');
const dia = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-UY', { weekday: 'long' });
const hhmm = (t) => String(t).slice(0, 5);
const pesos = (n) => '$ ' + Number(n).toLocaleString('es-UY');
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
const wa = (t) => { const d = t.replace(/\D/g, ''); return d.startsWith('598') ? d : '598' + d.replace(/^0/, ''); };

const session = await requireSession();
if (session) iniciar(session);

async function iniciar(session) {
  const main = montarLayout('cumpleanos.html', session);
  document.body.classList.remove('oculto');
  main.innerHTML = `
    <div class="cabecera"><h1>Cumpleaños</h1><button class="btn" id="nuevo">Nuevo cumpleaños</button></div>
    <p id="aviso" class="error" role="alert" hidden></p>
    <div class="filtros"><input type="search" id="buscar" placeholder="Buscar alumno" aria-label="Buscar alumno"></div>
    <div class="kpis" id="kpis"></div>
    <div class="filtros" id="chips"></div>
    <div class="tabla-caja"><table class="tabla"><thead><tr><th>Fecha</th><th>Alumno</th><th>Horario</th><th>Monto</th><th>Pago</th><th></th></tr></thead><tbody id="filas"></tbody></table></div>
    <dialog id="dlg"><form id="form"></form></dialog>`;
  const $ = (id) => main.querySelector('#' + id);
  const aviso = $('aviso'), tbody = $('filas'), dlg = $('dlg'), form = $('form');
  const avisar = (t) => { aviso.textContent = t; aviso.hidden = !t; };
  let cumples = [], alumnos = [], montoDef = null, filtro = 'proximos', editando = null;

  async function cargar() {
    const [cs, al, cf] = await Promise.all([
      supabase.from('cumpleanos').select('id,fecha,monto,pagado,hora_inicio,hora_fin,alumno_id,alumno(nombre,tel_tutor,estado)').order('fecha').order('hora_inicio'),
      supabase.from('alumno').select('id,nombre').eq('estado', true).order('nombre'),
      supabase.from('configuracion').select('monto_cumple_defecto').eq('id', 1).single(),
    ]);
    if (cs.error || al.error) { console.error(cs.error || al.error); return avisar('No se pudieron cargar los cumpleaños. Revisá la conexión e intentá de nuevo.'); }
    if (cf.error) console.error(cf.error);   // sin monto por defecto: el monto se pide siempre
    avisar(''); cumples = cs.data; alumnos = al.data; montoDef = cf.data?.monto_cumple_defecto ?? null;
    render();
  }

  function render() {
    const hoy = hoyUY(), q = norm($('buscar').value);
    const prox = cumples.filter((c) => c.fecha >= hoy), pas = cumples.filter((c) => c.fecha < hoy), pen = cumples.filter((c) => !c.pagado);
    $('kpis').innerHTML = `<div class="kpi">Próximos<b>${prox.length}</b></div>
      <div class="kpi${pen.length ? ' rojo' : ''}">Sin cobrar<b>${pen.length}</b></div>
      <div class="kpi${pen.length ? ' rojo' : ''}">Pendiente de cobro<b>${pesos(pen.reduce((s, c) => s + c.monto, 0))}</b></div>`;
    $('chips').innerHTML = [['proximos', `Próximos (${prox.length})`], ['pasados', `Pasados (${pas.length})`], ['pendientes', `Sin cobrar (${pen.length})`], ['todos', `Todos (${cumples.length})`]]
      .map(([k, t]) => `<button class="chip" data-f="${k}" aria-pressed="${k === filtro}">${t}</button>`).join('');
    const lista = cumples.filter((c) => (filtro === 'todos' || (filtro === 'proximos' ? c.fecha >= hoy : filtro === 'pasados' ? c.fecha < hoy : !c.pagado)) && (!q || norm(c.alumno.nombre).includes(q)));
    if (filtro !== 'proximos') lista.reverse();   // próximos: del más cercano al más lejano; el resto: del más reciente al más viejo
    tbody.innerHTML = lista.length ? lista.map((c) => {
      const contacto = c.pagado ? '' : `<small><a href="https://wa.me/${wa(c.alumno.tel_tutor)}" target="_blank" rel="noopener">WhatsApp</a></small>`;
      // Con pago registrado no se edita ni se elimina: primero se desmarca el pago (eso elimina el ingreso)
      const acc = c.pagado
        ? `<button class="btn-sec" data-a="desmarcar" data-id="${c.id}">Desmarcar pago</button>`
        : `<button class="btn" data-a="pagar" data-id="${c.id}">Registrar pago</button>
           <button class="btn-sec" data-a="editar" data-id="${c.id}">Editar</button>
           <button class="btn-peligro" data-a="eliminar" data-id="${c.id}">Eliminar</button>`;
      return `<tr><td>${fmt(c.fecha)}<small>${dia(c.fecha)}</small></td><td>${esc(c.alumno.nombre)}${c.alumno.estado ? '' : ' (baja)'}${contacto}</td>
        <td>${hhmm(c.hora_inicio)} a ${hhmm(c.hora_fin)}</td><td>${pesos(c.monto)}</td>
        <td>${c.pagado ? '<span class="b-ok">Pagado</span>' : '<span class="b-pronto">Pendiente</span>'}</td><td class="acc">${acc}</td></tr>`;
    }).join('') : `<tr><td colspan="6" class="vacio">${cumples.length ? 'No hay cumpleaños en este filtro.' : 'Todavía no hay cumpleaños cargados.'}</td></tr>`;
  }

  function abrir(c) {
    editando = c?.id ?? null;
    // Al editar, el alumno actual aparece aunque esté dado de baja
    const lista = c && !alumnos.some((a) => a.id === c.alumno_id) ? [{ id: c.alumno_id, nombre: c.alumno.nombre + ' (baja)' }, ...alumnos] : alumnos;
    form.innerHTML = `<h2>${editando ? 'Editar cumpleaños' : 'Nuevo cumpleaños'}</h2><div class="grid2">
      <label class="ancho">Alumno<select name="alumno_id" required><option value="">Elegí un alumno</option>${lista.map((a) => `<option value="${a.id}"${a.id === c?.alumno_id ? ' selected' : ''}>${esc(a.nombre)}</option>`).join('')}</select></label>
      <label class="ancho">Fecha<input name="fecha" type="date" value="${esc(c?.fecha)}" required></label>
      <label>Hora de inicio<input name="hora_inicio" type="time" value="${esc(c ? hhmm(c.hora_inicio) : '')}" required></label>
      <label>Hora de fin<input name="hora_fin" type="time" value="${esc(c ? hhmm(c.hora_fin) : '')}" required></label>
      <label class="ancho">Monto ($)<input name="monto" type="number" min="0" step="1" value="${esc(c?.monto)}"${montoDef ? ` placeholder="${montoDef}"` : ''}>
        <span class="ayuda">${montoDef ? `Si lo dejás vacío se usa ${pesos(montoDef)} (monto por defecto de Configuración).` : 'No hay monto por defecto configurado: ingresalo o definilo en Configuración.'}</span></label></div>
      <p id="dlg-error" class="error" role="alert" hidden></p>
      <div class="acciones"><button type="button" class="btn-sec" data-cerrar>Cancelar</button><button class="btn" id="guardar">Guardar</button></div>`;
    dlg.showModal();
  }

  form.addEventListener('click', (e) => { if (e.target.closest('[data-cerrar]')) dlg.close(); });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form), btn = form.querySelector('#guardar'), err = form.querySelector('#dlg-error');
    const falla = (t) => { err.textContent = t; err.hidden = false; };
    const montoTxt = fd.get('monto').trim();
    if (!montoTxt && montoDef === null) return falla('Ingresá un monto o definí un monto por defecto en Configuración.');
    const datos = { alumno_id: Number(fd.get('alumno_id')), fecha: fd.get('fecha'), hora_inicio: fd.get('hora_inicio'), hora_fin: fd.get('hora_fin'), monto: montoTxt ? Number(montoTxt) : montoDef };
    if (!datos.alumno_id) return falla('Elegí un alumno.');
    if (datos.hora_fin <= datos.hora_inicio) return falla('La hora de fin debe ser posterior a la de inicio.');
    if (!Number.isInteger(datos.monto) || datos.monto < 0) return falla('El monto debe ser un entero de 0 o más.');
    btn.disabled = true;
    const { error } = editando
      ? await supabase.from('cumpleanos').update(datos).eq('id', editando).eq('pagado', false)
      : await supabase.from('cumpleanos').insert(datos);
    btn.disabled = false;
    if (error) { console.error(error); return falla('No se pudo guardar. Revisá los datos e intentá de nuevo.'); }
    dlg.close(); cargar();
  });

  tbody.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const c = cumples.find((x) => x.id === Number(b.dataset.id)); if (!c) return;
    avisar('');
    if (b.dataset.a === 'editar') return abrir(c);
    if (b.dataset.a === 'eliminar') {
      if (!confirm(`¿Eliminar el cumpleaños de ${c.alumno.nombre} del ${fmt(c.fecha)}?`)) return;
      // .eq('pagado', false): nunca borra un cumpleaños con pago (dejaría un ingreso suelto)
      const { error } = await supabase.from('cumpleanos').delete().eq('id', c.id).eq('pagado', false);
      if (error) { console.error(error); return avisar('No se pudo eliminar el cumpleaños.'); }
      return cargar();
    }
    const pagar = b.dataset.a === 'pagar';
    if (!pagar && !confirm(`¿Desmarcar el pago de ${c.alumno.nombre}? Se elimina el ingreso que se había registrado.`)) return;
    b.disabled = true;
    // El front solo cambia el booleano; los triggers crean o eliminan el ingreso
    const { data, error } = await supabase.from('cumpleanos').update({ pagado: pagar }).eq('id', c.id).eq('pagado', !pagar).select('id');
    if (error) { console.error(error); b.disabled = false; return avisar('No se pudo actualizar el pago. Intentá de nuevo.'); }
    await cargar();
    if (!data.length) avisar('Ese cumpleaños ya había cambiado de estado. Se actualizó la lista.');
  });

  $('nuevo').addEventListener('click', () => abrir(null));
  $('chips').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) { filtro = b.dataset.f; render(); } });
  $('buscar').addEventListener('input', render);
  cargar();
}
