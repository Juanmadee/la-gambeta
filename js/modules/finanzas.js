import { supabase } from '../core/supabase.js';
import { requireSession } from '../core/auth.js';
import { montarLayout } from '../core/layout.js';
import { hoyUY, esc } from '../core/util.js';

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const fmt = (f) => f.split('-').reverse().join('/');
const pesos = (n) => '$ ' + Number(n).toLocaleString('es-UY');
const conSigno = (n) => (n < 0 ? '− ' : '') + pesos(Math.abs(n));
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
// Rango [inicio, inicio del mes siguiente) para filtrar por mes
const rangoMes = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  const sig = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return [`${ym}-01`, sig];
};

// tipo -> [etiqueta, clase del badge, dónde se gestiona (null = se edita acá)]
const TIPOS = {
  cuota: ['Cuota', 'b-ok', 'Cobranzas y pagos'],
  cumple: ['Cumpleaños', 'b-ok', 'Cumpleaños'],
  camp: ['Campamento', 'b-ok', 'Campamentos'],
  puntual: ['Puntual', 'b-pronto', null],
  egreso: ['Egreso', 'b-venc', null],
};
// El tipo sale de qué fila está enlazada al movimiento (no de la descripción)
const tipoDe = (m) => m.cuota.length ? 'cuota' : m.cumpleanos.length ? 'cumple' : m.inscripcion_a_camp.length ? 'camp' : m.ingreso ? 'puntual' : 'egreso';

const session = await requireSession();
if (session) iniciar(session);

