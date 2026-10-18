// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { importSurfacesFromSvg } from "./svg-import";
import { emptyShow } from "./document";

const show = emptyShow();

function svg(body: string, viewBox = 'viewBox="0 0 1920 1080"') {
  return `<svg xmlns="http://www.w3.org/2000/svg" ${viewBox}>${body}</svg>`;
}

describe("importSurfacesFromSvg", () => {
  it("turns a polygon into a surface", () => {
    const { surfaces } = importSurfacesFromSvg(
      svg('<polygon points="10,20 110,20 110,120 10,120"/>'),
      show,
    );
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0].corners).toEqual([
      [10, 20],
      [110, 20],
      [110, 120],
      [10, 120],
    ]);
  });

  it("turns a rect into a surface", () => {
    const { surfaces } = importSurfacesFromSvg(
      svg('<rect x="5" y="6" width="100" height="50"/>'),
      show,
    );
    expect(surfaces[0].corners).toEqual([
      [5, 6],
      [105, 6],
      [105, 56],
      [5, 56],
    ]);
  });

  it("reads straight-line path data, including H and V", () => {
    const { surfaces } = importSurfacesFromSvg(
      svg('<path d="M 0 0 H 100 V 80 H 0 Z"/>'),
      show,
    );
    expect(surfaces[0].corners).toEqual([
      [0, 0],
      [100, 0],
      [100, 80],
      [0, 80],
    ]);
  });

  it("scales the drawing's coordinates onto the scene artboard", () => {
    // A 960x540 drawing onto a 1920x1080 output: everything doubles.
    const { surfaces } = importSurfacesFromSvg(
      svg('<polygon points="0,0 100,0 100,100 0,100"/>', 'viewBox="0 0 960 540"'),
      show,
    );
    expect(surfaces[0].corners[1]).toEqual([200, 0]);
  });

  it("imports into the active artboard independently of device dimensions", () => {
    const portrait = emptyShow();
    portrait.scenes[0].artboard = { widthPx: 600, heightPx: 1000 };
    const { surfaces } = importSurfacesFromSvg(svg('<rect width="100" height="100"/>', 'viewBox="0 0 100 100"'), portrait);
    expect(surfaces[0].corners).toEqual([[0, 0], [600, 0], [600, 1000], [0, 1000]]);
  });

  it("names a surface from its title, id, or position", () => {
    const { surfaces } = importSurfacesFromSvg(
      svg(
        '<polygon id="Door" points="0,0 1,0 1,1 0,1"/>' +
          '<polygon points="0,0 1,0 1,1 0,1"><title>Window</title></polygon>' +
          '<polygon points="0,0 1,0 1,1 0,1"/>',
      ),
      show,
    );
    expect(surfaces.map((s) => s.name)).toEqual(["Door", "Window", "Imported 3"]);
  });

  it("reports open curves that cannot define a projection region", () => {
    const { surfaces, skipped } = importSurfacesFromSvg(
      svg('<path id="Arch" d="M 0 0 C 10 10 20 20 30 30"/>'),
      show,
    );
    expect(surfaces).toHaveLength(0);
    expect(skipped[0]).toMatch(/Arch.*open paths/i);
  });

  it("reports a shape with too few corners", () => {
    const { surfaces, skipped } = importSurfacesFromSvg(
      svg('<polygon id="Line" points="0,0 10,10"/>'),
      show,
    );
    expect(surfaces).toHaveLength(0);
    expect(skipped[0]).toMatch(/Line.*area/i);
  });

  it("refuses a file that is not SVG", () => {
    expect(() => importSurfacesFromSvg("just text", show)).toThrow(/not/i);
    expect(() => importSurfacesFromSvg("<html><body/></html>", show)).toThrow(/not/i);
  });

  it("imports several shapes in one pass", () => {
    const { surfaces } = importSurfacesFromSvg(
      svg(
        '<polygon points="0,0 10,0 10,10 0,10"/><rect x="0" y="0" width="5" height="5"/>',
      ),
      show,
    );
    expect(surfaces).toHaveLength(2);
  });
});

 it('retains transformed curves and even-odd holes, and skips foreign content',()=>{
  const {surfaces,skipped}=importSurfacesFromSvg(svg('<g transform="translate(100 20)"><path id="Ring" fill-rule="evenodd" d="M0 0h100v100h-100z M20 20h60v60h-60z"/><path d="M200 0C300 0 300 100 200 100Z"/></g><script>alert(1)</script>'),show);
  expect(surfaces).toHaveLength(2);expect(surfaces[0].maskFillRule).toBe('evenodd');expect(surfaces[0].masks[1][0]).toEqual([120,40]);expect(surfaces[1].maskCurves?.[0][0]).toEqual({c1:[400,20],c2:[400,120]});expect(skipped.join()).toContain('script');
 });
