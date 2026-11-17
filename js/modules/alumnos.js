import { supabase } from '../core/supabase.js';
import { requireSession } from '../core/auth.js';
import { montarLayout } from '../core/layout.js';
import { comprimir, extension } from '../core/imagen.js';
import { hoyUY, diasEntre, esc } from '../core/util.js';

const BUCKET = 'fichas-medicas';
const COLS = 'id,nombre,ci,f_nacimiento,tel_tutor,nombre_tutor,ci_tutor,f_venc_carnet,estado,rec_medica,asistencia_med,permite_imagenes,descuento,foto_ficha_med,categoria_id,categoria(descripcion)';
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const fmt = (f) => f.split('-').reverse().join('/');
const mesAnio = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-UY', { month: 'short', year: 'numeric' });
const wa = (t) => { const d = t.replace(/\D/g, ''); return d.startsWith('598') ? d : '598' + d.replace(/^0/, ''); };
const plural = (n, p) => `${n} ${p}${n === 1 ? '' : 's'}`;

// Estado del carnet: ok (vigente), pronto (dentro del umbral) o venc (vencido)
function carnet(f, hoy, dias) {
  const d = diasEntre(hoy, f);
  if (d < 0) return ['venc', `Vencido (${mesAnio(f)})`];
  if (d <= dias) return ['pronto', d === 0 ? 'Vence hoy' : `Vence en ${plural(d, 'día')}`];
  return ['ok', `Vigente hasta ${mesAnio(f)}`];
}

const session = await requireSession();
if (session) iniciar(session);

