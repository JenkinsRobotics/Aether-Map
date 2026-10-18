import { useMemo, useState } from "react";
import { AetherIcon, TreePanel, type TreeControl, type TreeNode, type MenuItem } from "@aether/ui";
import { allSurfaces, surfaceCollection, withSurfaceCollection, type MapShow, type Scene, type Surface, type Clip } from "../document";
import { assetName, clipSource, sourceID, sourceHasContent, sourceKind, sourceName } from '../surface-assets';
import { backgroundLayer } from "../background-layer";
import { canDeleteLayer, folderID, resolveTreeID, type TreeTarget } from "../scene-tree";
import { createLayerFolder, folderNames, moveTreeLayer, patchLayerFolder, stepLayerFolder, unusedFolderName } from "../layer-tree-commands";
import type { SceneProperties } from "./ScenePropertiesDialog";

/** Every command that acts on the scene list, passed through as one object. */
export interface SceneCommands {
  select: (sceneID: string) => void;
  add: (properties: SceneProperties) => void;
  duplicate: (sceneID: string) => void;
  delete: (sceneID: string) => void;
  move: (sceneID: string, targetID: string, position: "before" | "after") => void;
  patch: (sceneID: string, patch: Partial<Scene>) => void;
  addPreset: (presetID: string) => void;
  /** Opens the scene properties dialog; creation has no row to follow. */
  openProperties: (sceneID: string | null) => void;
  openPresets: () => void;
}

export interface LayersPanelProps {
  onTreeEdit: (change: (show: MapShow) => MapShow) => void;
  showAssets?: boolean;
  show: MapShow;
  selectedID: string | null;
  selectedLayerIDs: readonly string[];
  onSelectLayers: (ids: readonly string[]) => void;
  selectedClipID: string | null;
  scenes: SceneCommands;
  onSelectAsset: (surfaceID: string, clipID: string) => void;
  onEditAsset: (surfaceID: string, clipID: string) => void;
  onChangeAsset: (surfaceID: string, clip: Clip) => void;
  onDeleteAsset: (surfaceID: string, clipID: string) => void;
  onDuplicateAsset: (surface: Surface, clip: Clip) => void;
  onMoveAsset: (surfaceID: string, clipID: string, direction: -1 | 1) => void;
  onDropAsset: (surfaceID: string, clipID: string, targetID: string, targetClipID: string | null, after: boolean) => void;
  onSelect: (id: string) => void;
  onPatch: (id: string, patch: Partial<Surface>) => void;
  onReorder: (id: string, direction: -1 | 1) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onEdit: (id: string) => void;
  onAdd: () => void;
  /** Drop a layer into a folder, or out of one with `folder` undefined. */
  onSetFolder: (id: string, folder: string | undefined) => void;
  onRenameFolder: (from: string, to: string, sceneID: string | null) => void;
  onDissolveFolder: (folder: string, sceneID: string | null) => void;
  /** Groups the selected layer into a new folder and returns its name. */
  onNewFolder: (id: string) => string;
}

/**
 * Scenes and their layers, in one tree.
 *
 * `Scene.surfaces` means a layer is already nested under a scene, so two
 * panels were one tree split for no structural reason — the way a drawing tool
 * lists artboards with their contents beneath them. Scenes are the roots and
 * everything else hangs off one.
 *
 * Commands resolve the row's owner, so a control on an inactive scene cannot
 * accidentally edit the active scene. TreePanel owns presentation and interaction.
 */
