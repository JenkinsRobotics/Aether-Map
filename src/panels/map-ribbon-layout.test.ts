import { expect, test } from "vitest";
import { MAP_RIBBON_TABS, MAP_RIBBON_VARIANTS, MAP_TOOL_ENTRYPOINTS, ribbonTabsFor, readRibbonTab } from "./map-ribbon-layout";

test("every declared Map tool resolves to its ribbon or Media Pool route", () => {
  const primary = MAP_RIBBON_TABS.flatMap(tab => tab.groups.flatMap(group => group.tools));
  const commands = new Set([...primary, ...Object.values(MAP_RIBBON_VARIANTS).flat()]);
  for (const anchor of Object.keys(MAP_RIBBON_VARIANTS)) {
    expect(primary).toContain(anchor);
  }
  for (const [tool, command] of Object.entries(MAP_TOOL_ENTRYPOINTS)) {
    expect(command === "generators" || commands.has(command), `${tool} should have a workspace entry`).toBe(true);
  }
  expect(MAP_RIBBON_VARIANTS.rect).toEqual(["rect", "square"]);
  expect(MAP_RIBBON_VARIANTS.ellipse).toEqual(["ellipse", "circle"]);
  expect(MAP_RIBBON_VARIANTS.cube).toEqual(["cube", "box"]);
  expect(primary).not.toContain("square");
  expect(primary).not.toContain("circle");
  expect(primary).not.toContain("box");
  expect(primary).not.toContain("add-shape");
  expect(primary).not.toContain("surface");
  const create = MAP_RIBBON_TABS.find(tab => tab.id === "create")!;
  expect(create.groups.find(group => group.label === "Shapes")?.tools).toContain("rect");
  expect(create.groups.find(group => group.label === "Smart Tools")?.tools)
    .toEqual(["smart-shape-detection"]);
  expect(MAP_TOOL_ENTRYPOINTS.surface).toBe("rect");
  expect(MAP_TOOL_ENTRYPOINTS["smart-shape-detection"]).toBe("smart-shape-detection");
  expect(MAP_TOOL_ENTRYPOINTS.square).toBe("square");
  expect(MAP_TOOL_ENTRYPOINTS.circle).toBe("circle");
  expect(MAP_TOOL_ENTRYPOINTS.cube).toBe("cube");
  expect(MAP_TOOL_ENTRYPOINTS.box).toBe("box");
  expect(MAP_TOOL_ENTRYPOINTS.airplay).toBe("output");
});


test("Mapping owns geometry, Visualization owns visuals and output; every tool remains reachable", () => {
  const commands = (room: "mapping" | "visualization") => ribbonTabsFor(room).flatMap(tab => tab.groups.flatMap(group => [...group.tools]));
  const mapping = commands("mapping"), visuals = commands("visualization");
  for (const id of ["rect", "ellipse", "cube", "mask", "cutout", "setup-image", "smart-shape-detection"]) expect(mapping).toContain(id);
  for (const id of ["play", "output"]) {
    expect(visuals).toContain(id); expect(mapping).not.toContain(id);
  }
  for (const id of ["text", "shader", "webcam", "tracker", "paint", "media"]) expect(visuals).not.toContain(id);
  for (const tab of MAP_RIBBON_TABS) for (const group of tab.groups) for (const id of group.tools)
    expect([...mapping, ...visuals]).toContain(id);
  expect(readRibbonTab("mapping")).toBe("create");
  expect(readRibbonTab("visualization")).toBe("media");
});
