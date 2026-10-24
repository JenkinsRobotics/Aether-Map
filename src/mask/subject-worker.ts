import { env, InferenceSession, Tensor } from 'onnxruntime-web/wasm';
// One job per dedicated worker. Terminating it cancels inference and frees its heap.
self.onmessage = async (event: MessageEvent<{ image: ImageBitmap; base: string }>) => {
  let session: InferenceSession | undefined, image: ImageBitmap | undefined;
  try {
    env.wasm.numThreads = 1; env.wasm.wasmPaths = event.data.base;
    session = await InferenceSession.create(`${event.data.base}u2netp.onnx`, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    image = event.data.image;
    const input = new OffscreenCanvas(320, 320), ctx = input.getContext('2d')!;
    ctx.drawImage(image, 0, 0, 320, 320);
    const rgba = ctx.getImageData(0, 0, 320, 320).data, n = 320 * 320, values = new Float32Array(3 * n);
    let max = 1; for (let i = 0; i < rgba.length; i += 4) max = Math.max(max, rgba[i], rgba[i + 1], rgba[i + 2]);
    const mean = [.485, .456, .406], deviation = [.229, .224, .225];
    for (let c = 0; c < 3; c++) for (let i = 0; i < n; i++) values[c * n + i] = (rgba[i * 4 + c] / max - mean[c]) / deviation[c];
    const output = await session.run({ [session.inputNames[0]]: new Tensor('float32', values, [1, 3, 320, 320]) });
    const prediction = output[session.outputNames[0]].data as Float32Array;
    let low = Infinity, high = -Infinity;
    for (let i = 0; i < n; i++) { low = Math.min(low, prediction[i]); high = Math.max(high, prediction[i]); }
    if (!Number.isFinite(high - low) || high - low < 1e-6) throw new Error('No distinct subject was found. Try an image with a clearer foreground.');
    const pixels = ctx.createImageData(320, 320);
    for (let i = 0; i < n; i++) { pixels.data[i * 4] = pixels.data[i * 4 + 1] = pixels.data[i * 4 + 2] = 255; pixels.data[i * 4 + 3] = Math.round(255 * (prediction[i] - low) / (high - low)); }
    ctx.putImageData(pixels, 0, 0);
    const ratio = Math.min(1, 2048 / Math.max(image.width, image.height));
    const result = new OffscreenCanvas(Math.max(1, Math.round(image.width * ratio)), Math.max(1, Math.round(image.height * ratio))), target = result.getContext('2d')!;
    target.drawImage(input, 0, 0, result.width, result.height);
    // Keep the input's alpha too: a model must not fill deliberately transparent holes.
    target.globalCompositeOperation = 'destination-in'; target.drawImage(image, 0, 0, result.width, result.height);
    self.postMessage({ blob: await result.convertToBlob({ type: 'image/png' }) });
  } catch (e) { self.postMessage({ error: (e as Error).message || 'Subject detection failed.' }); }
  finally { image?.close(); await session?.release(); }
};
