import { supabase } from '../core/supabase.js';
import { requireSession, nombreUsuario } from '../core/auth.js';
import { montarLayout, NAV } from '../core/layout.js';
import { hoyUY, sumarDias, diasEntre, esc } from '../core/util.js';

const session = await requireSession();
if (session) {
  const main = montarLayout('index.html', session);
  document.body.classList.remove('oculto');
  const accesos = NAV.slice(1).map(([h, t]) => `<a class="acceso" href="${h}">${t}</a>`).join('');
  main.innerHTML = `<h1>Hola, ${esc(nombreUsuario(session))}</h1>
    <p class="sub">Esto es lo que necesita tu atención hoy.</p>
    <section id="carnets" aria-live="polite">Cargando carnets…</section>
    <h2 class="mt">Módulos</h2><div class="accesos">${accesos}</div>`;
  cargarCarnets(document.getElementById('carnets'));
}

// Alumnos activos con carnet vencido o que vence dentro del umbral configurado
async function cargarCarnets(el) {
  try {
    const hoy = hoyUY();
    const { data: cfg, error: e1 } = await supabase.from('configuracion').select('dias_alerta_carnet').single();
    if (e1) throw e1;
    const dias = cfg.dias_alerta_carnet;
    const { data, error } = await supabase.from('alumno')
      .select('id,nombre,tel_tutor,f_venc_carnet,categoria(descripcion)')
      .eq('estado', true).lte('f_venc_carnet', sumarDias(hoy, dias)).order('f_venc_carnet');
    if (error) throw error;

    if (!data.length) { el.innerHTML = `<div class="ok">Todos los carnets están al día (alerta a ${dias} días).</div>`; return; }
    const plural = (n) => `${n} día${n === 1 ? '' : 's'}`;
    const filas = data.map((a) => {
      const d = diasEntre(hoy, a.f_venc_carnet);
      const txt = d < 0 ? `Vencido hace ${plural(-d)}` : d === 0 ? 'Vence hoy' : `Vence en ${plural(d)}`;
      return `<div class="fila"><span>${esc(a.nombre)}<small>${esc(a.categoria?.descripcion)} - Tutor: ${esc(a.tel_tutor)} <a href="https://wa.me/${wa(a.tel_tutor)}" target="_blank" rel="noopener">WhatsApp</a></small></span>
        <span class="estado${d >= 0 ? ' pronto' : ''}">${txt}</span></div>`;
    }).join('');
    el.innerHTML = `<div class="alerta"><h2>${data.length} carnet${data.length === 1 ? '' : 's'} de salud vencido${data.length === 1 ? '' : 's'} o por vencer</h2>
      <p class="sub">La alerta avisa ${plural(dias)} antes del vencimiento. <a href="configuracion.html">Cambiar</a></p>${filas}</div>`;
  } catch (e) {
    console.error(e);
    el.innerHTML = '<p class="error">No se pudieron cargar los carnets. Revisá la conexión e intentá de nuevo.</p>';
  }
}
