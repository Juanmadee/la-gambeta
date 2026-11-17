import { requireSession } from '../core/auth.js';
import { montarLayout } from '../core/layout.js';
import { montarCrud } from '../core/crud.js';

const session = await requireSession();
if (session) {
  const main = montarLayout('profesores.html', session);
  document.body.classList.remove('oculto');
  montarCrud(main, {
    titulo: 'Profesores', singular: 'profesor', plural: 'profesores', tabla: 'profesor', nombre: 'nombre', orden: 'nombre',
    columnas: [
      { t: 'Nombre', f: (r) => r.nombre }, { t: 'Cédula', f: (r) => r.ci }, { t: 'Teléfono', f: (r) => r.telefono },
      { t: 'Titular', f: (r) => (r.titular ? 'Sí' : 'No') }, { t: 'Recibido', f: (r) => (r.esrecibido ? 'Sí' : 'No') },
    ],
    campos: [
      { n: 'nombre', t: 'Nombre completo', req: true, max: 100 },
      { n: 'ci', t: 'Cédula', tipo: 'number', req: true, min: 1 },
      { n: 'f_nacimiento', t: 'Fecha de nacimiento', tipo: 'date', req: true },
      { n: 'telefono', t: 'Teléfono', tipo: 'tel', req: true, max: 13 },
      { n: 'disp_horaria', t: 'Disponibilidad horaria', max: 200 },
      { n: 'titular', t: 'Es titular', tipo: 'checkbox' },
      { n: 'esrecibido', t: 'Está recibido', tipo: 'checkbox' },
    ],
  });
}
