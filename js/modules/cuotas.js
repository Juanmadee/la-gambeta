import { supabase } from '../core/supabase.js';
import { requireSession } from '../core/auth.js';
import { montarLayout } from '../core/layout.js';
import { hoyUY, esc, esMoroso } from '../core/util.js';

const fmt = (f) => f.split('-').reverse().join('/');
const pesos = (n) => '$ ' + Number(n).toLocaleString('es-UY');
const mesTxt = (ym) => new Date(ym + '-01T12:00:00').toLocaleDateString('es-UY', { month: 'long', year: 'numeric' });
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
// Rango [inicio, inicio del mes siguiente) para filtrar por mes de vencimiento
const rangoMes = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  const sig = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return [`${ym}-01`, sig];
};

const session = await requireSession();
if (session) iniciar(session);

async function iniciar(session) {
  const main = montarLayout('cuotas.html', session);
  document.body.classList.remove('oculto');
  main.innerHTML = `
    <div class="cabecera"><h1>Generar cuotas</h1></div>
    <p id="aviso" class="error" role="alert" hidden></p>
    <form id="form" class="form-simple">
      <label>Monto base de la cuota ($)<input id="monto" type="number" min="1" step="1"></label>
      <p class="ayuda" id="ayuda-monto"></p>
      <label>Fecha de vencimiento (opcional)<input id="venc" type="date"></label>
      <p class="ayuda" id="ayuda"></p>
      <p id="msg-gen" role="status"></p>
      <button class="btn" id="generar">Generar cuotas</button>
    </form>

    <h2 class="mt">Cuotas del período</h2>
    <div class="filtros">
      <label>Mes de vencimiento<input type="month" id="mes" style="width:auto"></label>
      <button class="btn-peligro" id="eliminar" disabled>Eliminar seleccionadas</button>
      <span id="resumen" class="ayuda"></span>
    </div>
    <p id="msg-lista" role="status"></p>
    <div class="tabla-caja"><table class="tabla"><thead><tr>
      <th><input type="checkbox" id="todas" aria-label="Seleccionar todas las cuotas impagas" disabled></th>
      <th>Alumno</th><th>Vencimiento</th><th>Monto base</th><th>A cobrar</th><th>Estado</th></tr></thead>
      <tbody id="filas"></tbody></table></div>`;

  const $ = (id) => main.querySelector('#' + id);
  const aviso = $('aviso'), tbody = $('filas'), todas = $('todas'), btnEliminar = $('eliminar');
  const avisar = (t) => { aviso.textContent = t; aviso.hidden = !t; };
  const decir = (el, t, ok) => { el.textContent = t; el.className = t ? (ok ? 'msg-ok' : 'error') : ''; };

  let cuotas = [], vencDefecto = null;
  const sel = new Set();

  // Vencimiento por defecto: lo calcula la función que ya existe en la BD (una sola fuente de verdad)
  const { data: vd, error: evd } = await supabase.rpc('vencimiento_por_defecto');
  if (evd) {
    console.error(evd);
    $('ayuda').textContent = 'No se pudo calcular el vencimiento por defecto: elegí una fecha.';
    $('mes').value = hoyUY().slice(0, 7);
  } else {
    vencDefecto = vd;
    $('ayuda').textContent = `Si la dejás vacía, vence el ${fmt(vd)}.`;
    $('mes').value = vd.slice(0, 7);
  }

  // Monto por defecto (Configuración): se usa si se deja vacío el monto
  const { data: cfg, error: ecfg } = await supabase.from('configuracion').select('monto_cuota_defecto').eq('id', 1).single();
  if (ecfg) console.error(ecfg);
  const montoDefecto = cfg?.monto_cuota_defecto ?? null;
  $('ayuda-monto').textContent = montoDefecto
    ? `Si lo dejás vacío se usa ${pesos(montoDefecto)} (monto por defecto de Configuración).`
    : 'No hay monto por defecto configurado: ingresalo acá o definilo en Configuración.';
  if (montoDefecto) $('monto').placeholder = String(montoDefecto);

  // ---------- Listado del período ----------
  async function cargarPeriodo() {
    const ym = $('mes').value;
    if (!ym) return;
    const [ini, sig] = rangoMes(ym);
    const { data, error } = await supabase.from('cuota')
      .select('id,monto,monto_total_descuento,fecha_vencimiento,pagada,alumno(nombre)')
      .gte('fecha_vencimiento', ini).lt('fecha_vencimiento', sig);
    if (error) { console.error(error); return avisar('No se pudieron cargar las cuotas. Revisá la conexión e intentá de nuevo.'); }
    avisar('');
    cuotas = data.sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento) || a.alumno.nombre.localeCompare(b.alumno.nombre, 'es'));
    sel.clear();
    render();
  }

  function render() {
    const hoy = hoyUY(), impagas = cuotas.filter((c) => !c.pagada).length;
    $('resumen').textContent = cuotas.length
      ? `${plural(cuotas.length, 'cuota', 'cuotas')}: ${plural(cuotas.length - impagas, 'pagada', 'pagadas')} y ${plural(impagas, 'impaga', 'impagas')}.`
      : '';
    tbody.innerHTML = cuotas.length ? cuotas.map((c) => {
      const badge = c.pagada ? '<span class="b-ok">Pagada</span>'
        : esMoroso(c, hoy) ? '<span class="b-venc">Morosa</span>' : '<span class="b-pronto">Pendiente</span>';
      return `<tr><td><input type="checkbox" data-id="${c.id}"${c.pagada ? ' disabled' : ''} aria-label="Seleccionar cuota de ${esc(c.alumno.nombre)}"></td>
        <td>${esc(c.alumno.nombre)}</td><td>${fmt(c.fecha_vencimiento)}</td><td>${pesos(c.monto)}</td>
        <td>${pesos(c.monto_total_descuento)}${c.monto_total_descuento < c.monto ? '<small>Con descuento</small>' : ''}</td><td>${badge}</td></tr>`;
    }).join('') : '<tr><td colspan="6" class="vacio">No hay cuotas con vencimiento en este mes.</td></tr>';
    barra();
  }

  // Estado de "seleccionar todo" y del botón eliminar (sin redibujar la tabla)
  function barra() {
    const impagas = cuotas.filter((c) => !c.pagada).length;
    todas.disabled = impagas === 0;
    todas.checked = impagas > 0 && sel.size === impagas;
    todas.indeterminate = sel.size > 0 && sel.size < impagas;
    btnEliminar.disabled = sel.size === 0;
    btnEliminar.textContent = sel.size ? `Eliminar seleccionadas (${sel.size})` : 'Eliminar seleccionadas';
  }

  tbody.addEventListener('change', (e) => {
    const cb = e.target.closest('input[type=checkbox][data-id]'); if (!cb) return;
    cb.checked ? sel.add(Number(cb.dataset.id)) : sel.delete(Number(cb.dataset.id));
    barra();
  });
  todas.addEventListener('change', () => {
    sel.clear();
    tbody.querySelectorAll('input[type=checkbox][data-id]:not(:disabled)').forEach((cb) => {
      cb.checked = todas.checked;
      if (todas.checked) sel.add(Number(cb.dataset.id));
    });
    barra();
  });

  btnEliminar.addEventListener('click', async () => {
    const ids = [...sel]; if (!ids.length) return;
    if (!confirm(`¿Eliminar ${plural(ids.length, 'cuota impaga', 'cuotas impagas')}? Esta acción no se puede deshacer.`)) return;
    btnEliminar.disabled = true;
    // .eq('pagada', false) es un seguro extra: nunca borra una cuota pagada aunque llegue en la lista
    const { data, error } = await supabase.from('cuota').delete().in('id', ids).eq('pagada', false).select('id');
    if (error) { console.error(error); btnEliminar.disabled = false; return decir($('msg-lista'), 'No se pudieron eliminar las cuotas. Intentá de nuevo.', false); }
    decir($('msg-lista'), `Se eliminaron ${plural(data.length, 'cuota', 'cuotas')}.`, true);
    cargarPeriodo();
  });

  $('mes').addEventListener('change', () => { decir($('msg-lista'), ''); cargarPeriodo(); });

  // ---------- Generar ----------
  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('msg-gen'), btn = $('generar');
    decir(msg, '');
    const montoTxt = $('monto').value.trim();
    if (!montoTxt && !montoDefecto) return decir(msg, 'Ingresá un monto o definí un monto por defecto en Configuración.', false);
    const monto = montoTxt ? Number(montoTxt) : montoDefecto;
    if (!Number.isInteger(monto) || monto < 1) return decir(msg, 'Ingresá un monto entero mayor a 0.', false);
    const venc = $('venc').value || vencDefecto;
    if (!venc) return decir(msg, 'Elegí una fecha de vencimiento.', false);

    btn.disabled = true;
    const ym = venc.slice(0, 7), [ini, sig] = rangoMes(ym);
    const [ex, act] = await Promise.all([
      supabase.from('cuota').select('alumno_id,fecha_vencimiento').gte('fecha_vencimiento', ini).lt('fecha_vencimiento', sig),
      supabase.from('alumno').select('id').eq('estado', true),
    ]);
    if (ex.error || act.error) {
      console.error(ex.error || act.error); btn.disabled = false;
      return decir(msg, 'No se pudo verificar las cuotas existentes. No se generó nada; intentá de nuevo.', false);
    }

    // La BD solo evita repetir la fecha exacta; acá se compara por MES para advertir
    const conExacta = new Set(ex.data.filter((c) => c.fecha_vencimiento === venc).map((c) => c.alumno_id));
    const conOtroDia = new Set(ex.data.filter((c) => c.fecha_vencimiento !== venc).map((c) => c.alumno_id));
    const faltan = act.data.filter((a) => !conExacta.has(a.id));
    const duplicarian = faltan.filter((a) => conOtroDia.has(a.id)).length;

    if (!faltan.length) {
      btn.disabled = false;
      return decir(msg, `Todos los alumnos activos ya tienen cuota con vencimiento el ${fmt(venc)}. No se generó nada.`, false);
    }
    if (ex.data.length) {
      let t = `Ya hay ${plural(ex.data.length, 'cuota', 'cuotas')} con vencimiento en ${mesTxt(ym)}.\n\nSe crearán ${plural(faltan.length, 'cuota', 'cuotas')} de ${pesos(monto)} con vencimiento el ${fmt(venc)}, solo para los alumnos activos que no la tienen.`;
      if (duplicarian) t += `\n\nOjo: ${plural(duplicarian, 'alumno ya tiene', 'alumnos ya tienen')} una cuota de ese mes con otro vencimiento y quedaría${duplicarian === 1 ? '' : 'n'} con dos.`;
      if (!confirm(t + '\n\n¿Continuar?')) { btn.disabled = false; return; }
    }

    const { data, error } = await supabase.rpc('generar_cuotas', { p_monto: monto, p_fecha_vencimiento: venc });
    btn.disabled = false;
    if (error) { console.error(error); return decir(msg, 'No se pudieron generar las cuotas. No se creó ninguna; revisá los datos e intentá de nuevo.', false); }
    decir(msg, `Se generaron ${plural(data, 'cuota', 'cuotas')} de ${pesos(monto)} con vencimiento el ${fmt(venc)}.`, true);
    $('mes').value = ym;
    decir($('msg-lista'), '');
    cargarPeriodo();
  });

  cargarPeriodo();
}
