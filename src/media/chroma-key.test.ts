import { describe, it, expect } from 'vitest';
import { emptyShow, newSurface } from '../document';
import { parseShow, serializeShow } from '../show-file';
import { normalizeMediaPool, placePoolAsset, visualSource } from '../media-pool';
import { DEFAULT_CHROMA_KEY, readChromaKey } from './chroma-key';

describe('green-screen source settings', () => {
  it('bounds untrusted settings and requires explicit enabling', () => {
    expect(readChromaKey({ color: 'red;bad()', similarity: -1, softness: Infinity, spill: 4 })).toEqual({ ...DEFAULT_CHROMA_KEY, enabled: false, similarity: 0, spill: 1 });
    expect(readChromaKey(null)).toBeUndefined();
  });
  it('survives save/reopen for pool, surface and clip sources and preserves inheritance', () => {
    let show = normalizeMediaPool(emptyShow());
    const source = { mediaId: 'video', rect: [0,0,1920,1080] as [number,number,number,number], chromaKey: { ...DEFAULT_CHROMA_KEY, color: '#0000ff' } };
    show.media = [{ id:'video', file:'video.mp4', kind:'video', name:'Skull', width:1920, height:1080, bytes:200, duration:20 }];
    show.pool = [{ id:'skull', name:'Skull', source }];
    const surface = newSurface(show.output, 0); surface.source = source; show.scenes[0].surfaces = [surface];
    show = placePoolAsset(show, 'skull', show.tracks![0].id, 0);
    show.visuals!.push({ ...show.visuals![0], id:'override', source:{ ...source, chromaKey:{ ...DEFAULT_CHROMA_KEY, similarity:.4 } } });
    const reopened = parseShow(serializeShow(show));
    expect(reopened.pool![0].source.chromaKey).toEqual(source.chromaKey);
    expect(reopened.scenes[0].surfaces[0].source.chromaKey).toEqual(source.chromaKey);
    expect(visualSource(reopened, reopened.visuals!.find(v => v.id === 'override')!).chromaKey?.similarity).toBe(.4);
    const inherited = reopened.visuals!.find(v => v.assetID === 'skull' && !v.source)!;
    reopened.pool![0].source.chromaKey!.color = '#00ff00';
    expect(visualSource(reopened, inherited).chromaKey!.color).toBe('#00ff00');
  });
});
