import { expect, it } from 'vitest';
import { emptyShow, newScene, newSurface, type MapShow } from './document';
import { normalizeDocument } from './normalize-document';
import { parseShow, serializeShow } from './show-file';
import { activeShow, clipAt, crossedCues, newShowProgram, normalizeShowTimeline, playerShow, showForClip, surfaceRole, withActiveShow } from './show-timeline';
import { createTimeline } from './timelines';

const twoCanvases = () => {
  const show = emptyShow(), house = show.scenes[0], tree = { ...newScene('Tree'), durationS: 30 };
  house.surfaces = [{ ...newSurface(show.output, 0), name: 'Door' }];
  tree.surfaces = [{ ...newSurface(show.output, 1), name: 'Trunk', role: 'Door' }];
  return normalizeDocument({ ...show, scenes: [house, tree] });
};

it('gives every canvas a track playing its Main, and follows added and deleted canvases', () => {
  let show = twoCanvases();
  expect(activeShow(show)!.tracks.map(t => t.canvasID)).toEqual(show.scenes.map(c => c.id));
  expect(activeShow(show)!.tracks[1].clips[0]).toMatchObject({ sceneID: 'main', startS: 0, durationS: 30, loop: true });
  expect(normalizeShowTimeline(show)).toBe(show);
  show = normalizeShowTimeline({ ...show, scenes: [show.scenes[0]] });
  expect(activeShow(show)!.tracks).toHaveLength(1);
});

it('plays a clip at local time, looping, and fires timeline cues the playhead crosses', () => {
  let show = twoCanvases();
  const tree = show.scenes[1].id;
  expect(clipAt(show, tree, 45)).toBeNull();
  show = withActiveShow(show, p => ({ ...p, tracks: p.tracks.map(t => t.canvasID === tree ? { ...t, clips: [{ ...t.clips[0], durationS: 90 }] } : t),
    cues: [{ id: 'c', name: 'Dark', trigger: 'timeline', action: 'blackout-on', atS: 20 }] }));
  expect(clipAt(show, tree, 45)!.localS).toBe(15);
  expect(crossedCues(show, 10, 25).map(c => c.id)).toEqual(['c']);
  expect(crossedCues(show, 25, 30)).toEqual([]);
});

it('reuses a scene on another canvas by surface role, and round-trips through the file', () => {
  let show = twoCanvases();
  const [house, tree] = show.scenes;
  show = createTimeline(show, 'Ghosts');
  const ghosts = show.timelines!.at(-1)!;
  const track = show.tracks!.find(t => t.timelineID === ghosts.id && t.kind === 'video')!;
  show = { ...show, visuals: [...(show.visuals ?? []), { id: 'v', name: 'Ghost', trackID: track.id, startS: 0, durationS: 10, inS: 0, loop: true,
    targets: [{ sceneID: house.id, surfaceID: house.surfaces[0].id }], mapping: 'repeat', opacity: 1, color: '#fff', source: { mediaId: null, rect: [0, 0, 10, 10], fill: '#fff' } }] };
  expect(surfaceRole(tree.surfaces[0])).toBe('Door');
  const bound = showForClip(show, tree.id, { id: 'k', sceneID: ghosts.id, startS: 0, durationS: 10, inS: 0 });
  expect(bound.activeSceneId).toBe(tree.id);
  expect(bound.visuals!.find(v => v.id === 'v')!.targets).toEqual([{ sceneID: tree.id, surfaceID: tree.surfaces[0].id }]);
  const reopened = parseShow(serializeShow(show));
  expect(reopened.shows).toEqual(show.shows);
  expect(reopened.scenes[1].surfaces[0].role).toBe('Door');
});

it('holds several shows like setlists, migrating a single r15 show to the first', () => {
  const base = twoCanvases();
  const { shows: _shows, ...legacy } = base;
  const migrated = normalizeShowTimeline({ ...legacy, showTimeline: { ...activeShow(base)!, durationS: 42 } });
  expect(migrated.showTimeline).toBeUndefined();
  expect(migrated.shows!.map(p => [p.name, p.durationS])).toEqual([['Show 1', 42]]);
  const gala = newShowProgram(migrated, 'Gala');
  const both = { ...migrated, shows: [...migrated.shows!, gala], activeShowID: gala.id };
  expect(activeShow(both)!.name).toBe('Gala');
  expect(playerShow(both)!.name).toBe('Show 1');
  expect(playerShow({ ...both, playerShowID: gala.id })!.name).toBe('Gala');
  expect(parseShow(serializeShow(both)).shows!.map(p => p.name)).toEqual(['Show 1', 'Gala']);
});

it('plays the show soundtrack on the show clock through the timeline audio engine', async () => {
  const { timelineAudio } = await import('./timeline-audio');
  const { withShowAudio } = await import('./show-timeline');
  let show = twoCanvases();
  show = { ...show, media: [...show.media, { id: 'song', kind: 'audio', name: 'Song', file: 'song.mp3', bytes: 1, duration: 120, width: 0, height: 0 }] };
  show = withActiveShow(show, p => ({ ...p, audio: [{ id: 'a', mediaId: 'song', startS: 10, durationS: 60, inS: 5 }] }));
  const clock = withShowAudio(show);
  expect(timelineAudio(clock, 5)).toEqual([]);
  expect(timelineAudio(clock, 20)).toEqual([expect.objectContaining({ mediaID: 'song', timeS: 15 })]);
  expect(parseShow(serializeShow(show)).shows![0].audio).toEqual([{ id: 'a', mediaId: 'song', startS: 10, durationS: 60, inS: 5 }]);
});

it('loops a jump cue a set number of times and gates cues on a MIDI condition', async () => {
  const { cueAllowed } = await import('./show-timeline');
  const loop = { id: 'l', name: 'Loop', trigger: 'timeline' as const, action: 'jump' as const, atS: 50, toS: 10, times: 2 };
  expect(cueAllowed(loop, {}, new Map())).toBe(true);
  expect(cueAllowed(loop, {}, new Map([['l', 2]]))).toBe(false);
  const gated = { id: 'g', name: 'If sensor', trigger: 'go' as const, action: 'play' as const, when: { control: 20, above: 63 } };
  expect(cueAllowed(gated, { 20: 10 }, new Map())).toBe(false);
  expect(cueAllowed(gated, { 20: 100 }, new Map())).toBe(true);
});

it('plays another show as a sequence on the same canvas, and goes dark on a loop of shows', () => {
  const base = twoCanvases(), house = base.scenes[0].id;
  const intro = { ...newShowProgram(base, 'Intro'), durationS: 20 };
  intro.tracks = intro.tracks.map(t => ({ ...t, clips: [{ ...t.clips[0], durationS: 20, id: `intro-${t.canvasID}` }] }));
  let show: MapShow = { ...base, shows: [...base.shows!, intro] };
  show = withActiveShow(show, p => ({ ...p, tracks: p.tracks.map(t => t.canvasID === house ? { ...t, clips: [{ id: 'seq', sceneID: 'main', showID: intro.id, startS: 5, durationS: 40, inS: 0, loop: true }] } : t) }));
  const at = clipAt(show, house, 30)!;
  expect(at.clip.id).toBe(`intro-${house}`);
  expect(at.localS).toBe(5);
  const looped = { ...show, shows: show.shows!.map(p => p.id === intro.id ? { ...p, tracks: p.tracks.map(t => ({ ...t, clips: [{ id: 'self', sceneID: 'main', showID: intro.id, startS: 0, durationS: 20, inS: 0 }] })) } : p) };
  expect(clipAt(looped, house, 30)).toBeNull();
});
