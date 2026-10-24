// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { DEFAULT_SURFACE_LOOK, emptyShow, newSurface } from "./document";
import { OutputSurface } from "./output";

const bare = () => {
  const show = emptyShow();
  const surface = newSurface(show.output, 0);
  show.scenes[0].surfaces = [surface];
  return { show, surface };
};

test("Mapping replaces assigned content with the external grid without changing the surface", () => {
  const { show, surface } = bare();
  surface.source.fill = '#ff0000';
  surface.opacity = .4;
  surface.mappingOpacity = .15;
  const before = JSON.stringify(surface);
  const view = render(<OutputSurface surface={surface} show={show} base="/media/" timeS={7}
    playing={false} mapping placeholder={DEFAULT_SURFACE_LOOK.external} />);
  expect(view.container.querySelector('.map-surface-grid')).not.toBeNull();
  expect(view.container.querySelector<HTMLElement>('.map-surface')?.style.opacity).toBe('1');
  view.rerender(<OutputSurface surface={surface} show={show} base="/media/" timeS={7}
    playing={false} placeholder={DEFAULT_SURFACE_LOOK.external} />);
  expect(view.container.querySelector('.map-surface-grid')).toBeNull();
  expect(view.container.querySelector<HTMLElement>('.map-surface')?.style.opacity).toBe('0.4');
  expect(JSON.stringify(surface)).toBe(before);
});

test("Mapping exposes empty sequences and faded surfaces but respects hidden surfaces", () => {
  const { show, surface } = bare();
  surface.sequence = true; surface.opacity = 0;
  const view = render(<OutputSurface surface={surface} show={show} base="/media/" timeS={17}
    playing={false} mapping placeholder={DEFAULT_SURFACE_LOOK.external} />);
  expect(view.container.querySelector('.map-surface-grid')).not.toBeNull();
  view.rerender(<OutputSurface surface={{ ...surface, enabled: false }} show={show} base="/media/"
    timeS={17} playing={false} mapping placeholder={DEFAULT_SURFACE_LOOK.external} />);
  expect(view.container.querySelector('.map-surface')).toBeNull();
});

test("a surface with no media paints its projection grid on a live output", () => {
  // You align a projection by looking at the projected shape against the real
  // contour. An empty surface that emits nothing makes that impossible — which
  // is what the output window did: only the editor canvas passed `placeholder`.
  const { show, surface } = bare();
  const live = render(<OutputSurface surface={surface} show={show} base="/media/" timeS={0} playing={false} placeholder={DEFAULT_SURFACE_LOOK.external} />);
  expect(live.container.querySelector(".map-surface-grid")).not.toBeNull();
});

test("a deployed show paints nothing for an empty surface", () => {
  // No editor is driving it, so a checkerboard would land on the building
  // itself, mid-performance.
  const { show, surface } = bare();
  const deployed = render(<OutputSurface surface={surface} show={show} base="/media/" timeS={0} playing={false} />);
  expect(deployed.container.querySelector(".map-surface-grid")).toBeNull();
});

test("a hidden or fully transparent surface paints nothing either way", () => {
  const { show, surface } = bare();
  const hidden = render(<OutputSurface surface={{ ...surface, enabled: false }} show={show} base="/media/" timeS={0} playing={false} placeholder={DEFAULT_SURFACE_LOOK.external} />);
  expect(hidden.container.querySelector(".map-surface-grid")).toBeNull();
  const clear = render(<OutputSurface surface={{ ...surface, opacity: 0 }} show={show} base="/media/" timeS={0} playing={false} placeholder={DEFAULT_SURFACE_LOOK.external} />);
  expect(clear.container.querySelector(".map-surface-grid")).toBeNull();
});

test("the grid's lines are proportional to the surface, not hairlines in its source box", () => {
  // The regression this guards: a 1px stroke drawn in a 1920-wide source box
  // that is warped down to a few hundred screen pixels renders at about an
  // eighth of a pixel and disappears.
  const { show, surface } = bare();
  // Asks for a grid explicitly: this is about line weight, so it must not care
  // which pattern happens to be the default.
  const gridLook = { ...DEFAULT_SURFACE_LOOK.external, pattern: "grid" as const };
  const { container } = render(<OutputSurface surface={surface} show={show} base="/media/" timeS={0} playing={false} placeholder={gridLook} />);
  const grid = container.querySelector(".map-surface-grid")!;
  const stroke = Number(grid.querySelector("g")!.getAttribute("stroke-width"));
  const [, , w, h] = surface.source.rect;
  expect(stroke).toBeGreaterThan(Math.max(w, h) / 200);
  // Six sections: five interior lines each way, over a field, inside a ring.
  expect(grid.querySelectorAll("line").length).toBe(10);
  expect(grid.querySelectorAll("rect").length).toBe(2);
  // Section count drives the mesh, so a surface can be as fine as the wall needs.
  const dense = render(<OutputSurface surface={surface} show={show} base="/media/" timeS={0} playing={false}
    placeholder={{ ...gridLook, sections: 12 }} />);
  expect(dense.container.querySelectorAll(".map-surface-grid line").length).toBe(22);
});

