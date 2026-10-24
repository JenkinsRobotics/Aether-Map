import { emptyShow, type MapShow } from '../document';
import type { Visual } from '../visual-model';

/** Small normalized test show; no file access or random identities are needed. */
export function audioFixture(): MapShow {
  const show = emptyShow();
  const sceneID = show.activeSceneId;
  show.scenes[0].durationS = 30;
  show.media = [{ id: 'tone', file: 'tone.wav', name: 'Tone', kind: 'audio', duration: 2, bytes: 16, width: 0, height: 0 }];
  show.tracks = [
    { id: 'video', name: 'V1', kind: 'video', enabled: true, locked: false, targets: [{ sceneID }] },
    { id: 'audio', name: 'A1', kind: 'audio', enabled: true, locked: false, volume: .8, targets: [{ sceneID }] },
  ];
  show.visuals = [audioClip(show)];
  return show;
}
export function audioClip(show: MapShow, patch: Partial<Visual> = {}): Visual {
  return { id: 'sound', name: 'Sound', trackID: 'audio', source: { mediaId: 'tone', rect: [0, 0, 1, 1] },
    targets: [{ sceneID: show.activeSceneId }], startS: 1, durationS: 6, inS: .75, loop: true,
    mapping: 'repeat', color: '#ffffff', opacity: 1, ...patch };
}
