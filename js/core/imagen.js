const OK = ['image/jpeg', 'image/png', 'image/webp'];
export const extension = (t) => ({ 'image/png': 'png', 'image/webp': 'webp' }[t] || 'jpg');

// Si la imagen pesa más de maxKB la re-codifica como JPEG bajando calidad y tamaño hasta que entre.
export async function comprimir(file, maxKB = 100) {
  if (file.size <= maxKB * 1024 && OK.includes(file.type)) return file;
  const bmp = await createImageBitmap(file);
  let escala = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  for (let i = 0; i < 6; i++, escala *= 0.75) {
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * escala); c.height = Math.round(bmp.height * escala);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    for (let q = 0.8; q >= 0.4; q -= 0.1) {
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', q));
      if (blob && blob.size <= maxKB * 1024) return blob;
    }
  }
  throw new Error('No se pudo comprimir la imagen');
}
