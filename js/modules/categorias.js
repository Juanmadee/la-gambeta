import { supabase } from '../core/supabase.js';
import { requireSession } from '../core/auth.js';
import { montarLayout } from '../core/layout.js';
import { montarCrud } from '../core/crud.js';

const session = await requireSession();
if (session) {
  const main = montarLayout('categorias.html', session);
  document.body.classList.remove('oculto');
  const hora = (h) => h.slice(0, 5);
  montarCrud(main, {
    titulo: 'Categorías', singular: 'categoría', plural: 'categorías', tabla: 'categoria', nombre: 'descripcion', orden: 'descripcion',
    select: 'id,descripcion,dias,hora_inicio,hora_fin,cupo,profesor_id,profesor(nombre)',
    columnas: [
      { t: 'Categoría', f: (r) => r.descripcion }, { t: 'Días', f: (r) => r.dias },
      { t: 'Horario', f: (r) => `${hora(r.hora_inicio)} a ${hora(r.hora_fin)}` },
      { t: 'Cupo', f: (r) => r.cupo }, { t: 'Profesor', f: (r) => r.profesor?.nombre },
    ],
    campos: [
      { n: 'descripcion', t: 'Descripción (ej. Sub-9)', req: true, max: 200 },
      { n: 'dias', t: 'Días (ej. Martes y jueves)', req: true, max: 100 },
      { n: 'hora_inicio', t: 'Hora de inicio', tipo: 'time', req: true },
      { n: 'hora_fin', t: 'Hora de fin', tipo: 'time', req: true },
      { n: 'cupo', t: 'Cupo de alumnos', tipo: 'number', req: true, min: 1 },
      { n: 'profesor_id', t: 'Profesor a cargo', opciones: async () => {
          const { data } = await supabase.from('profesor').select('id,nombre').order('nombre');
          return (data || []).map((p) => ({ v: p.id, t: p.nombre }));
        } },
    ],
  });
}
