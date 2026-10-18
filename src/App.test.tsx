// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { installPointerEvents } from "./test-pointer";

/**
 * Whole-app wiring. Not a substitute for driving a real browser, but it catches
 * what refactors actually break: a panel that no longer receives its props, a
 * handler wired to the wrong state, a tab that renders nothing.
 */

// Without this each test's App stays mounted, and the next test's queries
// find — and click — buttons belonging to the previous one.
afterEach(cleanup);

beforeEach(() => {
  localStorage.removeItem("aether-map.visual-editor");
  localStorage.removeItem("aether-map.visualization.ribbon-tab");
  localStorage.removeItem("aether-map.tool-variants");
  localStorage.removeItem("aether-map.mapping.ribbon-tab");
  localStorage.removeItem("aether-map.toolbar-density");
  localStorage.removeItem("aether-map.sequence.ribbon-tab");
  installPointerEvents();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "BroadcastChannel",
    class {
      onmessage: ((event: MessageEvent) => void) | null = null;
      postMessage() {}
      close() {}
    },
  );
  window.matchMedia ??= (() => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
});

function ribbonTool(label: string) {
  return within(screen.getByRole('region', {name:'Map tools'})).getByRole('button', {name:label});
}

function changeWorkspace(name: "Mapping" | "Visualization") {
  fireEvent.click(screen.getByRole('button',{name:/Workspace:/}));
  fireEvent.click(screen.getByRole('menuitemradio',{name}));
}

function addLayerSurface() {
  const controls = screen.getAllByRole("group", { name: "Layer controls" })[0];
  fireEvent.click(within(controls).getByRole("button", { name: "More Layer controls" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "New Surface" }));
}

// WorkspaceShell keeps panel content mounted in more than one host, so a
// label can legitimately appear twice. Presence, not uniqueness, is the claim.
const present = (text: string | RegExp) => screen.getAllByText(text).length > 0;
/**
 * A document command from the header's menu. Undo, Redo, Save, Import and
 * Export act on the show rather than on a selection, so they are not ribbon
 * tools — they live with Rename and Save a copy behind the hamburger.
 */
const documentCommand = (name: string) => {
  fireEvent.click(screen.getAllByRole("button", { name: "Document controls" })[0]);
  fireEvent.click(screen.getAllByRole("menuitem", { name: new RegExp(`^${name}`) })[0]);
};
/** Rows of the one content tree: scenes at the root, everything else beneath. */
const treeRows = () =>
  within(screen.getAllByRole("tree", { name: "Layers" })[0]).queryAllByRole("treeitem");
const absent = (text: string | RegExp) => screen.queryAllByText(text).length === 0;
/** A row in one of the trees, not the same name wherever else it appears. */
const clickRow = (tree: string, name: string) =>
  fireEvent.click(within(screen.getAllByRole("tree", { name: tree })[0])
    .getAllByRole("treeitem", { name: new RegExp(name) })[0]);

