import { supabase } from '../core/supabase.js';
import { requireSession } from '../core/auth.js';
import { montarLayout } from '../core/layout.js';

const session = await requireSession();
if (session) {
  const main = montarLayout('configuracion.html', session);
  document.body.classList.remove('oculto');
  main.innerHTML = `<h1>Configuración</h1><p class="sub">Ajustes generales del sistema.</p>
    <form id="form" class="form-simple">
      <label>Días de aviso antes del vencimiento del carnet de salud
        <input id="dias" type="number" min="1" max="365" required></label>
      <p class="ayuda">El inicio avisa los carnets que vencen dentro de ese plazo (por ejemplo 10, 15 o 30).</p>
      <label>Monto por defecto de la cuota mensual ($)
        <input id="cuota" type="number" min="1" step="1"></label>
      <p class="ayuda">Se usa al generar cuotas si no escribís un monto. Dejalo vacío para pedirlo siempre.</p>
      <label>Monto por defecto de un cumpleaños ($)
        <input id="cumple" type="number" min="1" step="1"></label>
      <p class="ayuda">Se usa al cargar un cumpleaños si no escribís un monto. Dejalo vacío para pedirlo siempre.</p>
      <p id="msg" role="status"></p><button class="btn" id="guardar">Guardar cambios</button>
    </form>`;
  const dias = main.querySelector('#dias'), cuota = main.querySelector('#cuota'), cumple = main.querySelector('#cumple');
  const msg = main.querySelector('#msg'), btn = main.querySelector('#guardar');
  const decir = (t, ok) => { msg.textContent = t; msg.className = ok ? 'msg-ok' : 'error'; };

  const { data, error } = await supabase.from('configuracion').select('dias_alerta_carnet,monto_cuota_defecto,monto_cumple_defecto').single();
  if (error) { console.error(error); decir('No se pudo cargar la configuración.', false); }
  else { dias.value = data.dias_alerta_carnet; cuota.value = data.monto_cuota_defecto ?? ''; cumple.value = data.monto_cumple_defecto ?? ''; }

  // Vacío = sin monto por defecto (null); si hay valor, entero mayor a 0
  const monto = (el) => el.value.trim() === '' ? null : Number(el.value);
  main.querySelector('#form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = { dias_alerta_carnet: Number(dias.value), monto_cuota_defecto: monto(cuota), monto_cumple_defecto: monto(cumple) };
    const malo = (v) => v !== null && (!Number.isInteger(v) || v < 1);
    if (malo(datos.monto_cuota_defecto) || malo(datos.monto_cumple_defecto)) return decir('Los montos deben ser enteros mayores a 0 (o quedar vacíos).', false);
    btn.disabled = true;
    const { error: e2 } = await supabase.from('configuracion').update(datos).eq('id', 1);
    btn.disabled = false;
    if (e2) { console.error(e2); decir('No se pudo guardar. Revisá los valores (días entre 1 y 365).', false); }
    else decir('Cambios guardados.', true);
  });
}
