import { copySceneTimelines, removeSceneTimelines } from './timelines';
import { useCallback } from "react";
import { backdropSurface } from "./background-layer";
import { resizeSceneContent } from "./content-placement";
import { newScene, nextId, type MapShow, type Scene } from "./document";
import type { SceneProperties } from "./panels/ScenePropertiesDialog";

/**
 * Every command that acts on the scene list.
 *
 * These moved out of `App` because they are a closed set that only touches the
 * document and the transport: nothing here needs the canvas, the panels, the
 * output session or any of the twenty other things App is holding. Keeping them
 * there made App the only place you could read what "duplicate a scene" means.
 */
export interface SceneCommandDeps {
  show: MapShow;
  edit: (next: MapShow | ((current: MapShow) => MapShow), coalesceKey?: string) => void;
  seek: (timeS: number) => void;
  /** Clearing selection and any open feature window is part of changing scene. */
  onLeaveScene: () => void;
}

export function useSceneCommands({ show, edit, seek, onLeaveScene }: SceneCommandDeps) {
  const selectScene = useCallback((sceneID: string) => {
    onLeaveScene();
    edit((current) => ({ ...current, activeSceneId: sceneID }));
    seek(0);
  }, [edit, seek, onLeaveScene]);

  const addScene = useCallback((properties: SceneProperties) => {
    onLeaveScene();
    const created = newScene(properties.name, properties.artboard);
    edit((current) => ({ ...current, scenes: [...current.scenes, created], activeSceneId: created.id }));
    seek(0);
  }, [edit, seek, onLeaveScene]);

  const duplicateScene = useCallback((sceneID: string) => {
    onLeaveScene();
    const source = show.scenes.find((s) => s.id === sceneID);
    if (!source) return;
    // Fresh ids, minted outside the updater: two scenes must never share a
    // surface identity, or cueing one would cue the other.
    const copy: Scene = {
      ...source,
      id: nextId("sc"),
      name: `${source.name} copy`,
      surfaces: source.surfaces.map((surface) => ({
        ...surface,
        id: nextId("s"),
        cues: surface.cues.map((cue) => ({ ...cue, id: nextId("c") })),
        clips: surface.clips.map((clip) => ({ ...clip, id: nextId("k") })),
      })),
    };
    const ids = new Map(source.surfaces.map((surface, i) => [surface.id, copy.surfaces[i].id]));
    const visuals = (show.visuals ?? []).filter(v => v.targets.some(t => t.sceneID === sceneID)).map(v => ({ ...structuredClone(v), id: nextId('visual'), legacyTrack: v.legacyTrack ? ids.get(v.legacyTrack) : undefined,
      targets: v.targets.filter(t => t.sceneID === sceneID).map(t => ({ sceneID: copy.id, ...(t.surfaceID ? { surfaceID: ids.get(t.surfaceID) } : {}) })) }));
    edit((current) => ({ ...current, ...(current.timelines?.length ? copySceneTimelines(current, sceneID, copy.id, ids) : current.visuals ? { visuals: [...current.visuals, ...visuals] } : {}), activeTimelineID:undefined, scenes: [...current.scenes, copy], activeSceneId: copy.id }));
    seek(0);
  }, [edit, show.scenes, show.visuals, seek, onLeaveScene]);

  const deleteScene = useCallback((sceneID: string) => {
    if (show.scenes.length <= 1) return;
    onLeaveScene();
    edit((document) => {
      const current = removeSceneTimelines(document, sceneID);
      if (current.scenes.length <= 1) return current;
      const index = current.scenes.findIndex((scene) => scene.id === sceneID);
      if (index < 0) return current;
      const scenes = current.scenes.filter((s) => s.id !== sceneID);
      const replacement = scenes[Math.min(index, scenes.length - 1)].id;
      return { ...current, scenes, ...(current.visuals ? { visuals: current.visuals.map(v => ({ ...v, targets: v.targets.filter(t => t.sceneID !== sceneID) })) } : {}),
        // An output renders only the scene it is linked to, so deleting a scene
        // out from under one would go dark on a wall mid-show. Rebind to the
        // scene that takes its place; going dark stays something you ask for.
        outputs: current.outputs.map((output) =>
          output.sceneId === sceneID ? { ...output, sceneId: replacement } : output),
        // The crossfader cannot be left pointing at a scene that is gone.
        ...(current.mix?.sceneId === sceneID ? { mix: undefined } : {}),
        activeSceneId: current.activeSceneId === sceneID ? replacement : current.activeSceneId };
    });
    if (sceneID === show.activeSceneId) seek(0);
  }, [edit, seek, show.activeSceneId, show.scenes.length, onLeaveScene]);

  const moveScene = useCallback((sceneID: string, targetID: string, position: "before" | "after") =>
    edit((current) => {
      const source = current.scenes.find((scene) => scene.id === sceneID);
      if (!source || sceneID === targetID) return current;
      const scenes = current.scenes.filter((scene) => scene.id !== sceneID);
      const target = scenes.findIndex((scene) => scene.id === targetID);
      if (target < 0) return current;
      scenes.splice(target + (position === "after" ? 1 : 0), 0, source);
      if (scenes.every((scene, index) => scene === current.scenes[index])) return current;
      // Keep selection and transport: changing the list order is not a cut.
      return { ...current, scenes };
    }), [edit]);

  const patchScene = useCallback((sceneID: string, patch: Partial<Scene>, coalesceKey?: string) =>
    edit((current) => ({
      ...current,
      scenes: current.scenes.map((s) => {
        if (s.id !== sceneID) return s;
        // Keep an automatically fitted backdrop where it was when changing the
        // artboard, just like every explicitly positioned layer.
        const fitted = patch.artboard && s.setupBackground && !s.setupBackground.corners
          ? backdropSurface({ ...current, activeSceneId: s.id }) : null;
        return resizeSceneContent(current, s, { ...s, ...(fitted ? { setupBackground: { ...s.setupBackground!, corners: fitted.corners } } : {}), ...patch });
      }),
    }), coalesceKey), [edit]);

  return { selectScene, addScene, duplicateScene, deleteScene, moveScene, patchScene };
}