export function LayersPanel({ onTreeEdit, showAssets = true, show, selectedID, selectedLayerIDs, onSelectLayers, selectedClipID, scenes, onSelectAsset, onEditAsset, onChangeAsset, onDeleteAsset, onDuplicateAsset, onMoveAsset, onDropAsset, onSelect, onPatch, onReorder,
  onDelete, onDuplicate, onEdit, onAdd,
  onSetFolder, onRenameFolder, onDissolveFolder, onNewFolder }: LayersPanelProps) {
  const [renamingID, setRenamingID] = useState<string | null>(null);
  /**
   * Expansion is controlled here rather than left to the tree's own state.
   * Every scene but the one being edited starts closed, so a ten-scene show is
   * still a list you can read, and the state survives the panel re-rendering
   * around it.
   */
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(show.scenes.filter((scene) => scene.id !== show.activeSceneId).map((scene) => scene.id)));
  const active = show.scenes.find((scene) => scene.id === show.activeSceneId);
  const selectedOwner = selectedID ? surfaceCollection(show, selectedID) : undefined;
  const surfaces = selectedOwner?.surfaces ?? active?.surfaces ?? [];
  const background = backgroundLayer(show);
  const selected = allSurfaces(show).find((surface) => surface.id === selectedID);
  const index = surfaces.findIndex((surface) => surface.id === selectedID);
  const at = (id: string) => resolveTreeID(show, id);
  const assets = new Map<string, { surface: Surface; clip: Clip | null }>();

  const childrenFor = (surface: Surface): TreeNode[] => {
    if (!showAssets) return [];
    const clips: (Clip | null)[] = surface.clips.length ? [...surface.clips].sort((a, b) => a.startS - b.startS)
      : !surface.sequence && sourceHasContent(surface.source) ? [null] : [];
    return clips.map(clip => {
      const id = clip?.id ?? sourceID(surface.id), source = clip ? clipSource(surface, clip, show.media) : surface.source;
      assets.set(id, { surface, clip });
      const kind = sourceKind(source), label = clip ? assetName(surface, clip, show.media) : sourceName(source, show.media);
      const category = source.mediaId ? show.media.find(m => m.id === source.mediaId)?.kind ?? 'video' : kind.toLowerCase();
      return { id, label, category, dimmed: !surface.enabled || clip?.enabled === false,
        icon: kind === 'Text' ? <AetherIcon name="text" /> : kind === 'Webcam' ? <AetherIcon name="webcam" />
          : kind === 'Tracker' ? <AetherIcon name="tracker" /> : kind === 'Shader' || kind === 'Colour' ? <AetherIcon name="palette" />
          : <AetherIcon name={source.mediaId && show.media.find(m => m.id === source.mediaId)?.kind === 'image' ? 'image' : 'file-clip'} />,
        status: clip ? [] : [{ id: 'continuous', label: 'Continuous input — no end time', icon: <AetherIcon name="history" /> }],
        actions: [
          ...(clip ? [{ id: 'visibility', label: `${clip.enabled === false ? 'Show' : 'Hide'} ${label}`, icon: <AetherIcon name={clip.enabled === false ? 'hidden' : 'visible'} />, pinned: true }] : []),
          ...(clip?.locked ? [{ id: 'lock', label: `Unlock ${label}`, icon: <AetherIcon name="pin_slot" />, pinned: true }] : []),
        ],
      };
    });
  };

  const surfaceNode = (surface: Surface): TreeNode => ({
    id: surface.id, category: "surface", label: surface.name, dimmed: !surface.enabled,
    icon: <AetherIcon name={surface.sceneCanvas ? "scene" : "surface-map"} />,
    children: childrenFor(surface),
    status: [
      ...(surface.sceneCanvas ? [{ id: "scene-target", label: "Entire scene", icon: <AetherIcon name="scene" /> }] : []),
      ...(surface.cues.length ? [{ id: "cues", label: `${surface.cues.length} cues`, icon: <AetherIcon name="history" /> }] : []),
    ],
    actions: [
      { id: "visibility", label: `${surface.enabled ? "Hide" : "Show"} ${surface.name}`, icon: <AetherIcon name={surface.enabled ? "visible" : "hidden"} />, pinned: true },
      ...(surface.locked ? [{ id: "lock", label: `Unlock ${surface.name}`, icon: <AetherIcon name="pin_slot" />, pinned: true }] : []),
    ],
  });

  /** One scene's contents: its layers, its folders, and its backdrop. */
  const contentsOf = (list: Surface[], scene: Scene | null): TreeNode[] => {
    // Folders are contiguous runs in paint order, so walking the reversed list
    // and emitting a folder the first time one of its members appears keeps the
    // tree's order and the renderer's order the same thing.
    const emitted = new Set<string>();
    const nodes: TreeNode[] = [];
    for (const surface of [...list].reverse()) {
      if (!surface.folder) { nodes.push(surfaceNode(surface)); continue; }
      if (emitted.has(surface.folder)) continue;
      emitted.add(surface.folder);
      const members = [...list].reverse().filter((entry) => entry.folder === surface.folder);
      const groupShape = members.length > 1 && members.every((entry) => entry.groupShape === surface.groupShape)
        ? surface.groupShape : undefined;
      nodes.push({
        id: folderID(scene?.id ?? null, surface.folder), category: "folder", label: surface.folder,
        icon: <AetherIcon name={groupShape ?? "collection-folder"} />,
        dimmed: members.every((member) => !member.enabled),
        children: members.map(surfaceNode),
        actions: [{ id: "visibility", label: `${members.some(s => s.enabled) ? "Hide" : "Show"} ${surface.folder}`, icon: <AetherIcon name={members.some(s => s.enabled) ? "visible" : "hidden"} />, pinned: true },
          ...(members.some(s => s.locked) ? [{ id: "lock", label: `Unlock ${surface.folder}`, icon: <AetherIcon name="pin_slot" />, pinned: true }] : [])],
        status: [{ id: "count", label: `${members.length} layers`, icon: <AetherIcon name="items" /> }],
      });
    }
    for (const name of folderNames(show, scene?.id ?? null)) {
      if (!emitted.has(name)) nodes.unshift({ id: folderID(scene?.id ?? null, name), label: name, category: "folder",
        icon: <AetherIcon name="collection-folder" />, children: [] });
    }
    // Scoped to this scene rather than the active one: every scene draws its own.
    const backdrop = scene ? backgroundLayer({ ...show, activeSceneId: scene.id }) : undefined;
    if (backdrop) nodes.push({
      id: backdrop.id, category: "backdrop", label: backdrop.label, dimmed: !backdrop.background.visible,
      icon: <AetherIcon name="image" />,
      status: [{ id: "setup-only", label: "Editor only — excluded from projection", icon: <AetherIcon name="window" /> }],
      actions: [{ id: "visibility", label: backdrop.background.visible ? "Hide backdrop" : "Show backdrop", icon: <AetherIcon name={backdrop.background.visible ? "visible" : "hidden"} />, pinned: true },
        ...(backdrop.background.locked ? [{ id: "lock", label: "Unlock backdrop", icon: <AetherIcon name="pin_slot" />, pinned: true }] : [])],
    });
    return nodes;
  };

  const nodes: TreeNode[] = show.scenes.map((scene) => {
    const contents = contentsOf(scene.surfaces, scene);
    return {
    id: scene.id, category: "scene", label: scene.name,
    icon: <AetherIcon name="scene" />,
    dimmed: Boolean(scene.hidden || scene.suppressed),
    className: scene.id === show.activeSceneId ? "map-tree-active-scene" : undefined,
    children: contents,
    status: [
      ...(scene.suppressed ? [{ id: "suppressed", label: "Suppressed — no output renders this scene", icon: <AetherIcon name="window" /> }] : []),
    ],
    actions: [
      { id: "visibility", label: `${scene.hidden ? "Show" : "Hide"} ${scene.name} on the canvas`, icon: <AetherIcon name={scene.hidden ? "hidden" : "visible"} />, pinned: true },
      ...(scene.suppressed ? [{ id: "suppress", label: `Restore ${scene.name} to the show`, icon: <AetherIcon name="status-incomplete" />, pinned: true }] : []),
    ],
  };
  });
  nodes.push(...contentsOf(show.unassignedSurfaces, null));

  // Everything with children is open unless it was closed: a new layer or a new
  // scene appears expanded, which is what you want after making one.
  const expandedIDs = useMemo(() => {
    const open = new Set<string>();
    const walk = (list: readonly TreeNode[]) => {
      for (const node of list) {
        if (!node.children?.length) continue;
        if (!collapsed.has(node.id)) open.add(node.id);
        walk(node.children);
      }
    };
    walk(nodes);
    return open;
  }, [nodes, collapsed]);

  const asset = selectedClipID ? assets.get(selectedClipID) : undefined;
  const assetLocked = Boolean(asset?.surface.locked || asset?.clip?.locked);
  const ordered = asset ? [...asset.surface.clips].sort((a, b) => a.startS - b.startS) : [];
  const assetIndex = ordered.findIndex(c => c.id === selectedClipID);

  const activate = (id: string) => {
    const target = at(id);
    if (target?.kind === "scene") { scenes.openProperties(id); return; }
    const a = assets.get(id);
    if (a) onEditAsset(a.surface.id, id); else onEdit(id);
  };

  /**
   * Selecting or opening a layer also opens its owning scene. Visibility and
   * structural commands resolve their owner directly and do not change scenes.
   */
  const reach = (target: TreeTarget | undefined) => {
    if (target && target.kind !== "scene" && target.scene && target.scene.id !== show.activeSceneId) {
      scenes.select(target.scene.id);
    }
  };

  const moveRow = (id: string, targetID: string, position: "before" | "after" | "inside") => {
    const from = at(id), to = at(targetID);
    const destination = to?.scene?.id ?? null;
    const selection = from?.kind === "folder" && destination !== (from.scene?.id ?? null)
      ? folderID(destination, unusedFolderName(show, destination, from.folder)) : id;
    onTreeEdit(current => {
      const next = moveTreeLayer(current, id, targetID, position);
      return next === current || !destination ? next : { ...next, activeSceneId: destination };
    });
    onSelect(selection);
  };

  const menuItems = (id: string): MenuItem[] => {
    const target = at(id);
    if (!target) return [];
    if (target.kind === "scene") {
      const scene = target.scene, first = show.scenes[0]?.id === id, last = show.scenes.at(-1)?.id === id;
      return [
        { id: "edit", label: "Scene properties", icon: <AetherIcon name="settings" /> },
        { id: "rename", label: "Rename scene", shortcut: "F2" },
        { id: "duplicate", label: "Duplicate scene", icon: <AetherIcon name="items" /> },
        { id: "visibility", label: scene.hidden ? "Show on the canvas" : "Hide from the canvas",
          icon: <AetherIcon name={scene.hidden ? "hidden" : "visible"} />, separatorBefore: true },
        { id: "suppress", label: scene.suppressed ? "Restore to the show" : "Suppress — keep out of the show",
          icon: <AetherIcon name="status-incomplete" /> },
        { id: "raise", label: "Move scene up", disabled: first, separatorBefore: true },
        { id: "lower", label: "Move scene down", disabled: last },
        { id: "delete", label: "Delete scene", shortcut: "Delete", danger: true,
          disabled: show.scenes.length <= 1, separatorBefore: true },
      ];
    }
    if (target.kind === "asset") {
      const a = { surface: target.surface, clip: target.clip };
      return [
        { id: 'edit', label: 'Asset properties', icon: <AetherIcon name="settings" /> },
        { id: 'rename', label: 'Rename', shortcut: 'F2', disabled: !a.clip || a.surface.locked || Boolean(a.clip.locked) },
        { id: 'duplicate', label: 'Duplicate', disabled: !a.clip || a.surface.locked },
        ...(a.clip ? [
          { id: 'visibility', label: a.clip.enabled === false ? 'Show' : 'Hide', icon: <AetherIcon name={a.clip.enabled === false ? 'hidden' : 'visible'} /> },
          { id: 'lock', label: a.clip.locked ? 'Unlock' : 'Lock', icon: <AetherIcon name="pin_slot" /> },
        ] : []),
        { id: 'delete', label: 'Delete asset', shortcut: 'Delete', danger: true, disabled: a.surface.locked || Boolean(a.clip?.locked), separatorBefore: true },
      ];
    }
    if (target.kind === "backdrop") {
      const setup = target.scene.setupBackground!;
      return [
        { id: "edit", label: "Backdrop properties", icon: <AetherIcon name="settings" /> },
        { id: "visibility", label: setup.visible ? "Hide backdrop" : "Show backdrop", icon: <AetherIcon name={setup.visible ? "visible" : "hidden"} /> },
        { id: "lock", label: setup.locked ? "Unlock backdrop" : "Lock backdrop", icon: <AetherIcon name="pin_slot" /> },
        { id: "delete", disabled: setup.locked, label: "Delete backdrop", shortcut: "Delete", danger: true, separatorBefore: true },
      ];
    }
    if (target.kind === "folder") {
      const members = (target.scene?.surfaces ?? show.unassignedSurfaces).filter(s => s.folder === target.folder);
      const locked = members.some(s => s.locked);
      return [
        { id: "rename", label: "Rename folder", shortcut: "F2", disabled: locked },
        { id: "visibility", label: members.some(s => s.enabled) ? "Hide group" : "Show group", disabled: !members.length, icon: <AetherIcon name="visible" /> },
        { id: "lock", label: locked ? "Unlock group" : "Lock group", disabled: !members.length, icon: <AetherIcon name="pin_slot" /> },
        { id: "dissolve", label: "Ungroup", disabled: locked, separatorBefore: true },
        { id: "raise", label: "Move group forward", disabled: locked || !members.length },
        { id: "lower", label: "Move group backward", disabled: locked || !members.length },
        ...show.scenes.filter(s => s.id !== target.scene?.id).map(s => ({ id: "scene:" + s.id, label: `Move to ${s.name}`, disabled: locked })),
        { id: "delete", label: "Delete group and contents", shortcut: "Delete", danger: true, disabled: locked },
      ];
    }
    const surface = target.surface, list = target.scene?.surfaces ?? show.unassignedSurfaces;
    const own = folderNames(show, target.scene?.id ?? null), position = list.indexOf(surface);
    const elsewhere = show.scenes.filter((scene) => scene.id !== target.scene?.id);
    return [
      { id: "group", label: "Group selected layers", disabled: !groupable, icon: <AetherIcon name="items" /> },
      { id: "edit", label: "Edit feature", icon: <AetherIcon name="settings" /> },
      { id: "rename", label: "Rename", shortcut: "F2", disabled: surface.locked },
      { id: "duplicate", label: "Duplicate", icon: <AetherIcon name="items" /> },
      { id: "visibility", label: surface.enabled ? "Hide" : "Show", icon: <AetherIcon name={surface.enabled ? "visible" : "hidden"} />, separatorBefore: true },
      { id: "lock", label: surface.locked ? "Unlock" : "Lock", icon: <AetherIcon name="pin_slot" /> },
      ...[{ id: "folder-new", label: "Move to new folder", icon: <AetherIcon name="collection-folder" />, disabled: surface.locked, separatorBefore: true },
        ...own.filter((name) => name !== surface.folder).map((name) => ({ id: "folder:" + name, label: `Move to ${name}`, disabled: surface.locked })),
        ...(surface.folder ? [{ id: "folder-out", label: `Move out of ${surface.folder}`, disabled: surface.locked }] : [])],
      // Moving a layer to another scene is a menu command as well as a drag,
      // because a drag across a collapsed scene is a fiddly way to say it.
      ...(elsewhere.length ? [{ id: "scene-move-header", label: "Move to scene", disabled: true, separatorBefore: true },
        ...elsewhere.map((scene) => ({ id: "scene:" + scene.id, label: scene.name, disabled: surface.locked }))] : []),
      { id: "raise", label: "Move layer forward", disabled: surface.locked || position === list.length - 1, separatorBefore: true },
      { id: "lower", label: "Move layer backward", disabled: surface.locked || position === 0 },
      { id: "delete", label: "Delete", shortcut: "Delete", danger: true, disabled: surface.locked, separatorBefore: true },
    ];
  };

  const command = (id: string, action: string) => {
    const target = at(id);
    if (!target) return;
    if (action === "group") { groupSelection(); return; }
    if (selectedIDs.size > 1 && selectedIDs.has(id) && groupTargets.length === selectedIDs.size && ["delete", "visibility", "lock"].includes(action)) {
      if (action === "delete" && groupTargets.some(t => t.surface.locked)) return;
      const enabled = !groupTargets.some(t => t.surface.enabled), locked = !groupTargets.some(t => t.surface.locked);
      if (action === "delete") { onDelete(id); return; }
      onTreeEdit(current => [...selectedIDs].reduce((next, rowID) => withSurfaceCollection(next, rowID, list => list.map(s => s.id === rowID ? { ...s, ...(action === "lock" ? { locked } : { enabled }) } : s)), current));
      return;
    }

    if (target.kind === "scene") {
      const scene = target.scene;
      if (action === "edit") scenes.openProperties(id);
      else if (action === "rename") setRenamingID(id);
      else if (action === "duplicate") scenes.duplicate(id);
      else if (action === "delete") scenes.delete(id);
      else if (action === "visibility") scenes.patch(id, { hidden: !scene.hidden });
      else if (action === "suppress") scenes.patch(id, { suppressed: !scene.suppressed });
      else if (action === "raise" || action === "lower") {
        const position = show.scenes.findIndex((entry) => entry.id === id);
        const neighbour = show.scenes[position + (action === "raise" ? -1 : 1)];
        if (neighbour) scenes.move(id, neighbour.id, action === "raise" ? "before" : "after");
      }
      return;
    }

    if (action === "edit") reach(target);

    if (target.kind === "asset") {
      const surface = target.surface, clip = target.clip;
      if (action === 'edit') onEditAsset(surface.id, id);
      else if (action === 'delete') onDeleteAsset(surface.id, id);
      else if (clip && !surface.locked) {
        if (action === 'lock') onChangeAsset(surface.id, { ...clip, locked: !clip.locked });
        else if (action === 'visibility') onChangeAsset(surface.id, { ...clip, enabled: clip.enabled === false });
        else if (action === 'duplicate') onDuplicateAsset(surface, clip);
        else if (action === 'rename' && !clip.locked) setRenamingID(id);
      }
      return;
    }

    if (target.kind === "backdrop") {
      const setup = target.scene.setupBackground!;
      if (action === "visibility") scenes.patch(target.scene.id, { setupBackground: { ...setup, visible: !setup.visible } });
      else if (action === "lock") scenes.patch(target.scene.id, { setupBackground: { ...setup, locked: !setup.locked } });
      else if (action === "edit") onEdit(id);
      else if (action === "delete" && !setup.locked) onDelete(id);
      return;
    }

    if (target.kind === "folder") {
      const members = (target.scene?.surfaces ?? show.unassignedSurfaces).filter(s => s.folder === target.folder);
      if (action === "visibility") onTreeEdit(current => patchLayerFolder(current, id, { enabled: !members.some(s => s.enabled) }));
      else if (action === "lock") onTreeEdit(current => patchLayerFolder(current, id, { locked: !members.some(s => s.locked) }));
      else if (action === "raise" || action === "lower") onTreeEdit(current => stepLayerFolder(current, id, action === "raise" ? 1 : -1));
      else if (action.startsWith("scene:")) moveRow(id, action.slice(6), "inside");
      else if (action === "rename" && !members.some(s => s.locked)) setRenamingID(id);
      else if (action === "delete" && canDeleteLayer(show, id)) onDelete(id);
      else if (action === "dissolve" && !members.some(s => s.locked)) {
        onDissolveFolder(target.folder, target.scene?.id ?? null);
        if (members[0]) onSelect(members[0].id);
      }
      return;
    }

    const surface = target.surface;
    if (action === "visibility") onPatch(id, { enabled: !surface.enabled });
    else if (action === "lock") onPatch(id, { locked: !surface.locked });
    else if (action === "edit") onEdit(id);
    else if (action === "duplicate") onDuplicate(id);
    else if (!surface.locked) {
      if (action === "rename") setRenamingID(id);
      else if (action === "delete") onDelete(id);
      else if (action === "raise" || action === "lower") onReorder(id, action === "raise" ? 1 : -1);
      else if (action === "folder-new") setRenamingID(folderID(target.scene?.id ?? null, onNewFolder(id)));
      else if (action === "folder-out") onSetFolder(id, undefined);
      else if (action.startsWith("folder:")) onSetFolder(id, action.slice("folder:".length));
      else if (action.startsWith("scene:")) moveRow(id, action.slice(6), "inside");
    }
  };

  /**
   * What the footer acts on. A merged tree has one toolbar, so its commands
   * mean whatever is selected — the same rule the Properties panel follows.
   * With no layer or asset selected, the selected row is the active scene.
   */
  const target = selectedID ? at(selectedID) : undefined;
  const kind = asset ? "asset" : target?.kind ?? (selectedID ? "missing" : "scene");
  const scene = active;
  const sceneIndex = show.scenes.findIndex((entry) => entry.id === show.activeSceneId);
  const noun = kind === "asset" ? "asset" : kind === "scene" ? "scene" : kind === "folder" ? "group" : "layer";
  const backdropLocked = Boolean(background?.background.locked);

  const step = (direction: -1 | 1) => {
    if (kind === "asset" && asset) { onMoveAsset(asset.surface.id, selectedClipID!, direction === 1 ? -1 : 1); return; }
    if (kind === "scene") {
      const neighbour = show.scenes[sceneIndex + (direction === 1 ? -1 : 1)];
      if (scene && neighbour) scenes.move(scene.id, neighbour.id, direction === 1 ? "before" : "after");
      return;
    }
    if (kind === "folder" && selectedID) onTreeEdit(current => stepLayerFolder(current, selectedID, direction));
    else if (selected) onReorder(selected.id, direction);
  };

  const primary = asset ? selectedClipID : selectedID ?? show.activeSceneId;
  const selectedIDs = new Set(primary && !asset && selectedLayerIDs.includes(primary) ? selectedLayerIDs.filter(id => at(id)) : primary ? [primary] : []);
  const groupTargets = [...selectedIDs].map(at).filter((t): t is Extract<TreeTarget, {kind: "surface"}> => t?.kind === "surface");
  const groupable = groupTargets.length === selectedIDs.size && groupTargets.length > 0
    && groupTargets.every(t => !t.surface.locked && t.scene?.id === groupTargets[0].scene?.id);
  const visibilityLabel = kind === "scene" ? (scene?.hidden ? "Show scene on the canvas" : "Hide scene from the canvas")
    : kind === "surface" ? `${selected?.enabled ? "Hide" : "Show"} layer`
    : kind === "folder" ? "Show / hide group" : kind === "backdrop" ? `${background?.background.visible ? "Hide" : "Show"} backdrop` : "Show / hide asset";

  const groupSelection = () => {
    if (!groupable) return;
    const owner = groupTargets[0].scene?.id ?? null;
    const name = unusedFolderName(show, owner);
    onTreeEdit(current => createLayerFolder(current, owner, name, [...selectedIDs]));
    const id = folderID(owner, name); onSelect(id); setRenamingID(id);
  };

  const controls: TreeControl[] = [
    { id: "new-scene", label: "New scene", icon: <AetherIcon name="scene" />, onClick: () => scenes.openProperties(null) },
    { id: "new", label: "New Surface", icon: <AetherIcon name="new" />, onClick: onAdd },
    { id: "folder", label: "New folder", icon: <AetherIcon name="collection-folder" />,
      onClick: () => {
        const owner = target ? target.scene?.id ?? null : show.activeSceneId;
        const name = unusedFolderName(show, owner);
        onTreeEdit(current => createLayerFolder(current, owner, name));
        const id = folderID(owner, name); onSelect(id); setRenamingID(id);
      } },
    { id: "group", label: "Group selected layers", icon: <AetherIcon name="items" />, disabled: !groupable,
      onClick: groupSelection },
    { id: "dissolve", label: "Ungroup", icon: <AetherIcon name="items" />, disabled: kind !== "folder" || !selectedID || !canDeleteLayer(show, selectedID),
      onClick: () => selectedID && command(selectedID, "dissolve") },
    // A show that opens empty asks you to map a wall before it has shown you
    // anything worth mapping. These arrive finished and projectable.
    { id: "preset", label: "Add a ready-made scene", icon: <AetherIcon name="palette" />, onClick: scenes.openPresets },
    { id: "delete", label: `Delete ${noun}`, icon: <AetherIcon name="delete" />, shortcut: "Delete",
      disabled: kind === "asset" ? assetLocked
        : kind === "backdrop" ? backdropLocked
        : kind === "scene" ? show.scenes.length <= 1
        : !selectedID || ![...selectedIDs].every(id => canDeleteLayer(show, id)),
      onClick: () => {
        if (kind === "asset" && asset) onDeleteAsset(asset.surface.id, selectedClipID!);
        else if (kind === "scene" && scene) scenes.delete(scene.id);
        else if (selectedID) command(selectedID, "delete");
      } },
    { id: "duplicate", label: `Duplicate ${noun}`, icon: <AetherIcon name="items" />,
      disabled: kind === "asset" ? !asset?.clip || Boolean(asset?.surface.locked)
        : kind === "backdrop" ? true
        : kind === "scene" ? false
        : !selected,
      onClick: () => {
        if (kind === "asset" && asset?.clip) onDuplicateAsset(asset.surface, asset.clip);
        else if (kind === "scene" && scene) scenes.duplicate(scene.id);
        else if (selected) onDuplicate(selected.id);
      } },
    { id: "edit", label: kind === "asset" ? "Asset properties" : kind === "scene" ? "Scene properties" : "Layer properties",
      icon: <AetherIcon name="settings" />,
      disabled: kind === "folder" || kind === "missing",
      onClick: () => {
        if (kind === "scene" && scene) scenes.openProperties(scene.id);
        else activate(kind === "asset" ? selectedClipID! : selectedID!);
      } },
    { id: "rename", label: `Rename ${noun}`, icon: <AetherIcon name="notes" />, shortcut: "F2",
      disabled: kind === "asset" ? !asset?.clip || assetLocked
        : kind === "backdrop" ? true
        : kind === "scene" ? false
        : kind === "folder" ? false : !selected || selected.locked,
      onClick: () => setRenamingID(kind === "asset" ? selectedClipID : kind === "scene" ? scene?.id ?? null : selectedID) },
    { id: "visibility", label: visibilityLabel,
      icon: <AetherIcon name="visible" />, disabled: kind === "missing", separatorBefore: true,
      onClick: () => command(asset ? selectedClipID! : selectedID ?? show.activeSceneId, "visibility") },
    { id: "lock", label: "Lock / unlock layer", icon: <AetherIcon name="pin_slot" />, disabled: kind === "scene" || kind === "missing",
      onClick: () => command(asset ? selectedClipID! : selectedID ?? show.activeSceneId, "lock") },
    ...(kind === "scene" ? [{ id: "suppress", label: scene?.suppressed ? "Restore scene to the show" : "Suppress scene — keep it out of the show",
      icon: <AetherIcon name="status-incomplete" />,
      onClick: () => scene && scenes.patch(scene.id, { suppressed: !scene.suppressed }) }] : []),
    { id: "raise", label: kind === "asset" ? "Move asset earlier" : kind === "scene" ? "Move scene up" : "Move layer forward",
      icon: <AetherIcon name="chevron" style={{ transform: "rotate(-90deg)" }} />, separatorBefore: true,
      disabled: kind === "asset" ? assetLocked || assetIndex <= 0
        : kind === "backdrop" ? true
        : kind === "scene" ? sceneIndex <= 0
        : kind === "folder" ? !selectedID || !canDeleteLayer(show, selectedID)
        : !selected || selected.locked || index === surfaces.length - 1,
      onClick: () => step(1) },
    { id: "lower", label: kind === "asset" ? "Move asset later" : kind === "scene" ? "Move scene down" : "Move layer backward",
      icon: <AetherIcon name="chevron" style={{ transform: "rotate(90deg)" }} />,
      disabled: kind === "asset" ? assetLocked || assetIndex < 0 || assetIndex === ordered.length - 1
        : kind === "backdrop" ? true
        : kind === "scene" ? sceneIndex === show.scenes.length - 1
        : kind === "folder" ? !selectedID || !canDeleteLayer(show, selectedID)
        : !selected || selected.locked || index === 0,
      onClick: () => step(-1) },
  ];



  return <TreePanel ariaLabel="Layers" filterOptions={[
    { id: 'folder', label: 'Folders and groups', icon: <AetherIcon name="collection-folder" /> },
    { id: 'scene', label: 'Scenes', icon: <AetherIcon name="scene" /> },
    { id: 'surface', label: 'Surfaces', icon: <AetherIcon name="surface-map" /> },
    { id: 'image', label: 'Images', icon: <AetherIcon name="image" /> },
    { id: 'video', label: 'Videos', icon: <AetherIcon name="file-clip" /> },
    { id: 'text', label: 'Text', icon: <AetherIcon name="text" /> },
    { id: 'shader', label: 'Shaders', icon: <AetherIcon name="palette" /> },
    { id: 'webcam', label: 'Webcams', icon: <AetherIcon name="webcam" /> },
    { id: 'tracker', label: 'Trackers', icon: <AetherIcon name="tracker" /> },
    { id: 'colour', label: 'Colours', icon: <AetherIcon name="palette" /> },
    { id: 'backdrop', label: 'Backdrops', icon: <AetherIcon name="image" /> },
  ]} rootInset={0} nodes={nodes} selectedIDs={selectedIDs}
    expandedIDs={expandedIDs}
    onToggle={(id, open) => setCollapsed((current) => {
      const next = new Set(current);
      if (open) next.delete(id); else next.add(id);
      return next;
    })}
    revealSelection
    onSelect={(ids, mode) => {
      const next = mode === "toggle" ? new Set(selectedIDs) : new Set<string>();
      for (const id of ids) { if (mode === "toggle" && next.has(id)) next.delete(id); else next.add(id); }
      const id = [...next].at(-1);
      // Multi-selection is for editable layers in one collection; scene/asset rows retain their own commands.
      const last = id ? at(id) : undefined;
      if (next.size > 1) for (const rowID of next) {
        const row = at(rowID);
        if (last?.kind !== "surface" || row?.kind !== "surface" || last.scene?.id !== row.scene?.id) next.delete(rowID);
      }
      if (id) next.add(id);
      if (!id) { onSelectLayers([]); return; }
      const target = at(id);
      if (target?.kind === "scene") { scenes.select(id); return; }
      reach(target);
      if (target?.kind === "asset" && target.clip !== undefined) onSelectAsset(target.surface.id, id);
      else onSelectLayers([...next]);
    }} onActivate={activate}
    controls={controls} controlsLabel="Layer controls" menuLabel="Layer options" menuItems={menuItems}
    onCommand={command} onAction={command} renamingID={renamingID}
    onRename={(id, name) => {
      const target = at(id);
      if (target?.kind === "scene") scenes.patch(id, { name });
      else if (target?.kind === "folder") {
        const owner = target.scene?.id ?? null, trimmed = name.trim();
        if (trimmed && (trimmed === target.folder || !folderNames(show, owner).includes(trimmed))) {
          onRenameFolder(target.folder, trimmed, owner);
          const next = folderID(owner, trimmed); onSelect(next);
        }
      }
      else if (target?.kind === "asset" && target.clip) onChangeAsset(target.surface.id, { ...target.clip, name });
      else onPatch(id, { name });
      setRenamingID(null);
    }} onCancelRename={() => setRenamingID(null)}
    canMove={(id, targetID, position) => {
      if (id === targetID) return false;
      const from = at(id), to = at(targetID);
      if (!from || !to) return false;
      // Scenes reorder among themselves; nothing drops *into* one but a layer.
      if (from.kind === "scene") return to.kind === "scene" && position !== "inside";
      if (from.kind === "backdrop" || to.kind === "backdrop") return false;
      if (from.kind === "folder") return canDeleteLayer(show, id) && (to.kind === "scene"
        || (to.kind === "folder" && position !== "inside")
        || (to.kind === "surface" && position !== "inside" && (to.surface.folder !== from.folder || to.scene?.id !== from.scene?.id)));
      if (from.kind === "asset") {
        return Boolean(from.clip && !from.clip.locked && !from.surface.locked
          && to.kind !== "scene" && to.scene?.id === from.scene?.id
          && !(to.kind === "asset" ? to.surface : to.kind === "surface" ? to.surface : undefined)?.locked);
      }
      if (from.surface.locked) return false;
      // A layer onto a scene row moves it into that scene.
      if (to.kind === "scene") return position === "inside" || to.scene.id !== from.scene?.id;
      if (to.kind === "folder") return position === "inside" ? to.folder !== from.surface.folder || to.scene?.id !== from.scene?.id : true;
      return to.kind !== "asset" && position !== "inside";
    }}
    onMove={(id, targetID, position) => {
      const from = at(id), to = at(targetID);
      if (!from || !to) return;
      if (from.kind === "scene" && to.kind === "scene") { scenes.move(id, targetID, position === "inside" ? "after" : position); return; }
      if (from.kind === "asset" && from.clip) {
        onDropAsset(from.surface.id, id, to.kind === "asset" ? to.surface.id : targetID,
          to.kind === "asset" ? to.clip?.id ?? null : null, position === "after");
        return;
      }
      if (from.kind === "surface" || from.kind === "folder") moveRow(id, targetID, position);
    }}
    emptyState={<span>No scenes yet</span>} />;
}
