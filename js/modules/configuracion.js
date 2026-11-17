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
      <p id="msg" role="status"></p><button class="btn" id="guardar">Guardar cambios</button>
    </form>`;
  const dias = main.querySelector('#dias'), msg = main.querySelector('#msg'), btn = main.querySelector('#guardar');
  const decir = (t, ok) => { msg.textContent = t; msg.className = ok ? 'msg-ok' : 'error'; };

  const { data, error } = await supabase.from('configuracion').select('dias_alerta_carnet').single();
  if (error) { console.error(error); decir('No se pudo cargar la configuración.', false); }
  else dias.value = data.dias_alerta_carnet;

  main.querySelector('#form').addEventListener('submit', async (e) => {
    e.preventDefault(); btn.disabled = true;
    const { error: e2 } = await supabase.from('configuracion').update({ dias_alerta_carnet: Number(dias.value) }).eq('id', 1);
    btn.disabled = false;
    if (e2) { console.error(e2); decir('No se pudo guardar. Revisá que el valor esté entre 1 y 365.', false); }
    else decir('Cambios guardados.', true);
  });
}
