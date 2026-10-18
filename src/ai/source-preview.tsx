import { createRoot } from 'react-dom/client';
import { agentCanvasImage, agentToolContent } from '@aether/ui/AgentToolResult';
import { ShaderMedia } from '../features/ShaderMedia';
import { PreviewQuality } from '../features/PreviewQuality';
import { ModulationContext } from '../features/ModulationContext';
import { DEFAULT_LFOS } from '../features/types';
import type { MapShow } from '../document';
import { visualSource } from '../media-pool';

/** The real shader renderer, mounted temporarily at an explicit time. This is
 * source proof, not a pretend screenshot of the DOM/video scene compositor. */
export async function sourcePreview(show: MapShow, clipID: string, timeS: number, signal: AbortSignal) {
  signal.throwIfAborted();
  const clip = show.visuals?.find(v => v.id === clipID);
  if (!clip) throw Error('Visual not found.');
  const source = visualSource(show, clip).shader;
  const shader = source ? { ...source, modulation: Object.fromEntries(Object.entries(source.modulation ?? {}).filter(([,value]) => value.source !== 'audio' && value.source !== 'midi')) } : undefined;
  if (!shader) throw Error('Source preview currently requires a gallery/shader visual. Use composition verification for other sources.');
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:640px;height:360px;pointer-events:none';
  host.setAttribute('aria-hidden', 'true');
  document.body.append(host);
  const root = createRoot(host);
  let frame = 0, timeout: ReturnType<typeof setTimeout> | undefined;
  let onAbort = () => {};
  try {
    root.render(<ModulationContext.Provider value={{lfos:show.lfos ?? DEFAULT_LFOS,timeS}}><PreviewQuality.Provider value={{scale:1,maxPixelCount:640*360}}><ShaderMedia shader={shader} snapshot timeS={timeS} placeholder style={{width:640,height:360}}/></PreviewQuality.Provider></ModulationContext.Provider>);
    const canvas = await new Promise<HTMLCanvasElement>((resolve, reject) => {
      let frames = 0;
      onAbort = () => reject(signal.reason ?? Error('Preview cancelled.'));
      signal.addEventListener('abort', onAbort, {once:true});
      timeout = setTimeout(() => reject(Error('Shader preview timed out.')), 10000);
      const capture = () => {
        const canvas = host.querySelector('canvas');
        if (host.textContent?.includes('unavailable')) return reject(Error('Shader unavailable on this device.'));
        if (++frames >= 6 && canvas && canvas.width > 1 && canvas.height > 1) return resolve(canvas);
        frame = requestAnimationFrame(capture);
      };
      frame = requestAnimationFrame(capture);
    });
    signal.throwIfAborted();
    return agentToolContent({changed:false,kind:'shader_source',clip_id:clipID,time_s:timeS,
      includes:'Actual shader source at the supplied source time.',excludes:['mapping','clip effects','other layers','media','live audio/MIDI modulation']}, agentCanvasImage(canvas,signal));
  } finally {
    cancelAnimationFrame(frame); clearTimeout(timeout); signal.removeEventListener('abort',onAbort);
    root.unmount(); host.remove();
  }
}
