import { supabase } from '../core/supabase.js';
import { requireSession } from '../core/auth.js';
import { montarLayout } from '../core/layout.js';
import { hoyUY, esc, esMoroso } from '../core/util.js';

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const fmt = (f) => f.split('-').reverse().join('/');
const mesCorto = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-UY', { month: 'short', year: 'numeric' });
const pesos = (n) => '$ ' + Number(n).toLocaleString('es-UY');
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
const wa = (t) => { const d = t.replace(/\D/g, ''); return d.startsWith('598') ? d : '598' + d.replace(/^0/, ''); };
// Rango [inicio, inicio del mes siguiente) para filtrar por mes de vencimiento
const rangoMes = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  const sig = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return [`${ym}-01`, sig];
};

const session = await requireSession();
if (session) iniciar(session);

async function iniciar(session) {
  const main = montarLayout('cobranzas.html', session);
  document.body.classList.remove('oculto');
  main.innerHTML = `
    <div class="cabecera"><h1>Cobranzas y pagos</h1></div>
    <p id="aviso" class="error" role="alert" hidden></p>
    <div class="filtros">
      <label id="lbl-mes">Mes de vencimiento<input type="month" id="mes" style="width:auto"></label>
      <input type="search" id="buscar" placeholder="Buscar alumno" aria-label="Buscar alumno">
    </div>
    <div class="kpis" id="kpis"></div>
    <div class="filtros" id="chips"></div>
    <p id="nota" class="ayuda" hidden></p>
    <div class="tabla-caja"><table class="tabla"><thead id="cab"></thead><tbody id="filas"></tbody></table></div>`;

  const $ = (id) => main.querySelector('#' + id);
  const aviso = $('aviso'), tbody = $('filas');
  const avisar = (t) => { aviso.textContent = t; aviso.hidden = !t; };
  let cuotas = [], morosas = [], filtro = 'todas';
  $('mes').value = hoyUY().slice(0, 7);

  async function cargar() {
    const ym = $('mes').value;
    if (!ym) return;
    const hoy = hoyUY(), [ini, sig] = rangoMes(ym);
    const [mes, mor] = await Promise.all([
      supabase.from('cuota')
        .select('id,monto_total_descuento,fecha_vencimiento,pagada,alumno(nombre,tel_tutor)')
        .gte('fecha_vencimiento', ini).lt('fecha_vencimiento', sig),
      // Morosos: impagas de TODOS los meses hasta el actual; la regla del día 10 se aplica con esMoroso
      supabase.from('cuota')
        .select('id,monto_total_descuento,fecha_vencimiento,pagada,alumno_id,alumno(nombre,tel_tutor,estado)')
        .eq('pagada', false).lt('fecha_vencimiento', rangoMes(hoy.slice(0, 7))[1]),
    ]);
    if (mes.error || mor.error) { console.error(mes.error || mor.error); return avisar('No se pudieron cargar las cuotas. Revisá la conexión e intentá de nuevo.'); }
    avisar('');
    cuotas = mes.data.sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento) || a.alumno.nombre.localeCompare(b.alumno.nombre, 'es'));
    morosas = mor.data.filter((c) => esMoroso(c, hoy));
    render();
  }

  // Morosas agrupadas por alumno, de mayor a menor deuda
  function morososPorAlumno() {
    const m = new Map();
    for (const c of morosas) {
      const g = m.get(c.alumno_id) || { alumno: c.alumno, n: 0, total: 0, meses: [] };
      g.n++; g.total += c.monto_total_descuento; g.meses.push(c.fecha_vencimiento);
      m.set(c.alumno_id, g);
    }
    return [...m.values()].sort((a, b) => b.total - a.total || a.alumno.nombre.localeCompare(b.alumno.nombre, 'es'));
  }

  function render() {
    const q = norm($('buscar').value), enMorosos = filtro === 'morosos';
    const grupos = morososPorAlumno();
    const pag = cuotas.filter((c) => c.pagada), pen = cuotas.filter((c) => !c.pagada);
    $('chips').innerHTML = [['todas', `Todas (${cuotas.length})`], ['pendientes', `Pendientes (${pen.length})`], ['pagadas', `Pagadas (${pag.length})`], ['morosos', `Morosos (${grupos.length})`]]
      .map(([k, t]) => `<button class="chip" data-f="${k}" aria-pressed="${k === filtro}">${t}</button>`).join('');
    $('lbl-mes').hidden = enMorosos;
    $('nota').hidden = !enMorosos;
    return enMorosos ? renderMorosos(grupos, q) : renderMes(pag, pen, q);
  }

  function renderMes(pag, pen, q) {
    const hoy = hoyUY();
    const suma = (l) => l.reduce((s, c) => s + c.monto_total_descuento, 0);
    const total = suma(cuotas), cobrado = suma(pag);
    // % cobrado sobre lo que realmente se debe cobrar (monto con descuento)
    const pct = total ? Math.round((cobrado * 100) / total) + '%' : '-';
    $('kpis').innerHTML = `<div class="kpi">Cuotas del mes<b>${cuotas.length}</b></div>
      <div class="kpi">Cobrado<b>${pesos(cobrado)}</b></div>
      <div class="kpi${pen.length ? ' rojo' : ''}">Pendiente<b>${pesos(total - cobrado)}</b></div>
      <div class="kpi">% cobrado<b>${pct}</b></div>`;
    $('cab').innerHTML = '<tr><th>Alumno</th><th>Vencimiento</th><th>A cobrar</th><th>Estado</th><th></th></tr>';
    const lista = cuotas.filter((c) => (filtro === 'todas' || (filtro === 'pagadas' ? c.pagada : !c.pagada)) && (!q || norm(c.alumno.nombre).includes(q)));
    tbody.innerHTML = lista.length ? lista.map((c) => {
      const badge = c.pagada ? '<span class="b-ok">Pagada</span>'
        : esMoroso(c, hoy) ? '<span class="b-venc">Morosa</span>' : '<span class="b-pronto">Pendiente</span>';
      const contacto = c.pagada ? '' : `<small><a href="https://wa.me/${wa(c.alumno.tel_tutor)}" target="_blank" rel="noopener">WhatsApp</a></small>`;
      const accion = c.pagada
        ? `<button class="btn-sec" data-a="desmarcar" data-id="${c.id}">Desmarcar pago</button>`
        : `<button class="btn" data-a="pagar" data-id="${c.id}">Registrar pago</button>`;
      return `<tr><td>${esc(c.alumno.nombre)}${contacto}</td><td>${fmt(c.fecha_vencimiento)}</td><td>${pesos(c.monto_total_descuento)}</td><td>${badge}</td><td class="acc">${accion}</td></tr>`;
    }).join('') : `<tr><td colspan="5" class="vacio">${cuotas.length ? 'No hay cuotas que coincidan con el filtro.' : 'No hay cuotas con vencimiento en este mes. Generalas desde "Generar cuotas".'}</td></tr>`;
  }

  function renderMorosos(grupos, q) {
    const totalDeuda = morosas.reduce((s, c) => s + c.monto_total_descuento, 0);
    $('nota').textContent = 'Cuotas impagas cuyo mes de vencimiento ya pasó el día 10, de todos los meses.';
    $('kpis').innerHTML = `<div class="kpi${grupos.length ? ' rojo' : ''}">Alumnos morosos<b>${grupos.length}</b></div>
      <div class="kpi">Cuotas adeudadas<b>${morosas.length}</b></div>
      <div class="kpi${grupos.length ? ' rojo' : ''}">Total adeudado<b>${pesos(totalDeuda)}</b></div>`;
    $('cab').innerHTML = '<tr><th>Alumno</th><th>Cuotas adeudadas</th><th>Total adeudado</th><th></th></tr>';
    const lista = grupos.filter((g) => !q || norm(g.alumno.nombre).includes(q));
    tbody.innerHTML = lista.length ? lista.map((g) => {
      const meses = g.meses.sort().map(mesCorto).join(', ');
      return `<tr><td>${esc(g.alumno.nombre)}${g.alumno.estado ? '' : ' (baja)'}</td>
        <td>${plural(g.n, 'cuota', 'cuotas')}<small>${esc(meses)}</small></td><td>${pesos(g.total)}</td>
        <td class="acc"><a class="btn-sec" style="text-decoration:none" href="https://wa.me/${wa(g.alumno.tel_tutor)}" target="_blank" rel="noopener">WhatsApp</a></td></tr>`;
    }).join('') : `<tr><td colspan="4" class="vacio">${grupos.length ? 'Ningún moroso coincide con la búsqueda.' : 'No hay alumnos morosos. ¡Todo al día!'}</td></tr>`;
  }

  tbody.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const c = cuotas.find((x) => x.id === Number(b.dataset.id)); if (!c) return;
    const pagar = b.dataset.a === 'pagar';
    if (!pagar && !confirm(`¿Desmarcar el pago de ${c.alumno.nombre}? Se elimina el ingreso que se había registrado.`)) return;
    b.disabled = true;
    // El front solo cambia el booleano; los triggers crean o eliminan el ingreso.
    // .eq('pagada', !pagar) evita pisar una cuota que cambió de estado desde otra pestaña.
    const { data, error } = await supabase.from('cuota').update({ pagada: pagar }).eq('id', c.id).eq('pagada', !pagar).select('id');
    if (error) { console.error(error); b.disabled = false; return avisar('No se pudo actualizar el pago. Intentá de nuevo.'); }
    await cargar();
    if (!data.length) avisar('Esa cuota ya había cambiado de estado. Se actualizó la lista.');
  });

  $('chips').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) { filtro = b.dataset.f; render(); } });
  $('buscar').addEventListener('input', render);
  $('mes').addEventListener('change', cargar);
  cargar();
}
