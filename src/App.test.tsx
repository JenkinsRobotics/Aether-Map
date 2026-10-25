// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { installPointerEvents } from "./test-pointer";

// The footer widgets toggle from the aux toolbar, like the aux sidebar panels.
// The Timeline toggle only exists outside the Mapping workspace.
const openTimelineDock = () => {
  const rail = document.querySelector(".aui-studio-aux-toolbar") as HTMLElement;
  const timeline = within(rail).getByRole("button", { name: "Timeline" });
  if (timeline.getAttribute("aria-pressed") !== "true") fireEvent.click(timeline);
};


/**
 * Whole-app wiring. Not a substitute for driving a real browser, but it catches
 * what refactors actually break: a panel that no longer receives its props, a
 * handler wired to the wrong state, a tab that renders nothing.
 */

// Without this each test's App stays mounted, and the next test's queries
// find — and click — buttons belonging to the previous one.
afterEach(cleanup);

beforeEach(() => {
  localStorage.removeItem("aether-map.bottom-dock.v1");
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
  // The classic ribbon presents each tool twice (labeled group + compact
  // strip), matching CAD's standard toolbar; either instance runs the tool.
  return within(screen.getByRole('region', {name:'Map tools'})).getAllByRole('button', {name:label})[0];
}

function changeWorkspace(name: "Mapping" | "Content" | "Scene") {
  fireEvent.click(screen.getByRole('button',{name:/Workspace:/}));
  fireEvent.click(screen.getByRole('menuitemradio',{name}));
}

function addLayerSurface() {
  const controls = screen.getAllByRole("group", { name: "Layer controls" })[0];
  // The tray shows New Surface directly unless it overflows into More.
  const direct = within(controls).queryByRole("button", { name: "New Surface" });
  if (direct) { fireEvent.click(direct); return; }
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
// The Document controls hamburger lives in the file footer's actions cluster
// (the standard slot), so the files widget must be open to reach it.
const openDocumentControls = () => {
  // Simple visuals has no aux rail; its footer already shows the file row.
  const rail = document.querySelector(".aui-studio-aux-toolbar");
  const files = rail && within(rail as HTMLElement).getByRole("button", { name: "Open files" });
  if (files && files.getAttribute("aria-pressed") !== "true") fireEvent.click(files);
  fireEvent.click(screen.getAllByRole("button", { name: "Document controls" })[0]);
};
const documentCommand = (name: string) => {
  openDocumentControls();
  fireEvent.click(screen.getAllByRole("menuitem", { name: new RegExp(`^${name}`) })[0]);
};
/** Mapping's one artboard tree: canvases at the root, the open (active)
 * canvas's layers beneath it. */
const layerTree = () => screen.getAllByRole("tree", { name: "Layers" })[0];
const treeRows = () => within(layerTree()).queryAllByRole("treeitem").filter(row => row.getAttribute("aria-level") !== "1");
const sceneRows = () => within(layerTree()).queryAllByRole("treeitem").filter(row => row.getAttribute("aria-level") === "1");
/** Right-click on the tree's empty space, then a creation command. */
const treeCommand = (name: string) => {
  fireEvent.contextMenu(layerTree());
  fireEvent.click(screen.getByRole("menuitem", { name }));
};
const absent = (text: string | RegExp) => screen.queryAllByText(text).length === 0;
/** A row in one of the trees, not the same name wherever else it appears. */
const clickRow = (tree: string, name: string) =>
  fireEvent.click(within(screen.getAllByRole("tree", { name: tree })[0])
    .getAllByRole("treeitem", { name: new RegExp(name) })[0]);

describe("Aether Map", () => {
  it.each([false, true])("keeps Layers beside Comments in the studio sidebar (saved layout: %s)", (saved) => {
    const previousLayout = localStorage.getItem("aether-map.mapping.studio-v1");
    const previousMode = localStorage.getItem("aether-map.layout.studio-v1");
    try {
      localStorage.setItem("aether-map.layout.studio-v1", "docked");
      if (saved) {
        localStorage.setItem("aether-map.mapping.studio-v1", JSON.stringify({ version: 1, layouts: {
          docked: { layers: { placement: "docked" }, comments: { placement: "docked" } },
        } }));
      } else localStorage.removeItem("aether-map.mapping.studio-v1");
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
      if (previousLayout === null) localStorage.removeItem("aether-map.mapping.studio-v1");
      else localStorage.setItem("aether-map.mapping.studio-v1", previousLayout);
      if (previousMode === null) localStorage.removeItem("aether-map.layout.studio-v1");
      else localStorage.setItem("aether-map.layout.studio-v1", previousMode);
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
      clickRow("Layers", "Canvas 1");
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
      clickRow("Layers", "Canvas 1");
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
      clickRow("Layers", "Canvas 1");
      expect(screen.getAllByLabelText(/Hidden/).length).toBeGreaterThan(0);
      expect(screen.getAllByLabelText(/Suppressed/).length).toBeGreaterThan(0);
    });

    it("tells you whether anything is projecting the selected scene", () => {
      render(<App />);
      clickRow("Layers", "Canvas 1");
      // A new show aims its one output at its one scene.
      expect(present(/Projecting on Output 1/)).toBe(true);
    });
  });

  it("Scene and Show offer the backdrop toggle in the view tools, like Mapping", () => {
    render(<App />);
    for (const name of ["Scene", "Show"] as const) {
      fireEvent.click(screen.getByRole('button',{name:/Workspace:/})); fireEvent.click(screen.getByRole('menuitemradio',{name}));
      const tools = screen.getAllByRole("toolbar", { name: "View tools" })[0];
      // No backdrop imported yet: present, but nothing to toggle.
      expect(within(tools).getByRole("button", { name: "Backdrop image" }).hasAttribute("disabled")).toBe(true);
    }
  });

  it("keeps the crossfader out of the content tree", () => {
    render(<App />);
    // It is a live instrument in the Program panel, not a control parked under
    // a tree that lists what the show contains.
    const tree = screen.getAllByRole("tree", { name: "Layers" })[0];
    expect(within(tree.parentElement!).queryByLabelText("Scene to fade toward")).toBeNull();
  });

  it("is one artboard tree: each canvas holds its layers, with a single + in the header", () => {
    render(<App />);
    addLayerSurface();
    const surface = treeRows().find((row) => row.textContent?.includes("Surface 1"))!;
    expect(surface.getAttribute("aria-level")).toBe("2");
    expect(sceneRows().map((row) => row.textContent)).toEqual([expect.stringContaining("Canvas 1")]);
    expect(screen.queryByRole("tree", { name: "Canvases" })).toBeNull();
    const header = screen.getAllByRole("group", { name: "Layer controls" })[0];
    expect(within(header).getAllByRole("button").map(b => b.getAttribute("aria-label"))).toEqual(["New Surface"]);
  });

  it("mounts with a scene and an empty layer list", () => {
    render(<App />);
    expect(sceneRows()).toHaveLength(1);
    expect(treeRows()).toHaveLength(0);
  });

  it("adds a surface from the ribbon and lists it as a layer", () => {
    render(<App />);
    addLayerSurface();
    expect(present("Surface 1")).toBe(true);
    expect(treeRows()).toHaveLength(1);
  });

  it("undoes the surface it just added", () => {
    render(<App />);
    addLayerSurface();
    expect(present("Surface 1")).toBe(true);
    documentCommand("Undo");
    expect(treeRows()).toHaveLength(0);
    expect(absent("Surface 1")).toBe(true);
  });

  it("adds a scene and makes it the active one", () => {
    render(<App />);
    treeCommand("New canvas");
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(sceneRows()).toHaveLength(2);
    // The new scene is active, and it starts empty.
    expect(treeRows()).toHaveLength(0);
  });

  it("keeps each scene's surfaces separate: selecting a scene switches the list", () => {
    render(<App />);
    addLayerSurface();
    treeCommand("New canvas");
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    // Each canvas holds its own: Surface 1 sits under Canvas 1, Canvas 2 is empty.
    clickRow("Layers", "Canvas 1");
    const rows = within(layerTree()).queryAllByRole("treeitem").map(row => `${row.getAttribute("aria-level")}:${row.textContent?.trim()}`);
    expect(rows).toEqual([expect.stringMatching(/^1:Canvas 1/), expect.stringMatching(/^2:Surface 1/), expect.stringMatching(/^1:Canvas 2/)]);
  });

  it("opens the Visual gallery from the sidebar + in advanced, as in simple", () => {
    render(<App />);
    changeWorkspace("Scene");
    fireEvent.click(screen.getByRole("button", { name: "Advanced editor" }));
    fireEvent.click(within(document.querySelector(".map-visual-panel-title") as HTMLElement).getByRole("button", { name: "Add layer" }));
    expect(screen.getByRole("dialog", { name: "Visual gallery" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Solid color" }));
    expect(within(screen.getByRole("list", { name: "Visuals" })).getAllByRole("button", { name: /^Select Colour/ })).toHaveLength(1);
  });

  it("offers the Advanced gallery sources: test pattern, tracker and the show's own pool", () => {
    render(<App />);
    changeWorkspace("Scene");
    fireEvent.click(screen.getByRole("button", { name: "Advanced editor" }));
    const open = () => fireEvent.click(within(document.querySelector(".map-visual-panel-title") as HTMLElement).getByRole("button", { name: "Add layer" }));
    open();
    fireEvent.click(screen.getByRole("button", { name: "Test pattern" }));
    expect(within(screen.getByRole("list", { name: "Visuals" })).getAllByRole("button", { name: /^Select Test pattern/ })).toHaveLength(1);
    open();
    expect(screen.getByRole("button", { name: "Tracker" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "In this show" }));
    expect(screen.getByRole("main", { name: "In this show" })).toBeTruthy();
  });

  it("opens independent bottom panels and keeps export in the document menu", () => {
    render(<App />);
    // Mapping has no timeline: its aux toolbar toggles only files and surfaces.
    const mappingRail = document.querySelector(".aui-studio-aux-toolbar") as HTMLElement;
    expect(within(mappingRail).queryByRole("button", { name: "Timeline" })).toBeNull();
    expect(within(mappingRail).getByRole("button", { name: "Open files" })).toBeTruthy();
    expect(within(mappingRail).getByRole("button", { name: "Mapped surfaces" })).toBeTruthy();
    changeWorkspace("Scene");
    fireEvent.click(screen.getByRole("button", { name: "Advanced editor" }));
    // The aux toolbar's Timeline toggle docks the timeline in the footer.
    const tray = (openTimelineDock(), document.querySelector(".aui-studio-aux-toolbar") as HTMLElement);
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
    openDocumentControls();
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
    changeWorkspace("Scene");
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
    changeWorkspace('Scene');
    expect(screen.getByRole('region', { name: 'Simple visualization workspace' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Advanced editor' }));
    expect(present('Surface 1')).toBe(true);
    expect(screen.getAllByLabelText('Search Pixabay or paste a link').length).toBeGreaterThan(0);
    changeWorkspace('Mapping');
    expect(present('Surface 1')).toBe(true);
  });

  it("Content opens a clip on its board, and switching workspaces records nothing to undo", () => {
    render(<App />);
    changeWorkspace('Content');
    expect(screen.getByLabelText('Clip board')).toBeTruthy();
    expect(screen.getByText(/^Clip 1 · \d+ × \d+$/)).toBeTruthy();
    changeWorkspace('Scene');
    expect(screen.getByRole('region', { name: 'Simple visualization workspace' })).toBeTruthy();
    changeWorkspace('Content');
    expect(screen.getByText(/^Clip 1 · /)).toBeTruthy();
    // The only history entry is making Clip 1: Undo removes it, Content makes a
    // fresh one, and nothing is left to redo. A recorded switch would be redoable.
    fireEvent.click(screen.getAllByRole('button', { name: 'Undo' })[0]);
    const redo = screen.getAllByRole('button', { name: 'Redo' })[0];
    expect(redo.hasAttribute('disabled') || redo.getAttribute('aria-disabled') === 'true').toBe(true);
  });

  it("Content's sidebar: Media pool lists clips, and a colour added in Content lands in the open clip only", () => {
    render(<App />);
    changeWorkspace('Content');
    const tabs = screen.getByRole('radiogroup', { name: 'Content panel view' });
    fireEvent.click(within(tabs).getByRole('radio', { name: /Media pool/ }));
    expect(screen.getByRole('treeitem', { name: /Clip 1/ })).toBeTruthy();
    fireEvent.click(within(screen.getByRole('region', { name: 'Map tools' })).getByRole('button', { name: 'Colour' }));
    fireEvent.click(within(tabs).getByRole('radio', { name: /Visuals/ }));
    expect(within(screen.getByRole('tree', { name: 'Clip visuals' })).getByRole('treeitem', { name: /Colour/ })).toBeTruthy();
    changeWorkspace('Scene');
    expect(screen.queryByRole('treeitem', { name: /^Colour/ })).toBeNull();
  });

  it("reorders simple layers with undo/redo and preserves their order across editor modes", () => {
    render(<App />);
    addLayerSurface();
    changeWorkspace('Scene');
    fireEvent.click(screen.getByRole('button', { name: 'Browse visual gallery' }));
    fireEvent.click(screen.getByRole('button', { name: 'Solid color' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Asset name' }), { target: { value: 'Background' } });
    // Visual layers tree's Add visual (the toolbar surface tray has its own).
    fireEvent.click(within(document.querySelector('.map-visual-panel-title') as HTMLElement).getByRole('button', { name: 'Add layer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Solid color' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Asset name' }), { target: { value: 'Foreground' } });
    // Front-to-back order as the Visual layers tree shows it.
    // Front-to-back order as the Visuals cards show it (the default
    // per-surface visual is listed too; these checks follow the added ones).
    const order = () => within(screen.getByRole('list', { name: 'Visuals' })).getAllByRole('button', { name: /^Select / }).map(b => b.getAttribute('aria-label')).filter(l => !/^Select Surface \d/.test(l ?? ''));
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

  it("gives a new show one Main timeline; surfaces get no timeline of their own", () => {
    render(<App />);
    addLayerSurface();
    addLayerSurface();
    changeWorkspace("Scene");
    fireEvent.click(screen.getByRole("button", { name: "Advanced editor" }));
    const timelines = within(screen.getByRole("tree", { name: "Scenes" })).getAllByRole("treeitem");
    expect(timelines.map(row => row.textContent)).toEqual([expect.stringContaining("Main")]);
  });

  it("adds and targets a simple visual, keeps it in advanced, and undoes the edit across mode switches", () => {
    render(<App />);
    addLayerSurface();
    changeWorkspace('Scene');
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
    treeCommand("New canvas");
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    fireEvent.click(ribbonTool("Cube"));
    clickRow("Layers", "^Cube 3 layers$");
    fireEvent.contextMenu(within(layerTree()).getAllByRole("treeitem", { name: /^Cube 3 layers$/ })[0]);
    fireEvent.click(screen.getByRole("menuitem", { name: /^Delete group/ }));
    expect(treeRows().map(row => row.getAttribute("aria-label") ?? row.textContent)).not.toContain("Cube");
    // The unrelated surface stays in Canvas 1; Canvas 2 is empty again.
    expect(treeRows().map(row => row.textContent?.trim())).toEqual([expect.stringContaining("Surface 1")]); expect(sceneRows()).toHaveLength(2);
    documentCommand("Undo");
    expect(treeRows()).toHaveLength(5); // Surface 1, plus the group and all three faces restored
    expect(treeRows().filter(row => row.getAttribute("aria-level") === "2")).toHaveLength(2);
  });
  it("deletes a whole cube from the toolbar, then only one face when a face is selected", () => {
    render(<App />);
    fireEvent.click(ribbonTool("Cube"));
    fireEvent.click(ribbonTool("Delete"));
    expect(treeRows()).toHaveLength(0);
    documentCommand("Undo");
    clickRow("Layers", "Cube right");
    fireEvent.click(ribbonTool("Delete"));
    expect(treeRows()).toHaveLength(3); // group, two faces
  });
  it("deletes the selected box with the canvas Delete key", () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole("button", { name: "Cube variants" })[0]);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Box" }));
    expect(treeRows()).toHaveLength(6);
    fireEvent.keyDown(document.querySelector(".map-canvas-host")!, { key: "Delete" });
    expect(treeRows()).toHaveLength(0);
    documentCommand("Undo");
    expect(treeRows()).toHaveLength(6);
  });
});


it("deletes the last output from the toolbar without deleting a previously selected cube, and undoes it", () => {
  render(<App />);
  fireEvent.click(ribbonTool("Cube"));
  expect(screen.queryByRole("button", { name: "Outputs" })).toBeNull();
  const retainedLayerRows = () => within(screen.getByRole("tree", { name: "Layers", hidden: true })).queryAllByRole("treeitem", { hidden: true });
  const before = retainedLayerRows().length;
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