async function iniciar(session) {
  const main = montarLayout('alumnos.html', session);
  document.body.classList.remove('oculto');
  main.innerHTML = `
    <div class="cabecera"><h1>Alumnos</h1><button class="btn" id="nuevo">Nuevo alumno</button></div>
    <p id="aviso" class="error" role="alert" hidden></p>
    <div class="kpis" id="kpis"></div>
    <div class="filtros"><input type="search" id="buscar" placeholder="Buscar por nombre, cédula o tutor" aria-label="Buscar">
      <select id="estado" aria-label="Estado"><option value="activos">Activos</option><option value="inactivos">Dados de baja</option><option value="todos">Todos</option></select>
      <select id="salud" aria-label="Carnet"><option value="todos">Carnet: todos</option><option value="ok">Al día</option><option value="pronto">Por vencer</option><option value="venc">Vencidos</option></select></div>
    <div class="filtros" id="chips"></div>
    <div class="tabla-caja"><table class="tabla"><thead><tr><th>Alumno</th><th>Categoría</th><th>Tutor</th><th>Carnet de salud</th><th></th></tr></thead><tbody id="filas"></tbody></table></div>
    <dialog id="dlg-alumno"><form id="form"></form></dialog>`;
  const $ = (id) => main.querySelector('#' + id);
  const aviso = $('aviso'), tbody = $('filas'), dlg = $('dlg-alumno'), form = $('form');
  const avisar = (t) => { aviso.textContent = t; aviso.hidden = !t; };

  let alumnos = [], cats = [], dias = 15, catSel = 0, editando = null;

  const [cfg, c] = await Promise.all([
    supabase.from('configuracion').select('dias_alerta_carnet').single(),
    supabase.from('categoria').select('id,descripcion,cupo').order('descripcion'),
  ]);
  if (!cfg.error) dias = cfg.data.dias_alerta_carnet;
  cats = c.data || [];

  async function cargar() {
    const { data, error } = await supabase.from('alumno').select(COLS).order('nombre');
    if (error) { console.error(error); return avisar('No se pudieron cargar los alumnos. Revisá la conexión e intentá de nuevo.'); }
    avisar(''); alumnos = data; render();
  }

  function render() {
    const hoy = hoyUY(), q = norm($('buscar').value), est = $('estado').value, sal = $('salud').value;
    const activos = alumnos.filter((a) => a.estado), estados = activos.map((a) => carnet(a.f_venc_carnet, hoy, dias)[0]);
    $('kpis').innerHTML = `<div class="kpi">Alumnos activos<b>${activos.length}</b></div>
      <div class="kpi">Carnets al día<b>${estados.filter((e) => e === 'ok').length}</b></div>
      <div class="kpi rojo">Vencidos o por vencer<b>${estados.filter((e) => e !== 'ok').length}</b></div>`;
    $('chips').innerHTML = [{ id: 0, descripcion: 'Todas' }, ...cats].map((k) =>
      `<button class="chip" data-cat="${k.id}" aria-pressed="${k.id === catSel}">${esc(k.descripcion)}</button>`).join('');

    const lista = alumnos.filter((a) => (est === 'todos' || a.estado === (est === 'activos'))
      && (!catSel || a.categoria_id === catSel)
      && (!q || norm(`${a.nombre} ${a.ci} ${a.nombre_tutor}`).includes(q))
      && (sal === 'todos' || carnet(a.f_venc_carnet, hoy, dias)[0] === sal));

    tbody.innerHTML = lista.length ? lista.map((a) => {
      const [tipo, txt] = carnet(a.f_venc_carnet, hoy, dias);
      return `<tr class="${a.estado ? '' : 'baja'}">
        <td>${esc(a.nombre)}${a.estado ? '' : ' (baja)'}<small>${plural(Math.floor(diasEntre(a.f_nacimiento, hoy) / 365.25), 'año')} - Nac. ${fmt(a.f_nacimiento)} - CI ${esc(a.ci)}</small></td>
        <td>${esc(a.categoria?.descripcion)}</td>
        <td>${esc(a.nombre_tutor)}<small>${esc(a.tel_tutor)} - <a href="https://wa.me/${wa(a.tel_tutor)}" target="_blank" rel="noopener">WhatsApp</a></small></td>
        <td><span class="b-${tipo}">${txt}</span></td>
        <td class="acc"><button class="btn-sec" data-a="editar" data-id="${a.id}">Editar</button>
          ${a.foto_ficha_med ? `<button class="btn-sec" data-a="ficha" data-id="${a.id}">Ficha</button>` : ''}
          <button class="${a.estado ? 'btn-peligro' : 'btn-sec'}" data-a="estado" data-id="${a.id}">${a.estado ? 'Dar de baja' : 'Reactivar'}</button></td></tr>`;
    }).join('') : '<tr><td colspan="5" class="vacio">No hay alumnos que coincidan con los filtros.</td></tr>';
  }

  const campo = (n, t, v, attrs = '', cls = '') => `<label class="${cls}">${t}<input name="${n}" value="${esc(v)}" ${attrs}></label>`;
  function abrir(a) {
    editando = a.id ? a : null;
    form.innerHTML = `<h2>${a.id ? 'Editar alumno' : 'Nuevo alumno'}</h2><div class="grid2">
      ${campo('nombre', 'Nombre completo', a.nombre, 'required maxlength="100"', 'ancho')}
      ${campo('ci', 'Cédula', a.ci, 'type="number" min="1" required')}
      ${campo('f_nacimiento', 'Fecha de nacimiento', a.f_nacimiento, 'type="date" required')}
      <label>Categoría<select name="categoria_id" required><option value="">Elegí una categoría</option>${cats.map((k) => `<option value="${k.id}"${k.id === a.categoria_id ? ' selected' : ''}>${esc(k.descripcion)}</option>`).join('')}</select></label>
      ${campo('f_venc_carnet', 'Vencimiento del carnet de salud', a.f_venc_carnet, 'type="date" required')}
      ${campo('nombre_tutor', 'Nombre del tutor', a.nombre_tutor, 'maxlength="100"')}
      ${campo('ci_tutor', 'Cédula del tutor', a.ci_tutor, 'type="number" min="1" required')}
      ${campo('tel_tutor', 'Teléfono del tutor (contacto de emergencia)', a.tel_tutor, 'type="tel" required maxlength="13"')}
      ${campo('rec_medica', 'Afecciones médicas', a.rec_medica, 'maxlength="200"', 'ancho')}
      ${campo('asistencia_med', 'Asistencia médica', a.asistencia_med, 'maxlength="20"')}
      ${campo('descuento', 'Descuento en cuotas (%)', a.descuento ?? 0, 'type="number" min="0" max="100" required')}
      <label class="check ancho"><input type="checkbox" name="permite_imagenes"${a.permite_imagenes ? ' checked' : ''}> Autoriza el uso de imágenes</label>
      <label class="ancho">Foto de la ficha médica<input type="file" name="foto" accept="image/*"></label>
      <p class="ayuda ancho">${a.foto_ficha_med ? 'Ya hay una ficha cargada; elegir otra la reemplaza. ' : ''}Si pesa más de 100 KB se comprime automáticamente.</p></div>
      <p id="dlg-error" class="error" role="alert" hidden></p>
      <div class="acciones"><button type="button" class="btn-sec" data-cerrar>Cancelar</button><button class="btn" id="guardar">Guardar</button></div>`;
    dlg.showModal();
  }

  form.addEventListener('click', (e) => { if (e.target.closest('[data-cerrar]')) dlg.close(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form), btn = form.querySelector('#guardar'), err = form.querySelector('#dlg-error');
    const txt = (k) => fd.get(k).trim() || null, num = (k) => Number(fd.get(k));
    const datos = { nombre: txt('nombre'), ci: num('ci'), f_nacimiento: fd.get('f_nacimiento'), categoria_id: num('categoria_id'),
      nombre_tutor: txt('nombre_tutor'), ci_tutor: num('ci_tutor'), tel_tutor: txt('tel_tutor'), f_venc_carnet: fd.get('f_venc_carnet'),
      rec_medica: txt('rec_medica'), asistencia_med: txt('asistencia_med'), permite_imagenes: fd.get('permite_imagenes') !== null, descuento: num('descuento') };
    const falla = (t) => { err.textContent = t; err.hidden = false; btn.disabled = false; };
    btn.disabled = true; err.hidden = true;
    // RN-01: avisar si la categoría ya está completa
    const cat = cats.find((k) => k.id === datos.categoria_id);
    const ocupados = alumnos.filter((x) => x.estado && x.categoria_id === datos.categoria_id && x.id !== editando?.id).length;
    if ((!editando || editando.categoria_id !== datos.categoria_id) && cat && ocupados >= cat.cupo
        && !confirm(`La categoría ${cat.descripcion} está completa (${ocupados} de ${cat.cupo}). ¿Cargarlo igual?`)) {
      btn.disabled = false; return;
    }
    let nueva = null;
    const foto = fd.get('foto');
    if (foto && foto.size) {
      try {
        const blob = await comprimir(foto);
        nueva = `${crypto.randomUUID()}.${extension(blob.type)}`;
        const { error } = await supabase.storage.from(BUCKET).upload(nueva, blob, { contentType: blob.type });
        if (error) throw error;
        datos.foto_ficha_med = nueva;
      } catch (x) { console.error(x); return falla('No se pudo procesar o subir la foto. Probá con otra imagen.'); }
    }
    const { error } = editando
      ? await supabase.from('alumno').update(datos).eq('id', editando.id)
      : promoviendo
        ? await supabase.rpc('promover_aspirante', { p_espera_id: promoviendo, p_alumno: datos })
        : await supabase.from('alumno').insert(datos);
    if (error) {
      console.error(error);
      if (nueva) supabase.storage.from(BUCKET).remove([nueva]);   // no dejar archivos huérfanos
      return falla(error.code === '23505' ? 'Ya existe un alumno con esa cédula.' : 'No se pudo guardar. Revisá los datos e intentá de nuevo.');
    }
    if (nueva && editando?.foto_ficha_med) supabase.storage.from(BUCKET).remove([editando.foto_ficha_med]);
    dlg.close(); cargar();
  });

  async function darDeBajaOReactivar(a) {
    if (a.estado) {
      const { count, error } = await supabase.from('cuota').select('id', { count: 'exact', head: true }).eq('alumno_id', a.id).eq('pagada', false);
      if (error) return avisar('No se pudieron verificar las cuotas del alumno.');
      const deuda = count ? `${a.nombre} tiene ${plural(count, 'cuota')} impaga${count === 1 ? '' : 's'}. ` : '';
      if (!confirm(`${deuda}¿Dar de baja a ${a.nombre}?`)) return;
    }
    const { error } = await supabase.from('alumno').update({ estado: !a.estado }).eq('id', a.id);
    if (error) return avisar('No se pudo cambiar el estado del alumno.');
    cargar();
  }

  async function verFicha(path) {
    const w = window.open('', '_blank');
    if (!w) return avisar('El navegador bloqueó la ventana. Permití las ventanas emergentes para ver la ficha.');
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 120);
    if (error) { w.close(); return avisar('No se pudo abrir la ficha médica.'); }
    w.location = data.signedUrl;
  }

  $('nuevo').addEventListener('click', () => abrir({}));
  ['buscar', 'estado', 'salud'].forEach((id) => $(id).addEventListener('input', render));
  $('chips').addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (b) { catSel = Number(b.dataset.cat); render(); } });
  tbody.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const a = alumnos.find((x) => x.id === Number(b.dataset.id));
    if (b.dataset.a === 'editar') abrir(a); else if (b.dataset.a === 'ficha') verFicha(a.foto_ficha_med); else darDeBajaOReactivar(a);
  });
    // Promover: alumnos.html?promover=ID abre el formulario con los datos del aspirante
  let promoviendo = null;
  dlg.addEventListener('close', () => { promoviendo = null; if (location.search) history.replaceState(null, '', 'alumnos.html'); });
  const idPromo = Number(new URLSearchParams(location.search).get('promover'));
  await cargar();
  if (idPromo) {
    const { data: asp } = await supabase.from('alumno_en_espera').select('*').eq('id', idPromo).maybeSingle();
    if (asp) { abrir({ nombre: asp.nombre, tel_tutor: asp.tel_tutor, categoria_id: asp.categoria_id }); promoviendo = asp.id; }
    else avisar('Ese aspirante ya no está en la lista de espera.');
  }
}