async function iniciar(session) {
  const main = montarLayout('finanzas.html', session);
  document.body.classList.remove('oculto');
  main.innerHTML = `
    <div class="cabecera"><h1>Ingresos y egresos</h1><button class="btn" id="nuevo">Nuevo movimiento</button></div>
    <p id="aviso" class="error" role="alert" hidden></p>
    <div class="filtros">
      <label>Mes<input type="month" id="mes" style="width:auto"></label>
      <input type="search" id="buscar" placeholder="Buscar en la descripción" aria-label="Buscar en la descripción">
    </div>
    <div class="kpis" id="kpis"></div>
    <div class="filtros" id="chips"></div>
    <p id="resumen" class="ayuda"></p>
    <div class="tabla-caja"><table class="tabla"><thead><tr><th>Fecha</th><th>Descripción</th><th>Tipo</th><th>Monto</th><th></th></tr></thead><tbody id="filas"></tbody></table></div>
    <dialog id="dlg"><form id="form"></form></dialog>`;

  const $ = (id) => main.querySelector('#' + id);
  const aviso = $('aviso'), tbody = $('filas'), dlg = $('dlg'), form = $('form');
  const avisar = (t) => { aviso.textContent = t; aviso.hidden = !t; };
  let movs = [], filtro = 'todos', editando = null;
  $('mes').value = hoyUY().slice(0, 7);

  async function cargar() {
    const ym = $('mes').value;
    if (!ym) return;
    const [ini, sig] = rangoMes(ym);
    const { data, error } = await supabase.from('ingreso_egreso')
      .select('id,descripcion,monto,ingreso,fecha,cuota(id),cumpleanos(id),inscripcion_a_camp(id)')
      .gte('fecha', ini).lt('fecha', sig)
      .order('fecha', { ascending: false }).order('id', { ascending: false });
    if (error) { console.error(error); return avisar('No se pudieron cargar los movimientos. Revisá la conexión e intentá de nuevo.'); }
    avisar('');
    movs = data.map((m) => ({ ...m, tipo: tipoDe(m) }));
    render();
  }

  function render() {
    const q = norm($('buscar').value);
    const suma = (l, ing) => l.filter((m) => m.ingreso === ing).reduce((s, m) => s + m.monto, 0);
    // KPIs = saldo del mes completo (RF-18), no dependen del chip elegido
    const ing = suma(movs, true), egr = suma(movs, false), saldo = ing - egr;
    $('kpis').innerHTML = `<div class="kpi">Ingresos<b>${pesos(ing)}</b></div>
      <div class="kpi">Egresos<b>${pesos(egr)}</b></div>
      <div class="kpi${saldo < 0 ? ' rojo' : ''}">Saldo del mes<b>${conSigno(saldo)}</b></div>`;
    const cont = (t) => t === 'todos' ? movs.length : movs.filter((m) => m.tipo === t).length;
    $('chips').innerHTML = [['todos', 'Todos'], ['cuota', 'Cuotas'], ['cumple', 'Cumpleaños'], ['camp', 'Campamentos'], ['puntual', 'Puntuales'], ['egreso', 'Egresos']]
      .map(([k, t]) => `<button class="chip" data-f="${k}" aria-pressed="${k === filtro}">${t} (${cont(k)})</button>`).join('');
    const lista = movs.filter((m) => (filtro === 'todos' || m.tipo === filtro) && (!q || norm(m.descripcion).includes(q)));
    $('resumen').textContent = lista.length
      ? `${plural(lista.length, 'movimiento', 'movimientos')}: ingresos ${pesos(suma(lista, true))} - egresos ${pesos(suma(lista, false))}`
      : '';
    tbody.innerHTML = lista.length ? lista.map((m) => {
      const [etq, clase, gestion] = TIPOS[m.tipo];
      const monto = m.ingreso
        ? `<b style="color:var(--verde)">+ ${pesos(m.monto)}</b>` : `<b style="color:var(--rojo)">− ${pesos(m.monto)}</b>`;
      // Los enlazados a cuota/cumpleaños/campamento no se tocan acá: se gestionan desde su módulo
      const acc = gestion
        ? `<small>Se gestiona en ${gestion}</small>`
        : `<button class="btn-sec" data-a="editar" data-id="${m.id}">Editar</button> <button class="btn-peligro" data-a="eliminar" data-id="${m.id}">Eliminar</button>`;
      return `<tr><td>${fmt(m.fecha)}</td><td>${esc(m.descripcion)}</td><td><span class="${clase}">${etq}</span></td><td>${monto}</td><td class="acc">${acc}</td></tr>`;
    }).join('') : `<tr><td colspan="5" class="vacio">${movs.length ? 'No hay movimientos que coincidan con el filtro.' : 'No hay movimientos en este mes.'}</td></tr>`;
  }

  function abrir(m) {
    editando = m?.id ?? null;
    form.innerHTML = `<h2>${editando ? 'Editar movimiento' : 'Nuevo movimiento'}</h2><div class="grid2">
      <label class="ancho">Tipo<select name="tipo" required>
        <option value="ingreso"${m && !m.ingreso ? '' : ' selected'}>Ingreso puntual</option>
        <option value="egreso"${m && !m.ingreso ? ' selected' : ''}>Egreso</option></select></label>
      <label class="ancho">Descripción<input name="descripcion" value="${esc(m?.descripcion)}" required maxlength="200">
        <span class="ayuda">Ej.: "Matrícula - Nombre del alumno", "Sueldo - Profesor", "Pago de cancha"</span></label>
      <label>Monto ($)<input name="monto" type="number" min="1" step="1" value="${esc(m?.monto)}" required></label>
      <label>Fecha<input name="fecha" type="date" value="${esc(m?.fecha ?? hoyUY())}" required></label></div>
      <p id="dlg-error" class="error" role="alert" hidden></p>
      <div class="acciones"><button type="button" class="btn-sec" data-cerrar>Cancelar</button><button class="btn" id="guardar">Guardar</button></div>`;
    dlg.showModal();
  }

  form.addEventListener('click', (e) => { if (e.target.closest('[data-cerrar]')) dlg.close(); });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form), btn = form.querySelector('#guardar'), err = form.querySelector('#dlg-error');
    const falla = (t) => { err.textContent = t; err.hidden = false; };
    const monto = Number(fd.get('monto')), descripcion = fd.get('descripcion').trim(), fecha = fd.get('fecha');
    if (!descripcion) return falla('Ingresá una descripción.');
    if (!Number.isInteger(monto) || monto < 1) return falla('El monto debe ser un número entero mayor a 0.');
    const datos = { descripcion, monto, ingreso: fd.get('tipo') === 'ingreso', fecha };
    btn.disabled = true;
    const { error } = editando
      ? await supabase.from('ingreso_egreso').update(datos).eq('id', editando)
      : await supabase.from('ingreso_egreso').insert(datos);
    btn.disabled = false;
    if (error) { console.error(error); return falla('No se pudo guardar. Revisá los datos e intentá de nuevo.'); }
    dlg.close();
    $('mes').value = fecha.slice(0, 7);   // se muestra el mes del movimiento guardado
    cargar();
  });

  tbody.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const m = movs.find((x) => x.id === Number(b.dataset.id));
    if (!m || TIPOS[m.tipo][2]) return;   // seguro: nunca tocar movimientos enlazados
    if (b.dataset.a === 'editar') return abrir(m);
    if (!confirm(`¿Eliminar "${m.descripcion}" (${pesos(m.monto)})? Esta acción no se puede deshacer.`)) return;
    const { error } = await supabase.from('ingreso_egreso').delete().eq('id', m.id);
    if (error) { console.error(error); return avisar('No se pudo eliminar el movimiento.'); }
    cargar();
  });

  $('nuevo').addEventListener('click', () => abrir(null));
  $('chips').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) { filtro = b.dataset.f; render(); } });
  $('buscar').addEventListener('input', render);
  $('mes').addEventListener('change', cargar);
  cargar();
}