describe("Aether Map", () => {
  it.each([false, true])("keeps Layers beside Comments in the studio sidebar (saved layout: %s)", (saved) => {
    const previousLayout = localStorage.getItem("aether-map.mapping");
    const previousMode = localStorage.getItem("aether-map.layout");
    try {
      localStorage.setItem("aether-map.layout", "docked");
      if (saved) {
        localStorage.setItem("aether-map.mapping", JSON.stringify({ version: 1, layouts: {
          docked: { layers: { placement: "docked" }, comments: { placement: "docked" } },
        } }));
      } else localStorage.removeItem("aether-map.mapping");
      render(<App />);
      const tabs = screen.getByRole("toolbar", { name: "Left sidebar tabs" });
      const layers = within(tabs).getByRole("button", { name: "Features and parts" });
      const comments = within(tabs).getByRole("button", { name: "Comments" });
      if (comments.getAttribute("aria-pressed") !== "true") fireEvent.click(comments);
      expect(screen.getByRole("tree", { name: "Layers" })).toBeTruthy();
      expect(layers.getAttribute("aria-pressed")).toBe("true");
      expect(comments.getAttribute("aria-pressed")).toBe("true");
      fireEvent.click(layers);
      expect(screen.queryByRole("tree", { name: "Layers" })).toBeNull();
      expect(comments.getAttribute("aria-pressed")).toBe("true");
      fireEvent.click(layers);
      expect(screen.getByRole("tree", { name: "Layers" })).toBeTruthy();
      fireEvent.click(comments);
      expect(comments.getAttribute("aria-pressed")).toBe("false");
    } finally {
      cleanup();
      if (previousLayout === null) localStorage.removeItem("aether-map.mapping");
      else localStorage.setItem("aether-map.mapping", previousLayout);
      if (previousMode === null) localStorage.removeItem("aether-map.layout");
      else localStorage.setItem("aether-map.layout", previousMode);
    }
  });

  /**
   * Properties answers for whatever you selected last. Layers, Scenes and
   * Outputs each keep their own selection, so the panel has to be told which
   * tree was touched — these are the cases that told us it was ambiguous.
   */
  describe("Properties follows the selection", () => {
    it("creating a surface after selecting an output or scene reveals the new surface properties", () => {
      render(<App />);
      clickRow("Outputs", "Output 1");
      addLayerSurface();
      const inspector = screen.getByRole("region", { name: "Selection properties" });
      expect((within(inspector).getByLabelText("Surface name") as HTMLInputElement).value).toBe("Surface 1");
      expect(within(inspector).queryByLabelText("Scene shown on this output")).toBeNull();
      clickRow("Layers", "Scene 1");
      addLayerSurface();
      expect((within(inspector).getByLabelText("Surface name") as HTMLInputElement).value).toBe("Surface 2");
      expect(within(inspector).queryByLabelText("Scene length")).toBeNull();
    });

    it("selecting a surface reopens Properties and edits that surface", () => {
      render(<App />);
      addLayerSurface();
      const toggle = document.querySelector<HTMLButtonElement>('.aui-rail-button[aria-label="Properties"], .aui-tabbed-sidebar-tab[aria-label="Properties"]')!;
      fireEvent.click(toggle);
      clickRow("Layers", "Surface 1");
      expect(toggle.getAttribute("aria-pressed")).toBe("true");
      const inspector = screen.getByRole("region", { name: "Selection properties" });
      fireEvent.change(within(inspector).getByLabelText("Surface name"), { target: { value: "Wall panel" } });
      expect(within(screen.getByRole("tree", { name: "Layers" })).getByRole("treeitem", { name: /Wall panel/ })).toBeTruthy();
      expect(within(inspector).getByLabelText("Top left X")).toBeTruthy();
    });

    it("reveals output properties on selection even after the panel was closed", () => {
      render(<App />);
      const properties = () => document.querySelector<HTMLButtonElement>('.aui-rail-button[aria-label="Properties"], .aui-tabbed-sidebar-tab[aria-label="Properties"]')!;
      if (properties().getAttribute("aria-pressed") === "true") fireEvent.click(properties());
      clickRow("Outputs", "Output 1");
      expect(properties().getAttribute("aria-pressed")).toBe("true");
      const scene = screen.getAllByLabelText("Scene shown on this output")
        .find(el => !el.closest("[hidden]"));
      expect(scene).toBeDefined();
      expect(screen.getAllByLabelText("Crop width").some(el => !el.closest("[hidden]"))).toBe(true);
      // Repeated selection keeps the editor open.
      clickRow("Outputs", "Output 1");
      expect(properties().getAttribute("aria-pressed")).toBe("true");
    });

    it("shows a surface's own sections when a layer is selected", () => {
      render(<App />);
      addLayerSurface();
      clickRow("Layers", "Surface 1");
      // Transform and Color are their own panels on the rail, so Properties
      // carries what is not covered there.
      expect(present("Corners")).toBe(true);
      expect(present("Outline")).toBe(true);
      expect(absent("Content")).toBe(true);
    });

    it("switches to the scene when a scene row is clicked", () => {
      render(<App />);
      addLayerSurface();
      clickRow("Layers", "Surface 1");
      expect(present("Corners")).toBe(true);
      clickRow("Layers", "Scene 1");
      // Check the rail itself: a feature window may independently stay open
      // while Properties follows the selected scene.
      expect(present("Visibility")).toBe(true);
      const railText = Array.from(document.querySelectorAll(".aui-inspector-section-heading"))
        .filter((el) => !el.closest(".aui-feature-window"))
        .map((el) => el.textContent);
      expect(railText).toContain("Visibility");
      expect(railText).not.toContain("Corners");
    });

    it("offers hide and suppress on the selected scene", () => {
      render(<App />);
      clickRow("Layers", "Scene 1");
      expect(screen.getAllByLabelText(/Hidden/).length).toBeGreaterThan(0);
      expect(screen.getAllByLabelText(/Suppressed/).length).toBeGreaterThan(0);
    });

    it("tells you whether anything is projecting the selected scene", () => {
      render(<App />);
      clickRow("Layers", "Scene 1");
      // A new show aims its one output at its one scene.
      expect(present(/Projecting on Output 1/)).toBe(true);
    });
  });

  it("keeps the crossfader out of the content tree", () => {
    render(<App />);
    // It is a live instrument in the Program panel, not a control parked under
    // a tree that lists what the show contains.
    const tree = screen.getAllByRole("tree", { name: "Layers" })[0];
    expect(within(tree.parentElement!).queryByLabelText("Scene to fade toward")).toBeNull();
  });

  it("lists scenes and their layers in one tree, the way artboards nest", () => {
    render(<App />);
    addLayerSurface();
    const tree = screen.getAllByRole("tree", { name: "Layers" })[0];
    const rows = within(tree).getAllByRole("treeitem");
    // The scene is the root and the layer hangs off it.
    expect(rows[0].textContent).toContain("Scene 1");
    expect(rows[0].getAttribute("aria-level")).toBe("1");
    const surface = rows.find((row) => row.textContent?.includes("Surface 1"))!;
    expect(surface.getAttribute("aria-level")).toBe("2");
    // And there is no separate Scenes tree left.
    expect(screen.queryAllByRole("tree", { name: "Scenes" })).toHaveLength(0);
  });

  it("mounts with a scene and an empty layer list", () => {
    render(<App />);
    expect(present("Scene 1")).toBe(true);
    // The scene is the only row: it has nothing in it yet.
    expect(treeRows()).toHaveLength(1);
  });

  it("adds a surface from the ribbon and lists it as a layer", () => {
    render(<App />);
    addLayerSurface();
    expect(present("Surface 1")).toBe(true);
    expect(treeRows()).toHaveLength(2);
  });

  it("undoes the surface it just added", () => {
    render(<App />);
    addLayerSurface();
    expect(present("Surface 1")).toBe(true);
    documentCommand("Undo");
    expect(treeRows()).toHaveLength(1);
    expect(absent("Surface 1")).toBe(true);
  });

  it("adds a scene and makes it the active one", () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole("button", { name: "New scene" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(present("Scene 2")).toBe(true);
    // Surfaces belong to a scene: the new one starts empty, so the tree is two
    // scene rows and nothing under either.
    expect(treeRows()).toHaveLength(2);
  });

  it("keeps each scene's surfaces separate, and shows whose they are", () => {
    render(<App />);
    addLayerSurface();
    fireEvent.click(screen.getAllByRole("button", { name: "New scene" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    // Both scenes are in the one tree now, so "separate" is about nesting
    // rather than about one of them being absent.
    const tree = screen.getAllByRole("tree", { name: "Layers" })[0];
    const rows = within(tree).getAllByRole("treeitem");
    const sceneOne = rows.findIndex((row) => row.textContent?.includes("Scene 1"));
    const sceneTwo = rows.findIndex((row) => row.textContent?.includes("Scene 2"));
    const surface = rows.findIndex((row) => row.textContent?.includes("Surface 1"));
    expect(surface).toBeGreaterThan(sceneOne);
    expect(surface).toBeLessThan(sceneTwo);
    // Scene 2 has nothing under it: the next row after it is nothing at all.
    expect(rows).toHaveLength(3);
  });

  it("opens independent bottom panels and keeps export in the document menu", () => {
    render(<App />);
    let tray = screen.getByRole("toolbar", { name: "Map workspace dock tabs" });
    expect(within(tray).getAllByRole("button").map(tab => tab.getAttribute("aria-label"))).toEqual(["Surfaces", "Timeline"]);
    changeWorkspace("Visualization");
    fireEvent.click(screen.getByRole("button", { name: "Advanced editor" }));
    tray = screen.getByRole("toolbar", { name: "Map workspace dock tabs" });
    const timeline = within(tray).getByRole("button", { name: "Timeline" });
    const audio = within(screen.getByRole("toolbar", { name:"Timeline tools" })).getByRole("button", { name: "Audio mixer" });
    expect(audio.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(audio);
    expect(timeline.getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('complementary', { name:'Audio mixer' })).toBeNull();
    fireEvent.click(audio);
    fireEvent.click(timeline);
    expect(screen.queryByRole('complementary', { name:'Audio mixer' })).toBeNull();
    fireEvent.click(timeline);
    expect(screen.getByRole('complementary', { name:'Audio mixer' })).toBeTruthy();
    fireEvent.click(within(screen.getByRole('toolbar', {name:'Timeline tools'})).getByRole('button', {name:'Audio mixer'}));
    fireEvent.click(timeline);
    fireEvent.click(timeline);
    expect(screen.queryByRole('complementary', { name:'Audio mixer' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name:'Document controls' }));
    fireEvent.click(screen.getByRole('menuitem', { name:'Export options…' }));
    expect(present('Project bundle')).toBe(true);
  });

  it("selects a surface and shows its properties", () => {
    render(<App />);
    addLayerSurface();
    expect(screen.getAllByDisplayValue("Surface 1").length).toBeGreaterThan(0);
    // The mask controls only exist once something is selected.
    expect(present("Outline from quad")).toBe(true);
  });

  it("reports plainly that saving needs the host when running unhosted", () => {
    render(<App />);
    documentCommand("Save show");
    expect(present(/needs the Aether Studio host/i)).toBe(true);
  });

  it("renders the canvas with zoom controls and a resizable separator", () => {
    render(<App />);
    expect(document.querySelector(".map-canvas-host")).toBeTruthy();
    expect(document.querySelector(".map-zoom")).toBeTruthy();
    expect(document.querySelector('[role="separator"]')).toBeTruthy();
  });

  it("turns a drawn rectangle into a new surface, with no selection needed", () => {
    render(<App />);
    // M is the rectangle tool, as on the ribbon. Nothing is selected.
    fireEvent.keyDown(window, { key: "m" });
    const host = document.querySelector(".map-canvas-host")!;
    expect(host.classList.contains("is-drawing")).toBe(true);
    fireEvent.pointerDown(host, { button: 0, clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(host, { clientX: 500, clientY: 400, pointerId: 1 });
    fireEvent.pointerUp(host, { clientX: 500, clientY: 400, pointerId: 1 });
    expect(present("Surface 1")).toBe(true);
    // A rectangle is its own quad: no separate outline to draw.
    expect(document.querySelectorAll(".map-mask-outline")).toHaveLength(0);
    // Escape returns to Select, the sketch way.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(host.classList.contains("is-drawing")).toBe(false);
  });

  it("turns a drawn ellipse into a surface that keeps its outline", () => {
    render(<App />);
    fireEvent.keyDown(window, { key: "e" });
    const host = document.querySelector(".map-canvas-host")!;
    fireEvent.pointerDown(host, { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(host, { clientX: 400, clientY: 300, pointerId: 1 });
    expect(present("Surface 1")).toBe(true);
    expect(document.querySelectorAll(".map-mask-outline")).toHaveLength(1);
    expect(present(/4 points/)).toBe(true);
    expect(document.querySelectorAll(".map-curve-control")).toHaveLength(8);
  });

  it("creates a black mask in Mapping without treating it as visual-only content", () => {
    render(<App />);
    fireEvent.click(ribbonTool("Mask"));
    expect(present("Mask 1")).toBe(true);
    expect(document.querySelector<HTMLElement>(".map-fill")?.style.background).toBe("rgb(0, 0, 0)");
  });

  it("draws a cutout as a black surface", () => {
    render(<App />);
    fireEvent.click(ribbonTool("Cutout"));
    fireEvent.keyDown(window, { key: "m" });
    const host = document.querySelector(".map-canvas-host")!;
    fireEvent.pointerDown(host, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(host, { clientX: 200, clientY: 200, pointerId: 1 });
    expect(present("Cutout 1")).toBe(true);
    expect(document.querySelector<HTMLElement>(".map-fill")?.style.background).toBe("rgb(0, 0, 0)");
    changeWorkspace("Visualization");
    const fill = document.querySelector<HTMLElement>(".map-fill");
    expect(fill?.style.background).toMatch(/rgb\(0, 0, 0\)|#000000/);
  });

  it("does not steal tool shortcuts from a text field", () => {
    render(<App />);
    addLayerSurface();
    const name = screen.getAllByDisplayValue("Surface 1")[0];
    fireEvent.keyDown(name, { key: "m" });
    expect(document.querySelector(".map-canvas-host")?.classList.contains("is-drawing")).toBe(false);
  });

  it("switches rooms from the workspace tray and keeps the document with a Mapping-only toolbar", () => {
    render(<App />);
    addLayerSurface();
    expect(document.querySelector('.map-ribbon')).not.toBeNull();
    expect(screen.getByRole('button', {name:'Workspace: Mapping'}).closest('.aui-shell-fltoolbar')).not.toBeNull();
    changeWorkspace('Visualization');
    expect(screen.getByRole('region', { name: 'Simple visualization workspace' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Advanced editor' }));
    expect(present('Surface 1')).toBe(true);
    expect(screen.getAllByLabelText('Search Pixabay or paste a link').length).toBeGreaterThan(0);
    changeWorkspace('Mapping');
    expect(present('Surface 1')).toBe(true);
  });

  it("reorders simple layers with undo/redo and preserves their order across editor modes", () => {
    render(<App />);
    addLayerSurface();
    changeWorkspace('Visualization');
    fireEvent.click(screen.getByRole('button', { name: 'Browse visual gallery' }));
    fireEvent.click(screen.getByRole('button', { name: 'Solid color' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Asset name' }), { target: { value: 'Background' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add visual' }));
    fireEvent.click(screen.getByRole('button', { name: 'Solid color' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Asset name' }), { target: { value: 'Foreground' } });
    const order = () => within(screen.getByRole('group', { name: 'Layers, front to back' })).getAllByRole('button').map(b => b.getAttribute('aria-label'));
    expect(order()).toEqual(['Select Foreground', 'Select Background']);
    fireEvent.click(screen.getByRole('button', { name: 'Send to back' }));
    expect(order()).toEqual(['Select Background', 'Select Foreground']);
    documentCommand('Undo');
    expect(order()).toEqual(['Select Foreground', 'Select Background']);
    documentCommand('Redo');
    expect(order()).toEqual(['Select Background', 'Select Foreground']);
    fireEvent.click(screen.getByRole('button', { name: 'Advanced editor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Switch to simple editor' }));
    expect(order()).toEqual(['Select Background', 'Select Foreground']);
  });

  it("defaults Main to one layer per surface and gives each surface V1/A1", () => {
    render(<App />);
    addLayerSurface();
    addLayerSurface();
    changeWorkspace("Visualization");
    fireEvent.click(screen.getByRole("button", { name: "Advanced editor" }));
    const timelineButton = within(screen.getByRole("toolbar", { name: "Map workspace dock tabs" })).getByRole("button", { name: "Timeline" });
    if (timelineButton.getAttribute("aria-pressed") !== "true") fireEvent.click(timelineButton);
    fireEvent.change(screen.getByRole("combobox", { name: "Timeline mode" }), { target: { value: "advanced" } });
    expect(document.querySelectorAll(".map-track-head:not(.map-track-head--ruler)")).toHaveLength(3);
    expect(document.querySelectorAll(".map-clip")).toHaveLength(2);
    fireEvent.click(within(screen.getByRole('tablist', {name:'Timelines'})).getByRole('tab', {name:'Surface 1'}));
    expect(document.querySelectorAll('.map-track-head:not(.map-track-head--ruler)')).toHaveLength(2);
    expect(document.querySelectorAll('.map-clip')).toHaveLength(0);

  });

  it("adds and targets a simple visual, keeps it in advanced, and undoes the edit across mode switches", () => {
    render(<App />);
    addLayerSurface();
    changeWorkspace('Visualization');
    fireEvent.click(screen.getByRole('button', { name: 'Browse visual gallery' }));
    fireEvent.click(screen.getByRole('button', { name: 'Solid color' }));
    expect(screen.getByRole('button', { name: 'Assign to Surface 1' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.change(screen.getByRole('textbox', { name: 'Asset name' }), { target: { value: 'Wall wash' } });
    fireEvent.click(screen.getByRole('button', { name: 'Advanced editor' }));
    expect(screen.getByRole('textbox', { name: 'Asset name' }).getAttribute('value')).toBe('Wall wash');
    fireEvent.click(screen.getByRole('button', { name: 'Switch to simple editor' }));
    expect(screen.getByRole('button', { name: 'Assign to Surface 1' }).getAttribute('aria-pressed')).toBe('true');
    documentCommand('Undo');
    expect(screen.getByRole('textbox', { name: 'Asset name' }).getAttribute('value')).toBe('Colour');
    documentCommand('Redo');
    expect(screen.getByRole('textbox', { name: 'Asset name' }).getAttribute('value')).toBe('Wall wash');
  });

  it("colours a layer's outline on the canvas", () => {
    render(<App />);
    addLayerSurface();
    const outline = document.querySelector<SVGElement>(".map-outline");
    expect(outline?.classList.contains("is-selected")).toBe(true);
    fireEvent.pointerDown(document.querySelector(".map-canvas-host")!, { button: 0, clientX: 0, clientY: 0 });
    expect(outline?.style.stroke).toBeTruthy();
  });
});


describe("component deletion", () => {
  it("deletes a selected cube through the Layers footer, preserves both scenes, and undoes all faces together", () => {
    render(<App />);
    addLayerSurface();
    fireEvent.click(screen.getAllByRole("button", { name: "New scene" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    fireEvent.click(ribbonTool("Cube"));
    clickRow("Layers", "^Cube 3 layers$");
    const controls = screen.getAllByRole("group", { name: "Layer controls" })[0];
    fireEvent.click(within(controls).getByRole("button", { name: "More Layer controls" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /^Delete group/ }));
    expect(treeRows().map(row => row.getAttribute("aria-label") ?? row.textContent)).not.toContain("Cube");
    expect(treeRows()).toHaveLength(3); // two scenes plus the unrelated surface
    documentCommand("Undo");
    expect(treeRows()).toHaveLength(7); // group + all three faces restored
    expect(treeRows().filter(row => row.getAttribute("aria-level") === "1")).toHaveLength(2);
  });
  it("deletes a whole cube from the toolbar, then only one face when a face is selected", () => {
    render(<App />);
    fireEvent.click(ribbonTool("Cube"));
    fireEvent.click(ribbonTool("Delete"));
    expect(treeRows()).toHaveLength(1);
    documentCommand("Undo");
    clickRow("Layers", "Cube right");
    fireEvent.click(ribbonTool("Delete"));
    expect(treeRows()).toHaveLength(4); // scene, group, two faces
  });
  it("deletes the selected box with the canvas Delete key", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Cube variants" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Box" }));
    expect(treeRows()).toHaveLength(7);
    fireEvent.keyDown(document.querySelector(".map-canvas-host")!, { key: "Delete" });
    expect(treeRows()).toHaveLength(1);
    documentCommand("Undo");
    expect(treeRows()).toHaveLength(7);
  });
});


it("deletes the last output from the toolbar without deleting a previously selected cube, and undoes it", () => {
  render(<App />);
  fireEvent.click(ribbonTool("Cube"));
  const before = treeRows().length;
  expect(screen.queryByRole("button", { name: "Outputs" })).toBeNull();
  const retainedLayerRows = () => within(screen.getByRole("tree", { name: "Layers", hidden: true })).queryAllByRole("treeitem", { hidden: true });
  clickRow("Outputs", "Output 1");
  fireEvent.click(ribbonTool("Delete"));
  expect(within(screen.getByRole("tree", { name: "Outputs" })).queryAllByRole("treeitem")).toHaveLength(0);
  expect(retainedLayerRows()).toHaveLength(before);
  expect(document.querySelector(".map-crop-overlay")).toBeNull();
  documentCommand("Undo");
  expect(within(screen.getByRole("tree", { name: "Outputs" })).getAllByRole("treeitem")).toHaveLength(1);
  expect(retainedLayerRows()).toHaveLength(before);
  const row = within(screen.getByRole("tree", { name: "Outputs" })).getByRole("treeitem");
  fireEvent.click(row);
  fireEvent.keyDown(row, { key: "Delete" });
  expect(within(screen.getByRole("tree", { name: "Outputs" })).queryAllByRole("treeitem")).toHaveLength(0);
  expect(retainedLayerRows()).toHaveLength(before);
});

it('shows cube pose for the selected compound and updates mapping geometry with ordinary undo',()=>{
 render(<App/>);fireEvent.click(ribbonTool('Cube'));
 const panel=screen.getAllByRole('region',{name:'Cube pose'})[0];
 const points=()=>Array.from(panel.querySelectorAll('polygon')).map(p=>p.getAttribute('points'));
 const before=points(),field=within(panel).getByRole('textbox',{name:'Cube X angle'});
 fireEvent.change(field,{target:{value:'12'}});fireEvent.blur(field);fireEvent.click(within(panel).getByRole('button',{name:'Apply pose angles'}));
 expect(points()).not.toEqual(before);documentCommand('Undo');expect(points()).toEqual(before);
 fireEvent.click(within(panel).getByRole('button',{name:'Turn inside out'}));expect(points()).not.toEqual(before);
 documentCommand('Undo');expect(points()).toEqual(before);
 const pad=within(panel).getByRole('group',{name:'Drag cube pose'});
 fireEvent.pointerDown(pad,{button:0,clientX:20,clientY:20});fireEvent.pointerMove(pad,{clientX:36,clientY:28});expect(points()).not.toEqual(before);
 fireEvent.keyDown(pad,{key:'Escape'});expect(points()).toEqual(before);
 fireEvent.pointerDown(pad,{button:0,clientX:20,clientY:20});fireEvent.pointerMove(pad,{clientX:32,clientY:24});fireEvent.pointerMove(pad,{clientX:36,clientY:28});fireEvent.pointerUp(pad);
 expect(points()).not.toEqual(before);documentCommand('Undo');expect(points()).toEqual(before);
});

it('opens Players when returning from the dedicated pairing flow', async () => {
  const previous = location.pathname + location.search;
  history.replaceState(null, '', '/map/index.html?players=1');
  try {
    render(<App />);
    expect(await screen.findByRole('dialog', { name: 'Devices' })).toBeTruthy();
  } finally { history.replaceState(null, '', previous); }
});
