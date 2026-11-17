import { supabase } from '../core/supabase.js';
import { requireSession } from '../core/auth.js';
import { montarLayout } from '../core/layout.js';
import { esc } from '../core/util.js';

const wa = (t) => { const d = t.replace(/\D/g, ''); return d.startsWith('598') ? d : '598' + d.replace(/^0/, ''); };

const session = await requireSession();
if (session) iniciar(session);

async function iniciar(session) {
  const main = montarLayout('espera.html', session);
  document.body.classList.remove('oculto');
  main.innerHTML = `
    <div class="cabecera"><h1>Lista de espera</h1><button class="btn" id="nuevo">Anotar aspirante</button></div>
    <p id="aviso" class="error" role="alert" hidden></p>
    <div class="kpis" id="kpis"></div><div class="filtros" id="chips"></div>
    <div class="tabla-caja"><table class="tabla"><thead><tr><th>Puesto</th><th>Aspirante</th><th>Categoría</th><th>Tutor</th><th></th></tr></thead><tbody id="filas"></tbody></table></div>
    <dialog id="dlg"><form id="form"></form></dialog>`;
  const $ = (id) => main.querySelector('#' + id);
  const aviso = $('aviso'), tbody = $('filas'), dlg = $('dlg'), form = $('form');
  const avisar = (t) => { aviso.textContent = t; aviso.hidden = !t; };
  let espera = [], cats = [], catSel = 0, editando = null;

  async function cargar() {
    const [esp, cs, al] = await Promise.all([
      supabase.from('alumno_en_espera').select('id,nombre,tel_tutor,edad,categoria_id').order('id'),   // el id marca el orden de llegada
      supabase.from('categoria').select('id,descripcion,cupo').order('descripcion'),
      supabase.from('alumno').select('categoria_id').eq('estado', true),
    ]);
    if (esp.error || cs.error || al.error) { console.error(esp.error || cs.error || al.error); return avisar('No se pudo cargar la lista de espera. Revisá la conexión e intentá de nuevo.'); }
    avisar(''); espera = esp.data;
    cats = cs.data.map((c) => ({ ...c, libres: c.cupo - al.data.filter((a) => a.categoria_id === c.id).length }));
    render();
  }

  function render() {
    const cat = (id) => cats.find((c) => c.id === id);
    const cont = {}, puesto = new Map();
    espera.forEach((e) => { cont[e.categoria_id] = (cont[e.categoria_id] || 0) + 1; puesto.set(e.id, cont[e.categoria_id]); });
    const top = Object.keys(cont).sort((a, b) => cont[b] - cont[a])[0];
    const libres = cats.reduce((s, c) => s + Math.max(0, c.libres), 0);
    $('kpis').innerHTML = `<div class="kpi">En espera<b>${espera.length}</b></div>
      <div class="kpi">Más demandada<b>${top ? esc(cat(Number(top)).descripcion) : '-'}</b></div>
      <div class="kpi">Cupos libres hoy<b>${libres}</b></div>`;
    $('chips').innerHTML = [{ id: 0, descripcion: 'Todas' }, ...cats].map((k) =>
      `<button class="chip" data-cat="${k.id}" aria-pressed="${k.id === catSel}">${esc(k.descripcion)}${k.id ? ` (${cont[k.id] || 0})` : ''}</button>`).join('');
    const lista = espera.filter((e) => !catSel || e.categoria_id === catSel);
    tbody.innerHTML = lista.length ? lista.map((e) => {
      const c = cat(e.categoria_id);
      return `<tr><td>${puesto.get(e.id)}</td><td>${esc(e.nombre)}<small>${e.edad} años</small></td>
        <td>${esc(c?.descripcion)} ${c?.libres > 0 ? '<span class="b-ok">¡Hay cupo!</span>' : ''}</td>
        <td>${esc(e.tel_tutor)}<small><a href="https://wa.me/${wa(e.tel_tutor)}" target="_blank" rel="noopener">WhatsApp</a></small></td>
        <td class="acc"><button class="btn" data-a="promover" data-id="${e.id}">Promover</button>
          <button class="btn-sec" data-a="editar" data-id="${e.id}">Editar</button>
          <button class="btn-peligro" data-a="quitar" data-id="${e.id}">Quitar</button></td></tr>`;
    }).join('') : '<tr><td colspan="5" class="vacio">No hay aspirantes en la lista de espera.</td></tr>';
  }

  function abrir(e) {
    editando = e?.id ?? null;
    form.innerHTML = `<h2>${editando ? 'Editar aspirante' : 'Anotar aspirante'}</h2><div class="grid2">
      <label class="ancho">Nombre del aspirante<input name="nombre" value="${esc(e?.nombre)}" required maxlength="100"></label>
      <label>Teléfono del tutor<input name="tel_tutor" type="tel" value="${esc(e?.tel_tutor)}" required maxlength="13"></label>
      <label>Edad<input name="edad" type="number" min="1" max="18" value="${esc(e?.edad)}" required></label>
      <label class="ancho">Categoría deseada<select name="categoria_id" required><option value="">Elegí una categoría</option>${cats.map((k) => `<option value="${k.id}"${k.id === e?.categoria_id ? ' selected' : ''}>${esc(k.descripcion)}</option>`).join('')}</select></label></div>
      <p id="dlg-error" class="error" role="alert" hidden></p>
      <div class="acciones"><button type="button" class="btn-sec" data-cerrar>Cancelar</button><button class="btn" id="guardar">Guardar</button></div>`;
    dlg.showModal();
  }

  form.addEventListener('click', (e) => { if (e.target.closest('[data-cerrar]')) dlg.close(); });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form), btn = form.querySelector('#guardar'), err = form.querySelector('#dlg-error');
    const datos = { nombre: fd.get('nombre').trim(), tel_tutor: fd.get('tel_tutor').trim(), edad: Number(fd.get('edad')), categoria_id: Number(fd.get('categoria_id')) };
    btn.disabled = true;
    const { error } = editando
      ? await supabase.from('alumno_en_espera').update(datos).eq('id', editando)
      : await supabase.from('alumno_en_espera').insert(datos);
    btn.disabled = false;
    if (error) { console.error(error); err.textContent = 'No se pudo guardar. Revisá los datos e intentá de nuevo.'; err.hidden = false; return; }
    dlg.close(); cargar();
  });

  $('nuevo').addEventListener('click', () => abrir(null));
  $('chips').addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (b) { catSel = Number(b.dataset.cat); render(); } });
  tbody.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const asp = espera.find((x) => x.id === Number(b.dataset.id));
    if (b.dataset.a === 'promover') { location.href = `alumnos.html?promover=${asp.id}`; return; }   // el alta se completa en el formulario de alumnos
    if (b.dataset.a === 'editar') return abrir(asp);
    if (!confirm(`¿Quitar a ${asp.nombre} de la lista de espera?`)) return;
    const { error } = await supabase.from('alumno_en_espera').delete().eq('id', asp.id);
    if (error) return avisar('No se pudo quitar al aspirante.');
    cargar();
  });
  cargar();
}
