import { supabase } from './supabase.js';

// Guard de UX: sin sesión redirige al login. La protección real de los datos es RLS.
export async function requireSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { location.replace('login.html'); return null; }
  return session;
}
export const nombreUsuario = (s) => s.user.user_metadata?.nombre || s.user.email.split('@')[0];
export async function logout() { await supabase.auth.signOut(); location.replace('login.html'); }
