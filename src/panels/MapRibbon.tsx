import { useEffect, useState } from "react";
import {
  AetherIcon, OverlayScope, ToolIcon, WorkspaceRibbon,
  type RibbonToolProps, type WorkspaceRibbonCommand, type WorkspaceRibbonDensity, type WorkspaceRibbonTab,
} from "@aether/ui";
import { contextCommandsFor, runContextCommand } from "@aether/ui/context-commands";

export type SceneToolKind = 'image' | 'video' | 'camera' | 'colour' | 'text' | 'drawing' | 'generator';
import type { MaskTool } from "../mask/tools";
import type { FeatureKind } from "../features/types";
import type { CompoundShape } from "../features/shape-groups";
import { MAP_RIBBON_VARIANTS, MAP_WORKSPACES, ribbonTabsFor, readRibbonTab, type MapRibbonCommand, type MapRibbonTab, type MapWorkspace } from "./map-ribbon-layout";
import "./MapRibbon.css";

export function MapRibbon(p: {
  docked: boolean;
  /** Scene: make a visual of this kind (image, video, camera, colour, text, drawing, generator). */
  onSceneTool?: (kind: SceneToolKind) => void;
  /** Show workspace: run the next GO cue. */
  onGo?: () => void;
  workspace: MapWorkspace; onWorkspace: (workspace: MapWorkspace) => void;
  onSave: () => void; onOutput: () => void; playing: boolean; onPlay: () => void;
  canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void;
  tool: MaskTool; onTool: (t: MaskTool) => void; cutout: boolean; onCutout: () => void;
  onAdd: (kind: FeatureKind) => void; onAddCompound: (shape: CompoundShape) => void;
  onEdit: () => void; hasSelection: boolean; canEdit?: boolean; canDelete?: boolean; onDelete: () => void;
  onImport: () => void; onExport: () => void; canExport: boolean; onMedia: () => void;
  onTransparentPng: () => void; onNewOutput: () => void; onDevices: () => void; onWireframe: () => void;
  onSetupImage: () => void;
  showInput: boolean; onInput: () => void; blackout: boolean; onBlackout: () => void;
}) {
  const [tabs, setTabs] = useState(() => ({ mapping: readRibbonTab("mapping"), visualization: readRibbonTab("visualization"), show: readRibbonTab("show") }));
  const availableTabs = ribbonTabsFor(p.workspace);
  const activeTab = tabs[p.workspace];
  const [variants, setVariants] = useState<Record<keyof typeof MAP_RIBBON_VARIANTS, MapRibbonCommand>>(() => {
    const initial: Record<keyof typeof MAP_RIBBON_VARIANTS, MapRibbonCommand> = { rect: "rect", ellipse: "ellipse", cube: "cube" };
    try {
      const saved = JSON.parse(localStorage.getItem("aether-map.tool-variants") ?? "{}");
      for (const key of Object.keys(initial) as (keyof typeof initial)[]) {
        if ((MAP_RIBBON_VARIANTS[key] as readonly string[]).includes(saved?.[key])) initial[key] = saved[key];
      }
    } catch { /* Invalid or unavailable preferences use the first variant. */ }
    return initial;
  });
  useEffect(() => {
    try { localStorage.setItem("aether-map.tool-variants", JSON.stringify(variants)); } catch { /* Optional preference. */ }
  }, [variants]);
  // The tool bar keeps its own density; Map only remembers the choice.
  const [density, setDensity] = useState<WorkspaceRibbonDensity>(() => {
    try {
      const stored = localStorage.getItem("aether-map.toolbar-density");
      if (stored === "compact" || stored === "standard" || stored === "expanded") return stored;
    } catch { /* Session-only preferences. */ }
    return "compact";
  });
  useEffect(() => {
    try { localStorage.setItem("aether-map.toolbar-density", density); } catch { /* Device preference only. */ }
  }, [density]);
  const selectWorkspace = (id: string) => {
    const next = MAP_WORKSPACES.find((entry) => entry.id === id);
    if (next && next.id !== p.workspace) p.onWorkspace(next.id);
  };
  const selectTab = (id: string) => {
    if (!availableTabs.some((entry) => entry.id === id)) return;
    setTabs(current => ({ ...current, [p.workspace]: id as MapRibbonTab }));
    try { localStorage.setItem(`aether-map.${p.workspace}.ribbon-tab`, id); } catch { /* Session-only tabs. */ }
  };
  const drawingTool = (tool: MaskTool, icon: "select" | "pen" | "rectangle" | "ellipse" | "polygon" | "freehand", label: string, key: string): RibbonToolProps => ({
    icon: <ToolIcon name={icon} />, label, active: p.tool === tool,
    onClick: () => p.onTool(tool), title: tool === "select" ? `${label} — ${key}` : `${label} — ${key}: draw a surface outline`,
  });
  const commands: Record<MapRibbonCommand, RibbonToolProps> = {
    "setup-image": { icon: <ToolIcon name="backdrop" />, label: "Import backdrop", onClick: p.onSetupImage,
      title: "Import a reference photo for this scene — visible only in the editor" },
    output: { icon: <ToolIcon name="eye" />, label: "Output", onClick: p.onOutput },
    blackout: { icon: <AetherIcon name="hidden" />, label: "Blackout", active: p.blackout, onClick: p.onBlackout },
    go: { icon: <AetherIcon name="play" />, label: "GO", onClick: p.onGo, title: "Run the next manual cue" },
    mask: { icon: <ToolIcon name="mask" />, label: "Mask", onClick: () => p.onAdd("mask"), title: "Create a black layer to cover the projection beneath it" },
    edit: { icon: <ToolIcon name="settings" />, label: "Edit feature", disabled: !p.hasSelection || p.canEdit === false, onClick: p.onEdit },
    delete: { icon: <ToolIcon name="remove" />, label: "Delete", disabled: !p.hasSelection || p.canDelete === false, onClick: p.onDelete },
    node: { icon: <AetherIcon name="node-select" />, label: "Node", active: p.tool === "node", onClick: () => p.onTool("node"), title: "Node — A: edit individual projection corners and outline points" },
    select: drawingTool("select", "select", "Select", "V"),
    pen: { ...drawingTool("pen", "pen", "Pen", "P"),
      title: "Pen / Outline — P: click corners and close a custom surface" },
    rect: { ...drawingTool("rect", "rectangle", "Rectangle", "M"),
      title: "Rectangle — M: drag freely, or hold Shift for a square" },
    square: { ...drawingTool("square", "rectangle", "Square", ""),
      title: "Square: drag an equal-sided projection surface" },
    ellipse: { ...drawingTool("ellipse", "ellipse", "Ellipse", "E"),
      title: "Ellipse — E: drag freely, or hold Shift for a circle" },
    circle: { ...drawingTool("circle", "ellipse", "Circle", ""),
      title: "Circle: drag an equal-sided elliptical projection surface" },
    polygon: drawingTool("polygon", "polygon", "Polygon", "G"),
    cube: { icon: <ToolIcon name="map-cube" />, label: "Cube", onClick: () => p.onAddCompound("cube"),
      title: "Add a cube as three individually selectable, edge-linked surfaces" },
    box: { icon: <ToolIcon name="map-box" />, label: "Box", onClick: () => p.onAddCompound("box"),
      title: "Add a box as five individually selectable, edge-linked surfaces" },
    freehand: drawingTool("freehand", "freehand", "Freehand", "N"),
    cutout: { icon: <ToolIcon name="mask" />, label: "Cutout", active: p.cutout, onClick: p.onCutout, title: "Draw the next surface as a black mask over the layers beneath it" },
    "smart-shape-detection": { icon: <ToolIcon name="smart-shape" />, label: "Smart Shape Detection", disabled: true,
      title: "Coming soon: detect projection shapes from a photo" },
    "transparent-png": { icon: <ToolIcon name="transparent-png" />, label: "Transparent PNG", onClick: p.onTransparentPng,
      title: "Import a transparency-capable PNG as its own mapped surface" },
    "new-output": { icon: <ToolIcon name="panels" />, label: "New Output", onClick: p.onNewOutput,
      title: "Add another scene-bound output for a display or player" },
    devices: { icon: <ToolIcon name="connector" />, label: "Players", onClick: p.onDevices,
      title: "Pair and manage Raspberry Pi output players" },
    input: { icon: <ToolIcon name="panels" />, label: "Input preview", active: p.showInput, onClick: p.onInput },
    "visual-image": { icon: <ToolIcon name="import" />, label: "Image", onClick: () => p.onSceneTool?.("image"), title: "Import images as visuals" },
    "visual-video": { icon: <AetherIcon name="file-video" />, label: "Video", onClick: () => p.onSceneTool?.("video"), title: "Import videos as visuals" },
    "visual-camera": { icon: <ToolIcon name="webcam" />, label: "Camera", onClick: () => p.onSceneTool?.("camera"), title: "A live camera feed" },
    "visual-colour": { icon: <ToolIcon name="fill" />, label: "Colour", onClick: () => p.onSceneTool?.("colour"), title: "A solid colour or gradient" },
    "visual-text": { icon: <ToolIcon name="text" />, label: "Text", onClick: () => p.onSceneTool?.("text"), title: "Titles and lettering" },
    "visual-drawing": { icon: <ToolIcon name="freehand" />, label: "Drawing", onClick: () => p.onSceneTool?.("drawing"), title: "Draw a visual" },
    "visual-generator": { icon: <ToolIcon name="ai-generate" />, label: "Generator", onClick: () => p.onSceneTool?.("generator"), title: "Choose a generator from the gallery" },
  };

  /** One command, as the shared ribbon takes it. */
  const toCommand = (id: MapRibbonCommand): WorkspaceRibbonCommand => {
    const command = commands[id];
    return {
      id, label: command.label, icon: command.icon,
      active: Boolean(command.active), disabled: command.disabled,
      disabledReason: command.disabled ? command.title : undefined,
    };
  };
  /** A split tool: the button is whichever variant is chosen, the caret offers the rest. */
  const toFamily = (id: MapRibbonCommand): WorkspaceRibbonCommand => {
    if (!(id in MAP_RIBBON_VARIANTS)) return toCommand(id);
    const key = id as keyof typeof MAP_RIBBON_VARIANTS;
    const chosen = variants[key];
    return {
      ...toCommand(chosen), id, selectedVariantID: chosen,
      variants: MAP_RIBBON_VARIANTS[key].map((choice) => toCommand(choice)),
    };
  };
  const ribbonTabs: WorkspaceRibbonTab[] = availableTabs.map((tab) => ({
    id: tab.id, label: tab.label,
    groups: tab.groups.map((group) => ({
      id: `${tab.id}:${group.label}`, label: group.label,
      tools: group.tools.map((id) => toFamily(id)),
    })),
  }));
  // The Studio tool bar's suggested commands, right of its Command field.
  const commandShortcuts = [
    { id: "shortcut-undo", label: "Undo", tone: "amber" as const, disabled: !p.canUndo },
    { id: "shortcut-redo", label: "Redo", tone: "blue" as const, disabled: !p.canRedo },
    { id: "shortcut-frame", label: "Frame", tone: "green" as const },
  ];
  /** The button reports its family, which means whichever variant is chosen. */
  const runCommand = (id: string) => {
    if (id === "shortcut-undo") return p.onUndo();
    if (id === "shortcut-redo") return p.onRedo();
    if (id === "shortcut-frame") {
      // The canvas owns Fit and scopes it to its host; reach it the same way
      // the context menu does, through an element inside that scope.
      const host = document.querySelector(".map-canvas-host");
      const fit = host && contextCommandsFor(host).find(command => command.id === "zoom-fit");
      if (fit) runContextCommand(fit);
      return;
    }
    const key = (id in MAP_RIBBON_VARIANTS ? variants[id as keyof typeof MAP_RIBBON_VARIANTS] : id) as MapRibbonCommand;
    if (!commands[key] || commands[key].disabled) return;
    commands[key].onClick?.();
  };
  /** The caret makes a variant the family's choice, then runs it. */
  const chooseVariant = (family: string, variantID: string) => {
    const key = variantID as MapRibbonCommand;
    if (!commands[key] || commands[key].disabled) return;
    setVariants((current) => ({ ...current, [family]: key }));
    commands[key].onClick?.();
  };
  return (
    <OverlayScope role="region" className="map-ribbon" aria-label="Map tools" data-docked={p.docked || undefined}>
      <WorkspaceRibbon compactTools
        workspaces={[]}
        workspaceID={p.workspace} onWorkspaceSelect={selectWorkspace}
        tabs={ribbonTabs} activeTabID={activeTab} onTabSelect={selectTab}
        onCommand={runCommand} onVariantSelect={chooseVariant}
        workspaceLayout="column" appearance="glass" docked={p.docked}
        density={density} onDensityChange={setDensity}
        moreLabel="Tool bar options" commandShortcuts={commandShortcuts} />
    </OverlayScope>
  );
}
