import type { AlphaMask } from './alpha';
/** Inference stays in this editor's worker. Only the completed mask enters the show. */
export async function subjectAlphaMask(file: File, signal: AbortSignal): Promise<AlphaMask> {
  const url = URL.createObjectURL(file), image = new Image();
  let bitmap: ImageBitmap;
  try { image.src = url; await image.decode(); bitmap = await createImageBitmap(image); }
  finally { URL.revokeObjectURL(url); }
  if (signal.aborted) { bitmap.close(); throw new DOMException('Canceled', 'AbortError'); }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./subject-worker.ts', import.meta.url), { type: 'module' });
    let transferred = false;
    const stop = () => { if (!transferred) bitmap.close(); worker.terminate(); signal.removeEventListener('abort', cancel); clearTimeout(timeout); };
    const cancel = () => { stop(); reject(new DOMException('Canceled', 'AbortError')); };
    const timeout = setTimeout(() => { stop(); reject(new Error('Subject detection timed out. Try a smaller or clearer image.')); }, 120000);
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) { cancel(); return; }
    worker.onerror = event => { stop(); reject(new Error(event.message || 'Cannot start subject detection.')); };
    worker.onmessage = async event => {
      stop();
      if (event.data.error) { reject(new Error(event.data.error)); return; }
      const reader = new FileReader(); reader.onerror = () => reject(new Error('Cannot encode the subject mask.'));
      reader.onload = () => resolve({ png: String(reader.result), name: file.name }); reader.readAsDataURL(event.data.blob);
    };
    worker.postMessage({ image: bitmap, base: new URL('vendor/segmentation/', document.baseURI).href }, [bitmap]); transferred = true;
  });
}
