/** Portable alpha masks: pixels, not a dependency on the receiver's installed fonts. */
export interface AlphaMask { png: string; text?: string; name?: string }
export function readAlphaMask(value: unknown): AlphaMask | undefined {
  if (!value || typeof value !== 'object') return;
  const v = value as Record<string, unknown>;
  if (typeof v.png !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v.png) || v.png.length > 8_000_000) return;
  return { png: v.png, ...(typeof v.text === 'string' ? { text: v.text.slice(0, 500) } : {}), ...(typeof v.name === 'string' ? { name: v.name.slice(0, 200) } : {}) };
}
export async function textAlphaMask(text: string, aspect: number): Promise<AlphaMask> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(Math.min(2048, 2048 * aspect)));
  canvas.height = Math.max(1, Math.round(Math.min(2048, 2048 / aspect)));
  const ctx = canvas.getContext('2d')!;
  await document.fonts.ready;
  const lines = text.slice(0, 500).split('\n');
  ctx.font = 'bold 100px sans-serif';
  const width = Math.max(1, ...lines.map(line => ctx.measureText(line).width));
  const size = Math.min(canvas.width * .9 / width * 100, canvas.height * .9 / (lines.length * 1.2));
  ctx.font = `bold ${size}px sans-serif`; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lines.forEach((line, i) => ctx.fillText(line, canvas.width / 2, canvas.height / 2 + (i - (lines.length - 1) / 2) * size * 1.2));
  return { png: canvas.toDataURL('image/png'), text: text.slice(0, 500), name: 'Text silhouette' };
}
/** Preserve imported transparency; optionally remove a plain light background. */
export async function imageAlphaMask(file: File, removeLight: boolean, threshold: number): Promise<AlphaMask> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image for the mask.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement('canvas'), ratio = Math.min(1, 2048 / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * ratio)); canvas.height = Math.max(1, Math.round(image.height * ratio));
    const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      if (removeLight && Math.min(pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]) >= threshold) pixels.data[i + 3] = 0;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    return { png: canvas.toDataURL('image/png'), name: file.name };
  } finally { URL.revokeObjectURL(url); }
}
