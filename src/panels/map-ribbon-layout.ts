/** Map's command grouping; presentation comes from the same shared ribbon as CAD. */
import type { ShowOutput } from "../document";
import type { CompoundShape } from "../features/shape-groups";
import type { FeatureKind } from "../features/types";
import type { MaskTool } from "../mask/tools";

export type MapWorkspace = "mapping" | "visualization" | "show";

export const MAP_WORKSPACES = [
  { id: "mapping", label: "Mapping" },
  { id: "visualization", label: "Visualization" },
  { id: "show", label: "Show" },
] as const;

export const MAP_RIBBON_TABS = [
  { id: "create", label: "Create", groups: [
    { label: "Select", tools: ["select", "node"] },
    { label: "Scene setup", tools: ["setup-image", "transparent-png"] },
    { label: "Shapes", tools: ["pen", "rect", "ellipse", "polygon", "cube", "freehand"] },
    { label: "Masks", tools: ["mask", "cutout"] },
    { label: "Smart Tools", tools: ["smart-shape-detection"] },
    // Undo, Redo and Save are document commands, not tools: they act on the
    // show rather than on whatever you have pointed at. They live in the
    // header's document menu with Rename, Save a copy and the rest.
    { label: "Edit", tools: ["edit", "delete"] },
  ] },
  { id: "media", label: "Visuals", groups: [
    { label: "Select", tools: ["select"] },
    { label: "Edit", tools: ["edit", "delete"] },
    // Source creation and import belong to the Media Pool.
    { label: "Preview", tools: ["input"] },
  ] },
  { id: "output", label: "Output", groups: [
    { label: "Display", tools: ["output", "new-output", "devices", "blackout"] },
    { label: "Playback", tools: ["play"] },
  ] },
] as const;

/** Each command has one catalogue entry; rooms expose only their relevant tabs. */
export function ribbonTabsFor(workspace: MapWorkspace) {
  return MAP_RIBBON_TABS.filter(tab => workspace === "mapping" ? tab.id === "create" : workspace === "show" ? tab.id === "output" : tab.id !== "create");
}

export type MapRibbonTab = (typeof MAP_RIBBON_TABS)[number]["id"];
export const MAP_RIBBON_VARIANTS = {
  rect: ["rect", "square"],
  ellipse: ["ellipse", "circle"],
  cube: ["cube", "box"],
} as const;
export type MapRibbonCommand = (typeof MAP_RIBBON_TABS)[number]["groups"][number]["tools"][number]
  | (typeof MAP_RIBBON_VARIANTS)[keyof typeof MAP_RIBBON_VARIANTS][number];

/**
 * Adding a drawing tool, generated source, compound shape or output kind must
 * declare its workspace route. Sources use the Media Pool Generators tab.
 */
export const MAP_TOOL_ENTRYPOINTS = {
  select: "select", node: "node", pen: "pen", rect: "rect", square: "square",
  ellipse: "ellipse", circle: "circle", polygon: "polygon",
  freehand: "freehand", paint: "generators",
  surface: "rect", mask: "mask", text: "generators", shader: "generators",
  webcam: "generators", tracker: "generators", cube: "cube", box: "box",
  cutout: "cutout", "transparent-png": "transparent-png",
  "mapping-background": "setup-image",
  "smart-shape-detection": "smart-shape-detection",
  monitor: "output", cast: "output", airplay: "output", edge: "output",
} as const satisfies Record<MaskTool | FeatureKind | CompoundShape | ShowOutput["kind"] |
  "cutout" | "transparent-png" | "mapping-background" | "smart-shape-detection", MapRibbonCommand | "generators">;

export function readRibbonTab(workspace: MapWorkspace): MapRibbonTab {
  const tabs = ribbonTabsFor(workspace);
  try {
    const value = localStorage.getItem(`aether-map.${workspace}.ribbon-tab`)
      ?? (workspace === "visualization" ? localStorage.getItem("aether-map.sequence.ribbon-tab") : null);
    return tabs.find((tab) => tab.id === value)?.id ?? tabs[0].id;
  } catch { return tabs[0].id; }
}
