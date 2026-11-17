import { supabase } from './supabase.js';
import { esc } from './util.js';

const ERRORES = {
  '23505': 'Ya existe un registro con ese dato único (por ejemplo, la cédula).',
  '23503': 'No se puede eliminar: tiene datos asociados.',
  '23514': 'Algún dato no cumple las reglas (revisá fechas, horas y cupos).',
};
const msg = (e) => ERRORES[e.code] || 'No se pudo completar la acción. Intentá de nuevo.';

// Pantalla ABM genérica: tabla + formulario en <dialog>. Se reutiliza en cada módulo simple.
export async function montarCrud(main, cfg) {
  main.innerHTML = `
    <div class="cabecera"><h1>${cfg.titulo}</h1><button class="btn" id="nuevo">Nuevo ${cfg.singular}</button></div>
    <p id="aviso" class="error" role="alert" hidden></p>
    <div class="tabla-caja"><table class="tabla"><thead><tr>${cfg.columnas.map((c) => `<th>${c.t}</th>`).join('')}<th></th></tr></thead>
      <tbody id="filas"></tbody></table></div>
    <dialog id="dlg"><form id="form"><h2 id="dlg-t"></h2><div id="campos" style="display:grid;gap:14px"></div>
      <p id="dlg-error" class="error" role="alert" hidden></p>
      <div class="acciones"><button type="button" class="btn-sec" id="cancelar">Cancelar</button><button class="btn" id="guardar">Guardar</button></div></form></dialog>`;
  const $ = (id) => main.querySelector('#' + id);
  const tbody = $('filas'), dlg = $('dlg'), form = $('form'), aviso = $('aviso'), dlgError = $('dlg-error'), guardar = $('guardar');

  const opciones = {};
  for (const c of cfg.campos) if (c.opciones) opciones[c.n] = await c.opciones();

  const campoHtml = (c, v) => {
    if (c.tipo === 'checkbox') return `<label class="check"><input type="checkbox" name="${c.n}"${v ? ' checked' : ''}> ${c.t}</label>`;
    if (c.opciones) {
      const ops = opciones[c.n].map((o) => `<option value="${esc(o.v)}"${String(o.v) === String(v) ? ' selected' : ''}>${esc(o.t)}</option>`).join('');
      return `<label>${c.t}<select name="${c.n}" required><option value="">Elegí una opción</option>${ops}</select></label>`;
    }
    return `<label>${c.t}<input name="${c.n}" type="${c.tipo || 'text'}"${c.req ? ' required' : ''}${c.max ? ` maxlength="${c.max}"` : ''}${c.min != null ? ` min="${c.min}"` : ''} value="${esc(v)}"></label>`;
  };

  let filas = new Map(), editando = null;
  const cargar = async () => {
    const { data, error } = await supabase.from(cfg.tabla).select(cfg.select || '*').order(cfg.orden || 'id');
    if (error) { console.error(error); aviso.textContent = 'No se pudieron cargar los datos. Revisá la conexión e intentá de nuevo.'; aviso.hidden = false; return; }
    aviso.hidden = true; filas = new Map(data.map((r) => [r.id, r]));
    tbody.innerHTML = data.length
      ? data.map((r) => `<tr>${cfg.columnas.map((c) => `<td>${esc(c.f(r))}</td>`).join('')}<td class="acc">
          <button class="btn-sec" data-a="editar" data-id="${r.id}">Editar</button>
          <button class="btn-peligro" data-a="eliminar" data-id="${r.id}">Eliminar</button></td></tr>`).join('')
      : `<tr><td colspan="${cfg.columnas.length + 1}" class="vacio">Todavía no hay ${cfg.plural}. Usá el botón "Nuevo ${cfg.singular}" para cargar el primero.</td></tr>`;
  };

  const abrir = (fila) => {
    editando = fila?.id ?? null; dlgError.hidden = true;
    $('dlg-t').textContent = (fila ? 'Editar ' : 'Nuevo ') + cfg.singular;
    $('campos').innerHTML = cfg.campos.map((c) => campoHtml(c, fila?.[c.n])).join('');
    dlg.showModal();
  };

  $('nuevo').addEventListener('click', () => abrir(null));
  $('cancelar').addEventListener('click', () => dlg.close());
  tbody.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const fila = filas.get(Number(b.dataset.id));
    if (b.dataset.a === 'editar') return abrir(fila);
    if (!confirm(`¿Eliminar ${cfg.singular} "${fila[cfg.nombre]}"?`)) return;
    const { error } = await supabase.from(cfg.tabla).delete().eq('id', fila.id);
    if (error) { aviso.textContent = msg(error); aviso.hidden = false; return; }
    cargar();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form), datos = {};
    for (const c of cfg.campos) {
      const v = fd.get(c.n);
      datos[c.n] = c.tipo === 'checkbox' ? v !== null : v === '' ? null : (c.tipo === 'number' || c.opciones) ? Number(v) : v;
    }
    guardar.disabled = true;
    const { error } = editando
      ? await supabase.from(cfg.tabla).update(datos).eq('id', editando)
      : await supabase.from(cfg.tabla).insert(datos);
    guardar.disabled = false;
    if (error) { dlgError.textContent = msg(error); dlgError.hidden = false; return; }
    dlg.close(); cargar();
  });

  cargar();
}
