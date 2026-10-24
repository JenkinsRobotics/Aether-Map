import { newSurface, nextId, type MapShow, type Point, type Quad, type Surface } from "../document";

/**
 * Compound shapes: one gesture that makes several surfaces at once.
 *
 * A cube and a box are not single planes. A physical box seen from a corner
 * shows three faces that have to be warped independently but belong together,
 * and a recess shows four walls around a back. So each of these builds a set of
 * surfaces and puts them in a folder — the grouping already exists, and it is
 * what keeps them moving, hiding and reordering as one thing.
 *
 * Every face starts as a flat projection of the solid. Nothing here tries to be
 * a 3D engine: the operator drags the corners onto the real object, and these
 * are only a starting arrangement that is closer than four separate rectangles.
 */
export type CompoundShape = "cube" | "box";

const at = (x: number, y: number): Point => [x, y];
const quad = (a: Point, b: Point, c: Point, d: Point): Quad => [a, b, c, d];

function face(output: MapShow["output"], index: number, name: string, folder: string, groupShape: CompoundShape, corners: Quad): Surface {
  const surface = newSurface(output, index);
  return { ...surface, id: nextId("s"), name, folder, groupShape, corners, source: { ...surface.source, rect: [0, 0, output.width, output.height] } };
}

/**
 * A cube as you actually see one: three faces meeting at the near vertical
 * edge — top, left and right. Laid out isometrically so the starting shape
 * already reads as a solid rather than as three rectangles you have to
 * recognise.
 */
export function cubeSurfaces(output: MapShow["output"], index: number, name = "Cube"): Surface[] {
  const w = output.width, h = output.height;
  const side = Math.min(w, h) * 0.34;
  const cx = w / 2, cy = h / 2;
  // Half-width and the vertical rise of an isometric edge.
  const hx = side;
  const top = at(cx, cy - side * 0.75);
  const left = at(cx - hx, cy - side * 0.25);
  const right = at(cx + hx, cy - side * 0.25);
  const front = at(cx, cy + side * 0.25);
  const bottomLeft = at(cx - hx, cy + side * 0.75);
  const bottomRight = at(cx + hx, cy + side * 0.75);
  const lower = at(cx, cy + side * 1.25);
  return [
    face(output, index, `${name} top`, name, "cube", quad(top, right, front, left)),
    face(output, index + 1, `${name} left`, name, "cube", quad(left, front, lower, bottomLeft)),
    face(output, index + 2, `${name} right`, name, "cube", quad(front, right, bottomRight, lower)),
  ];
}

/**
 * A box you look into: a back panel with four walls sloping out to the opening.
 * The shape an alcove, a window reveal or a shadow box actually presents, and
 * the one the reference's icon draws — an outer rectangle, an inner rectangle
 * and the corners joined.
 */
export function boxSurfaces(output: MapShow["output"], index: number, name = "Box"): Surface[] {
  const w = output.width, h = output.height;
  const outer = Math.min(w, h) * 0.6;
  const inset = outer * 0.3;
  const cx = w / 2, cy = h / 2;
  const o = outer / 2, i = o - inset;
  const outerTopLeft = at(cx - o, cy - o), outerTopRight = at(cx + o, cy - o);
  const outerLowRight = at(cx + o, cy + o), outerLowLeft = at(cx - o, cy + o);
  const innerTopLeft = at(cx - i, cy - i), innerTopRight = at(cx + i, cy - i);
  const innerLowRight = at(cx + i, cy + i), innerLowLeft = at(cx - i, cy + i);
  return [
    face(output, index, `${name} back`, name, "box", quad(innerTopLeft, innerTopRight, innerLowRight, innerLowLeft)),
    face(output, index + 1, `${name} top`, name, "box", quad(outerTopLeft, outerTopRight, innerTopRight, innerTopLeft)),
    face(output, index + 2, `${name} right`, name, "box", quad(innerTopRight, outerTopRight, outerLowRight, innerLowRight)),
    face(output, index + 3, `${name} bottom`, name, "box", quad(innerLowLeft, innerLowRight, outerLowRight, outerLowLeft)),
    face(output, index + 4, `${name} left`, name, "box", quad(outerTopLeft, innerTopLeft, innerLowLeft, outerLowLeft)),
  ];
}

export function compoundSurfaces(shape: CompoundShape, output: MapShow["output"], index: number, name?: string): Surface[] {
  return shape === "cube" ? cubeSurfaces(output, index, name) : boxSurfaces(output, index, name);
}

/** A second solid needs its own folder or the tree merges both placements. */
export function compoundFolderName(shape: CompoundShape, surfaces: readonly Surface[]): string {
  const base = shape === "cube" ? "Cube" : "Box";
  const used = new Set(surfaces.map(s => s.folder).filter(Boolean));
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base} ${n}`)) return `${base} ${n}`;
}

/** Shows saved before groupShape existed can be recognized by the exact face
 * set created by the original Cube/Box commands. Explicit null means the
 * artist later regrouped the face and must stay an ordinary folder. */
export function restoreLegacyCompoundShapes(surfaces: Surface[]): Surface[] {
  const folders = new Map<string, Surface[]>();
  for (const surface of surfaces) {
    if (!surface.folder) continue;
    folders.set(surface.folder, [...(folders.get(surface.folder) ?? []), surface]);
  }
  const recovered = new Map<string, CompoundShape>();
  for (const [folder, members] of folders) {
    if (members.some((member) => member.groupShape !== undefined)) continue;
    const names = new Set(members.map((member) => member.name));
    const roles = (suffixes: string[]) => members.length === suffixes.length
      && suffixes.every((suffix) => names.has(`${folder} ${suffix}`));
    if (roles(["top", "left", "right"])) recovered.set(folder, "cube");
    else if (roles(["back", "top", "right", "bottom", "left"])) recovered.set(folder, "box");
  }
  return surfaces.map((surface) => surface.folder && recovered.has(surface.folder)
    ? { ...surface, groupShape: recovered.get(surface.folder)! } : surface);
}

/** Moving one face vertex carries coincident vertices on faces in its folder. */
export function linkedFaceCorners(surfaces: readonly Surface[], id: string, corners: Quad): Surface[] | null {
  const active = surfaces.find(s => s.id === id);
  if (!active || active.locked) return null;
  if (!active.folder) return surfaces.map(s => s.id === id ? { ...s, corners } : s);
  const moved = active.corners.map((from, index) => ({ from, to: corners[index] }))
    .filter(({ from, to }) => from[0] !== to[0] || from[1] !== to[1]);
  const linked = (point: Point) => moved.find(({ from }) => from[0] === point[0] && from[1] === point[1]);
  // A locked sibling holds its shared edge in place, so the gesture cannot
  // pull the group apart behind that sibling's lock.
  if (surfaces.some(s => s.id !== id && s.folder === active.folder && s.locked && s.corners.some(p => linked(p)))) return null;
  return surfaces.map(s => {
    if (s.id === id) return { ...s, corners };
    if (s.folder !== active.folder) return s;
    const next = s.corners.map(p => linked(p)?.to ?? p) as Quad;
    return next.some((p, index) => p !== s.corners[index]) ? { ...s, corners: next } : s;
  });
}
