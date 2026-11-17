import { supabase } from '../core/supabase.js';

const { data: { session } } = await supabase.auth.getSession();
if (session) location.replace('index.html');

const f = document.getElementById('form'), err = document.getElementById('error'), btn = document.getElementById('enviar');
f.addEventListener('submit', async (e) => {
  e.preventDefault(); err.hidden = true; btn.disabled = true;
  const { error } = await supabase.auth.signInWithPassword({ email: f.email.value.trim(), password: f.clave.value });
  if (error) {
    err.textContent = error.status === 400
      ? 'Correo o contraseña incorrectos. Revisá los datos e intentá de nuevo.'
      : 'No se pudo conectar. Revisá tu conexión e intentá de nuevo.';
    err.hidden = false; btn.disabled = false; return;
  }
  location.replace('index.html');
});
