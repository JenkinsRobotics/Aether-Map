import { Button, Dialog } from '@aether/ui';
import { artboardOf, type SceneSize } from '../scene-size';
import { SceneSizeFields, useSceneDraft } from './SceneSizeFields';
import type { Scene } from '../document';
export type SceneProperties = Pick<Scene, 'name' | 'artboard'>;

/**
 * Creating a scene, and editing one from the tree's F2 command.
 *
 * Creation needs a dialog: there is no scene selected yet for a
 * selection-driven panel to follow. Editing an existing scene also happens in
 * the Properties panel now; both render the same `SceneSizeFields`, so the two
 * cannot disagree about what a scene's size means.
 */
export function ScenePropertiesDialog({ name: initialName, size, creating, onApply, onClose }: {
  name: string; size: SceneSize; creating?: boolean; onApply: (properties: SceneProperties) => void; onClose: () => void;
}) {
  const draft = useSceneDraft(initialName, size);
  const { name, width, height, valid } = draft;
  return <Dialog open title={creating ? 'New scene' : 'Scene properties'} onClose={onClose} actions={<>
    <Button onClick={onClose}>Cancel</Button>
    <Button primary disabled={!valid} onClick={() => { if (valid) onApply({ name: name.trim(), artboard: artboardOf({ width: Math.round(width!), height: Math.round(height!) }) }); }}>{creating ? 'Create' : 'Apply'}</Button>
  </>}><div className="map-scene-properties">
    <SceneSizeFields draft={draft} size={size} />
    <p className="map-hint">The scene is your artboard. Resizing changes its bounds and keeps layers in place. Playback timing is controlled in the timeline.</p>
  </div></Dialog>;
}
