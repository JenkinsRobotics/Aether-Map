import { describe, expect, it } from 'vitest';
import { offlineAudioPlan } from './audio-plan';
import { audioClip, audioFixture } from './audio-fixtures';
import { timelineAudio } from '../timeline-audio';
import { visualClockSegments, visualSourceTime } from '../visual-clock';
import { parseShow, serializeShow } from '../show-file';

describe('offline soundtrack projection', () => {
  it('splits trims and loops exactly and preserves an export starting mid-clip', () => {
    const show = audioFixture();
    const plan = offlineAudioPlan(show, { startS: 1.5, endS: 6 });
    expect(plan.map(({ startS, endS, sourceStartS }) => [startS, endS, sourceStartS])).toEqual([
      [0, .75, 1.25], [.75, 2.75, 0], [2.75, 4.5, 0],
    ]);
    expect(plan.every(p => p.volume === .8 && p.voiceID === 'sound')).toBe(true);
    show.visuals![0].loop = false;
    expect(offlineAudioPlan(show, { startS: 0, endS: 10 })).toMatchObject([{ startS: 1, endS: 2.25, sourceStartS: .75 }]);
  });
  it('uses canonical master, DIM, solo, mute, scene mix and EQ settings', () => {
    const show = audioFixture(), scene = { ...structuredClone(show.scenes[0]), id: 'scene-b' };
    show.scenes.push(scene); show.mix = { sceneId: scene.id, blend: .25 };
    const track = show.tracks![1]; track.targets.push({ sceneID: scene.id });
    track.eq = { enabled: true, lowDb: 3, midDb: -2, highDb: 1 };
    show.audioOutput = { volume: .5, dimmed: true, muted: false };
    let plan = offlineAudioPlan(show, { startS: 0, endS: 3 });
    expect(plan[0].volume).toBeCloseTo(.03); // One voice, largest target opacity; not double-counted.
    expect(plan[0].eq).toEqual(track.eq);
    track.solo = true;
    show.tracks!.push({ ...track, id: 'other', solo: false });
    show.visuals!.push(audioClip(show, { id: 'other', trackID: 'other' }));
    plan = offlineAudioPlan(show, { startS: 0, endS: 3 });
    expect(new Set(plan.map(p => p.trackID))).toEqual(new Set(['audio']));
    show.audioOutput.muted = true;
    expect(offlineAudioPlan(show, { startS: 0, endS: 3 })).toEqual([]);
    show.audioOutput.muted = false; show.scenes[0].suppressed = true;
    expect(offlineAudioPlan(show, { startS: 0, endS: 3 })).toEqual([]);
  });
  it('agrees with live voices across overlapping repeated nested uses and saved reload', () => {
    let show = audioFixture();
    show.timelines = [{ id: 'child', name: 'Child', durationS: 4, sceneID: show.activeSceneId }];
    show.tracks!.push({ ...show.tracks![1], id: 'child-audio', timelineID: 'child' });
    show.visuals!.push(audioClip(show, { id: 'child-sound', trackID: 'child-audio', startS: .5, durationS: 2.5, inS: .4 }));
    for (const [id, startS] of [['one', 2], ['two', 5]] as const) {
      show.visuals!.push(audioClip(show, { id, trackID: 'video', timelineRefID: 'child', startS, durationS: 10, inS: 1 }));
    }
    show = parseShow(serializeShow(show));
    const before = JSON.stringify(show), range = { startS: 1.2, endS: 17 }, plan = offlineAudioPlan(show, range);
    for (let i = 0; i < 600; i++) {
      const fileTime = (i + .371) / 600 * (range.endS - range.startS), time = range.startS + fileTime;
      const actual = plan.filter(p => fileTime >= p.startS && fileTime < p.endS).sort((a, b) => a.voiceID.localeCompare(b.voiceID));
      const live = timelineAudio(show, time).sort((a, b) => a.id.localeCompare(b.id));
      expect(actual.map(p => p.voiceID)).toEqual(live.map(p => p.id));
      actual.forEach((p, j) => {
        expect(p.sourceStartS + fileTime - p.startS).toBeCloseTo(live[j].timeS, 8);
        expect(p.volume).toBe(live[j].volume);
      });
    }
    expect(JSON.stringify(show)).toBe(before);
    show.activeTimelineID = 'child';
    expect(offlineAudioPlan(show, { startS: 0, endS: 4 }).map(p => p.voiceID)).toEqual(['child-sound', 'child-sound']);
  });
  it('makes held nested clocks silent and maintains independent instances at two levels', () => {
    const show = audioFixture();
    show.timelines = [{ id: 'child', name: 'Child', durationS: 2, sceneID: show.activeSceneId }];
    show.tracks![1].timelineID = 'child';
    show.visuals![0] = audioClip(show, { startS: 0, durationS: 8, inS: 0 });
    show.visuals!.push(audioClip(show, { id: 'use', trackID: 'video', timelineRefID: 'child', startS: 1, durationS: 10, inS: 0, loop: false }));
    expect(offlineAudioPlan(show, { startS: 0, endS: 12 })).toMatchObject([
      { voiceID: 'use/child/sound', startS: 1, endS: 2.999999, sourceStartS: 0 },
    ]);
    expect(offlineAudioPlan(show, { startS: 4, endS: 10 })).toEqual([]);
    show.timelines!.push({ id: 'parent', name: 'Parent', durationS: 15, sceneID: show.activeSceneId });
    show.tracks![0].timelineID = 'parent';
    show.tracks!.push({ ...show.tracks![0], id: 'main-video', timelineID: undefined });
    show.visuals!.push(audioClip(show, { id: 'outer', trackID: 'main-video', timelineRefID: 'parent', startS: 3, durationS: 20, inS: 0, loop: false }));
    expect(offlineAudioPlan(show, { startS: 0, endS: 15 })[0]).toMatchObject({ voiceID: 'outer/parent/use/child/sound', startS: 4, endS: 5.999999 });
  });
  it('refuses dense loops, missing media and invalid references instead of dropping audio', () => {
    const show = audioFixture();
    show.media[0].duration = .000001;
    expect(() => offlineAudioPlan(show, { startS: 0, endS: 10 })).toThrow(/budget/);
    show.media = [];
    expect(() => offlineAudioPlan(show, { startS: 0, endS: 10 })).toThrow(/Missing soundtrack/);
    show.visuals![0].timelineRefID = 'missing';
    expect(() => offlineAudioPlan(show, { startS: 0, endS: 10 })).toThrow(/missing child/);
  });
  it('projects affine clocks at fractional wraps and holds using the canonical evaluator', () => {
    const show = audioFixture(), clip = show.visuals![0];
    for (const loop of [true, false]) for (const continuous of [true, false]) for (const length of [.13, 2, undefined]) {
      show.media[0].duration = length; clip.loop = loop; clip.continuous = continuous;
      for (const piece of visualClockSegments(show, clip, 1.137, 7)) {
        for (const fraction of [.001, .5, .999]) {
          const time = piece.startS + fraction * (piece.endS - piece.startS);
          expect(piece.sourceStartS + piece.rate * (time - piece.startS)).toBeCloseTo(visualSourceTime(show, clip, time), 8);
        }
      }
    }
  });
});
