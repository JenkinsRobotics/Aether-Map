import { expect, it } from 'vitest';
import { emptyShow, newSurface, quadCorners } from './document';
import { createTimeline, placeTimeline, timelineTracks } from './timelines';
import { sceneVisuals } from './visual-render';

it('a nested scene on chosen surfaces projects its whole picture onto each; on Entire scene it plays as itself', () => {
  let show = emptyShow();
  const wall = { ...newSurface(show.output, 0), id: 'wall', corners: quadCorners([100, 100, 400, 300]) };
  show.scenes[0].surfaces = [wall];
  const sceneID = show.activeSceneId, { width, height } = show.output;
  show = createTimeline(show, 'Child');
  const child = show.activeTimelineID!, childTrack = timelineTracks(show, child).find(t => t.kind === 'video')!;
  show = { ...show, visuals: [...(show.visuals ?? []), { id: 'red', name: 'Red', trackID: childTrack.id, startS: 0, durationS: 60, inS: 0, loop: true, continuous: true,
    targets: [{ sceneID }], mapping: 'repeat', color: '#f00', opacity: 1, source: { mediaId: null, rect: [0, 0, width, height], fill: '#ff0000' } }] };
  show = { ...show, activeTimelineID: undefined, tracks: [...(show.tracks ?? []), { id: 'main-v', name: 'V1', kind: 'video', targets: [{ sceneID }], enabled: true, locked: false }] };
  show = placeTimeline(show, child, 'main-v', 0);
  const nested = show.visuals!.find(v => v.timelineRefID === child)!;
  const render = (targets: typeof nested.targets) => sceneVisuals({ ...show, visuals: show.visuals!.map(v => v.id === nested.id ? { ...v, targets } : v) }, show.scenes[0], 1);
  // Entire scene: the child's own (scene-wide) assignment, the whole canvas.
  expect(render([{ sceneID }]).map(p => p.corners)).toEqual([quadCorners([0, 0, width, height])]);
  // On the wall: the child's whole picture lands on the wall's corners.
  const onWall = render([{ sceneID, surfaceID: 'wall' }]);
  expect(onWall).toHaveLength(1);
  expect(onWall[0].id).toMatch(/@wall$/);
  onWall[0].corners.forEach((p, i) => { expect(p[0]).toBeCloseTo(wall.corners[i][0]); expect(p[1]).toBeCloseTo(wall.corners[i][1]); });
});
