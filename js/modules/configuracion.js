import { supabase } from '../core/supabase.js';
import { requireSession } from '../core/auth.js';
import { montarLayout } from '../core/layout.js';
import { esc } from '../core/util.js';

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
    </form>
    <h2 class="mt">Cambiar contraseña</h2>
    <form id="form-clave" class="form-simple">
      <input type="email" autocomplete="username" value="${esc(session.user.email)}" hidden>
      <label>Contraseña actual<input id="clave-actual" type="password" autocomplete="current-password" required></label>
      <label>Nueva contraseña<input id="clave-nueva" type="password" autocomplete="new-password" minlength="8" required></label>
      <label>Repetir la nueva contraseña<input id="clave-repetir" type="password" autocomplete="new-password" minlength="8" required></label>
      <label class="check"><input type="checkbox" id="clave-ver"> Mostrar contraseñas</label>
      <p class="ayuda">Mínimo 8 caracteres. Al cambiarla se cierra la sesión en los demás dispositivos.</p>
      <p id="msg-clave" role="status"></p><button class="btn" id="cambiar">Cambiar contraseña</button>
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

  // ---------- Cambiar contraseña ----------
  const q = (id) => main.querySelector('#' + id);
  const decirClave = (t, ok) => { q('msg-clave').textContent = t; q('msg-clave').className = ok ? 'msg-ok' : 'error'; };
  const CAMPOS = ['clave-actual', 'clave-nueva', 'clave-repetir'];
  q('clave-ver').addEventListener('change', (e) => CAMPOS.forEach((id) => { q(id).type = e.target.checked ? 'text' : 'password'; }));

  const errorClave = (e) => {
    const t = `${e.code ?? ''} ${e.message ?? ''}`.toLowerCase();
    if (t.includes('same_password') || t.includes('different from the old')) return 'La nueva contraseña tiene que ser distinta de la actual.';
    if (t.includes('weak') || t.includes('at least')) return 'La contraseña es muy débil. Usá más caracteres, mezclando letras, números y símbolos.';
    return 'No se pudo cambiar la contraseña. Intentá de nuevo.';
  };

  q('form-clave').addEventListener('submit', async (e) => {
    e.preventDefault();
    const actual = q('clave-actual').value, nueva = q('clave-nueva').value, otra = q('clave-repetir').value, b = q('cambiar');
    if (nueva.length < 8) return decirClave('La nueva contraseña debe tener al menos 8 caracteres.', false);
    if (nueva !== otra) return decirClave('Las contraseñas nuevas no coinciden.', false);
    if (nueva === actual) return decirClave('La nueva contraseña tiene que ser distinta de la actual.', false);
    b.disabled = true; decirClave('', true);
    // Re-autenticación: confirma que quien la cambia conoce la actual (y renueva la sesión)
    const { error: eAuth } = await supabase.auth.signInWithPassword({ email: session.user.email, password: actual });
    if (eAuth) {
      console.error(eAuth); b.disabled = false;
      return decirClave(eAuth.status === 400 ? 'La contraseña actual no es correcta.' : 'No se pudo verificar la contraseña actual. Revisá tu conexión e intentá de nuevo.', false);
    }
    const { error: eUp } = await supabase.auth.updateUser({ password: nueva });
    b.disabled = false;
    if (eUp) { console.error(eUp); return decirClave(errorClave(eUp), false); }
    // Cierra las sesiones de otros dispositivos (esta sigue abierta)
    const { error: eOut } = await supabase.auth.signOut({ scope: 'others' });
    if (eOut) console.error(eOut);
    CAMPOS.forEach((id) => { q(id).value = ''; });
    decirClave('Contraseña cambiada correctamente.', true);
  });
}
