// Fecha de hoy en Uruguay como 'YYYY-MM-DD' (no depende de la zona del dispositivo)
export const hoyUY = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Montevideo' });
export const sumarDias = (f, n) => new Date(Date.parse(f) + n * 864e5).toISOString().slice(0, 10);
export const diasEntre = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
// Escapa texto de la BD antes de meterlo en innerHTML (evita XSS)
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