test("each pattern draws its own marks, from the appearance it is given", () => {
  const { show, surface } = bare();
  const look = (over = {}) => ({ ...DEFAULT_SURFACE_LOOK.external, sections: 6, ...over });
  const draw = (over = {}) => render(<OutputSurface surface={surface} show={show} base="/media/"
    timeS={0} playing={false} placeholder={look(over)} />).container;

  // Grid: five interior lines each way, plus the field and the border ring.
  const grid = draw({ pattern: "grid" });
  expect(grid.querySelectorAll(".map-surface-grid line").length).toBe(10);
  expect(grid.querySelectorAll(".map-surface-grid rect").length).toBe(2);

  // Checkerboard: no lines; half of a 6 x 6 board is 18 squares, plus field and ring.
  const checker = draw({ pattern: "checker" });
  expect(checker.querySelectorAll(".map-surface-grid line").length).toBe(0);
  expect(checker.querySelectorAll(".map-surface-grid rect").length).toBe(20);

  // Fill: the field and its border, nothing else — the shape is all you asked for.
  const fill = draw({ pattern: "fill" });
  expect(fill.querySelectorAll(".map-surface-grid line").length).toBe(0);
  expect(fill.querySelectorAll(".map-surface-grid rect").length).toBe(2);

  // Colours come from the appearance, not from the stylesheet.
  const tinted = draw({ pattern: "grid", primary: "#112233", secondary: "#445566" });
  expect(tinted.querySelector(".map-surface-grid rect")?.getAttribute("fill")).toBe("#112233");
  expect(tinted.querySelector(".map-surface-grid g")?.getAttribute("stroke")).toBe("#445566");
});

test("the editor look and the projector look are saved separately", async () => {
  const { parseShow, serializeShow } = await import("./show-file");
  const show = emptyShow();
  show.surfaceLook = {
    device: { ...DEFAULT_SURFACE_LOOK.device, pattern: "fill", opacity: 0.5, pinSizePx: 14 },
    external: { ...DEFAULT_SURFACE_LOOK.external, pattern: "checker", sections: 12 },
  };
  const saved = parseShow(serializeShow(show)).surfaceLook!;
  // The one place the two sides are meant to differ, and they do.
  expect(saved.device).toMatchObject({ pattern: "fill", opacity: 0.5, pinSizePx: 14 });
  expect(saved.external).toMatchObject({ pattern: "checker", sections: 12 });
});

test("a show from before the two sides existed carries its one choice into both", async () => {
  const { parseShow, serializeShow } = await import("./show-file");
  const legacy = JSON.parse(new TextDecoder().decode(serializeShow(emptyShow())));
  delete legacy.surfaceLook;
  legacy.output.surfacePattern = "checker";
  const reopened = parseShow(JSON.stringify(legacy));
  expect(reopened.surfaceLook?.device.pattern).toBe("checker");
  expect(reopened.surfaceLook?.external.pattern).toBe("checker");

  // Nonsense values fall back rather than reaching a projector.
  legacy.output.surfacePattern = "polka";
  legacy.surfaceLook = { external: { pattern: "spirals", sections: 900, opacity: 7, primary: 4 } };
  const odd = parseShow(JSON.stringify(legacy)).surfaceLook!.external;
  expect(odd.pattern).toBe(DEFAULT_SURFACE_LOOK.external.pattern);
  expect(odd.sections).toBe(64);
  expect(odd.opacity).toBe(1);
  expect(odd.primary).toBe(DEFAULT_SURFACE_LOOK.external.primary);
});

test("a pen-drawn (outlined) placeholder edges its outline, not its bounding rectangle", () => {
  const { show, surface } = bare();
  const plain = render(<OutputSurface surface={surface} show={show} base="/media/" timeS={0} playing={false} placeholder={DEFAULT_SURFACE_LOOK.external} />);
  expect(plain.container.querySelector(".map-surface-edge")).toBeNull();
  expect(plain.container.querySelector(".map-surface-grid > rect[fill=none]")).not.toBeNull();
  plain.unmount();
  const outlined = { ...surface, masks: [[[0, 0], [600, 0], [640, 80], [1200, 60], [1200, 700], [0, 720]]] as typeof surface.masks };
  const view = render(<OutputSurface surface={outlined} show={show} base="/media/" timeS={0} playing={false} placeholder={DEFAULT_SURFACE_LOOK.external} />);
  expect(view.container.querySelector(".map-surface-grid > rect[fill=none]")).toBeNull();
  expect(view.container.querySelector(".map-surface-edge polygon")?.getAttribute("points")).toContain("640,80");
});
