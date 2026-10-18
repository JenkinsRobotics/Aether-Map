import { describe, expect, it } from 'vitest';
import { emptyShow, newSurface, showForOutput } from './document';
import { addPoolAsset, normalizeMediaPool, placePoolAsset } from './media-pool';
import { createTimeline, currentTimelineID, timelineTracks, timelineVisuals, placeTimeline, canNestTimeline, removeTimeline, scheduledVisuals, copySceneTimelines, removeSceneTimelines } from './timelines';
import { parseShow, serializeShow } from './show-file';
import { sceneVisuals } from './visual-render';
import { timelineAudio } from './timeline-audio';
import { normalizeVisuals } from './visual-document';
import { pasteTimelineClip, moveTimelineClip } from './timeline-edit';

function fixture() {
  let show = normalizeMediaPool(emptyShow());
  show.scenes[0].surfaces = [newSurface(show.output, 0), newSurface(show.output, 1)];
  show = addPoolAsset(show, { mediaId:null, rect:[0,0,1920,1080], fill:'#ff0000' }, 'Red');
  const main = timelineTracks(show).find(t => t.kind === 'video')!.id;
  show = createTimeline(show, 'Box');
  const child = currentTimelineID(show), video = timelineTracks(show).find(t => t.kind === 'video')!.id;
  show = placePoolAsset(show, show.pool![0].id, video, 2);
  show.visuals![0] = { ...show.visuals![0], durationS:4, mapping:'span', targets:show.scenes[0].surfaces.map(s => ({ sceneID:show.activeSceneId, surfaceID:s.id })) };
  return { show, child, main, video };
}

describe('reusable timelines', () => {
  it('owns independent V1/A1 tracks, shares pool sources, and round-trips without flattening', () => {
    const { show, child } = fixture();
    expect(timelineTracks(show).map(t => t.name)).toEqual(['V1','A1']);
    expect(timelineVisuals(show)).toHaveLength(1);
    expect(timelineVisuals({ ...show, activeTimelineID:'main' })).toHaveLength(0);
    const reopened = normalizeMediaPool(normalizeVisuals(parseShow(serializeShow(show))));
    expect(reopened.version).toBe(7);
    expect(currentTimelineID(reopened)).toBe(child);
    expect(reopened.pool).toHaveLength(1);
    expect(reopened.visuals).toEqual(show.visuals);
    expect(reopened.tracks).toEqual(show.tracks!.map(t => ({ ...t, volume:1, solo:false })));
  });
  it('schedules two independent uses and renders a compound surface union at the child clock', () => {
    let { show, child, main } = fixture();
    show = { ...show, activeTimelineID:'main' };
    expect(sceneVisuals(show, show.scenes[0], 3)).toHaveLength(0);
    show = placeTimeline(show, child, main, 10);
    show = placeTimeline(show, child, main, 20);
    expect(sceneVisuals(show, show.scenes[0], 11)).toHaveLength(0);
    const picture = sceneVisuals(show, show.scenes[0], 13);
    expect(picture).toHaveLength(1); expect(picture[0].masks).toHaveLength(2);
    expect(picture[0].mediaTimeS).toBe(1);
    const later = sceneVisuals(show, show.scenes[0], 23);
    expect(later).toHaveLength(1); expect(later[0].id).not.toBe(picture[0].id);
    expect(later[0].mediaTimeS).toBe(1);
    expect(parseShow(serializeShow(show)).visuals).toHaveLength(3);
    expect(removeTimeline(show, child)).toBe(show);
    expect(showForOutput({ ...show, activeTimelineID:child }, show.outputs[0]).activeTimelineID).toBeUndefined();
  });
  it('rejects self/cyclic nesting from drops, clipboard, moves and saved files', () => {
    let { show, child, main, video } = fixture();
    expect(canNestTimeline(show, child)).toBe(false);
    expect(placeTimeline(show, child, video)).toBe(show);
    show = { ...show, activeTimelineID:'main' }; show = placeTimeline(show, child, main, 0);
    const use = show.visuals!.at(-1)!;
    expect(pasteTimelineClip(show, use, video, 0)).toBe(show);
    expect(moveTimelineClip(show, use.id, video, 0)).toBe(show);
    const corrupt = { ...show, visuals:[...show.visuals!, { ...use, id:'cycle', trackID:video }] };
    expect(() => parseShow(serializeShow(corrupt))).toThrow(/cyclic/);
    expect(scheduledVisuals(corrupt, 2).length).toBeLessThan(10);
  });
  it('edits a shared source through existing uses and honors child loop/in points', () => {
    let { show, child, main } = fixture();
    show.timelines![0].durationS = 10;
    show = placeTimeline({ ...show, activeTimelineID:'main' }, child, main, 10);
    const use = show.visuals!.at(-1)!; use.inS = 2; use.loop = true; use.durationS = 25;
    show.pool![0].source.fill = '#0000ff';
    const pictures = sceneVisuals(show, show.scenes[0], 20);
    expect(pictures).toHaveLength(1);
    expect(pictures[0].source.fill).toBe('#0000ff'); expect(pictures[0].mediaTimeS).toBe(0);
    use.enabled = false;
    expect(sceneVisuals(show, show.scenes[0], 20)).toHaveLength(0);
  });
  it('duplicates and removes scene-owned timelines without dangling references', () => {
    let { show, child, main } = fixture();
    show = placeTimeline({ ...show, activeTimelineID:'main' }, child, main, 0);
    const source = show.scenes[0], copy = { ...structuredClone(source), id:'scene-copy' };
    const ids = new Map(copy.surfaces.map(s => { const old = s.id; s.id += '-copy'; return [old, s.id]; }));
    show = { ...show, ...copySceneTimelines(show, source.id, copy.id, ids), scenes:[source, copy] };
    expect(parseShow(serializeShow(show)).timelines).toHaveLength(2);
    expect(sceneVisuals({ ...show, activeSceneId:copy.id }, copy, 3)).toHaveLength(1);
    show = removeSceneTimelines(show, source.id);
    show.scenes = [copy]; show.activeSceneId = copy.id;
    expect(parseShow(serializeShow(show)).timelines).toHaveLength(1);
  });
  it('resolves nested audio once at the local clock and observes track mute', () => {
    let { show, child, main } = fixture();
    show.media.push({ id:'audio', name:'Tone', file:'tone.wav', kind:'audio', width:0, height:0, duration:10, bytes:20 });
    show = addPoolAsset(show, { mediaId:'audio', rect:[0,0,1,1] }, 'Tone');
    const audio = timelineTracks(show).find(t => t.kind === 'audio')!;
    show = placePoolAsset(show, show.pool!.at(-1)!.id, audio.id, 1);
    show = placeTimeline({ ...show, activeTimelineID:'main' }, child, main, 10);
    expect(timelineAudio(show, 10)).toHaveLength(0);
    expect(timelineAudio(show, 13)).toMatchObject([{ timeS:2, mediaID:'audio' }]);
    show = { ...show, tracks:show.tracks!.map(t => t.id === audio.id ? { ...t, enabled:false } : t) };
    expect(timelineAudio(show, 13)).toHaveLength(0);
  });
});
