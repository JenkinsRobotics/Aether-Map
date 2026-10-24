import { describe, expect, it } from 'vitest';
import { FLAT_EQ, peakDb, readTrackEQ } from './timeline-audio-engine';
import { emptyShow } from '../document';
import { normalizeMediaPool } from '../media-pool';
import { parseShow, serializeShow } from '../show-file';

describe('soundtrack EQ and metering', () => {
  it('defaults old files to bypass and bounds malformed gains', () => {
    expect(readTrackEQ(undefined)).toEqual(FLAT_EQ);
    expect(readTrackEQ({ enabled: true, lowDb: -50, midDb: Infinity, highDb: 30 })).toEqual({ enabled: true, lowDb: -12, midDb: 0, highDb: 12 });
    expect(readTrackEQ({ enabled: 'yes', lowDb: '3' })).toEqual(FLAT_EQ);
  });
  it('reports silence, both waveform polarities and full-scale clipping', () => {
    expect(peakDb(new Float32Array([0, 0]))).toBe(-60);
    expect(peakDb(new Float32Array([.1, -.5]))).toBeCloseTo(-6.0206);
    expect(peakDb(new Float32Array([1]))).toBe(0);
    expect(peakDb(new Float32Array([2]))).toBeGreaterThan(0);
  });
  it('round trips per-track EQ without changing legacy audio tracks', () => {
    const show = normalizeMediaPool(emptyShow());
    const audio = show.tracks!.find(t => t.kind === 'audio')!;
    expect(parseShow(serializeShow(show)).tracks!.find(t => t.id === audio.id)?.eq).toBeUndefined();
    audio.eq = { enabled: true, lowDb: -3, midDb: 4.5, highDb: 2 };
    expect(parseShow(serializeShow(show)).tracks!.find(t => t.id === audio.id)?.eq).toEqual(audio.eq);
  });
});
