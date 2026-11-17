import { logout, nombreUsuario } from './auth.js';

export const NAV = [
  ['index.html', 'Inicio'], ['alumnos.html', 'Alumnos'], ['espera.html', 'Lista de espera'],
  ['cuotas.html', 'Generar cuotas'], ['cobranzas.html', 'Cobranzas y pagos'], ['profesores.html', 'Profesores'],
  ['categorias.html', 'Categorías'], ['campamentos.html', 'Campamentos'], ['cumpleanos.html', 'Cumpleaños'],
  ['finanzas.html', 'Ingresos y egresos'], ['configuracion.html', 'Configuración'],
];

// Dibuja menú + cabecera en #app y devuelve el <main> donde va el contenido de cada página
export function montarLayout(activo, session) {
  const links = NAV.map(([h, t]) => `<a href="${h}"${h === activo ? ' aria-current="page"' : ''}>${t}</a>`).join('');
  document.getElementById('app').innerHTML = `
    <div class="app">
      <aside class="nav" id="nav">
        <div class="marca"><span class="logo-caja"><img src="assets/logo.png" alt="" width="40" height="40"></span>
          <span>La Gambeta<small>Escuela de fútbol Paysandú</small></span></div>
        <nav>${links}</nav>
        <button class="salir" id="salir">Cerrar sesión</button>
      </aside>
      <div class="main">
        <header class="top"><button class="menu-btn" id="menu" aria-controls="nav" aria-expanded="false">Menú</button>
          <span class="usuario" id="usuario"></span></header>
        <main id="contenido" tabindex="-1"></main>
      </div>
    </div>`;
  document.getElementById('usuario').textContent = nombreUsuario(session);
  document.getElementById('salir').addEventListener('click', logout);
  const nav = document.getElementById('nav'), menu = document.getElementById('menu');
  menu.addEventListener('click', () => menu.setAttribute('aria-expanded', nav.classList.toggle('abierto')));
  return document.getElementById('contenido');
}
