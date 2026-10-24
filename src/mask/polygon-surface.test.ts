import { describe, expect, it } from "vitest";
import { emptyShow, newSurface } from "../document";
import { parseShow, serializeShow } from "../show-file";
import { polygonSidesPatch } from "./polygon-surface";

describe("polygonSidesPatch", () => {
  it("changes the outline while preserving the warp and media source", () => {
    const surface = newSurface({ width: 1920, height: 1080 }, 0);
    surface.source.mediaId = "photo";
    const created = { ...surface, ...polygonSidesPatch(surface, 6) };
    const changed = { ...created, ...polygonSidesPatch(created, 5) };
    expect(changed.masks[0]).toHaveLength(5);
    expect(changed.corners).toEqual(surface.corners);
    expect(changed.source).toEqual(surface.source);
    expect(polygonSidesPatch(changed, 1).polygonSides).toBe(3);
    expect(polygonSidesPatch(changed, 100).polygonSides).toBe(64);
  });

  it("keeps the side count and outline through save and reopen", () => {
    const show = emptyShow();
    const surface = newSurface(show.output, 0);
    show.scenes[0].surfaces.push({ ...surface, ...polygonSidesPatch(surface, 7) });
    const reopened = parseShow(serializeShow(show)).scenes[0].surfaces[0];
    expect(reopened.polygonSides).toBe(7);
    expect(reopened.masks[0]).toHaveLength(7);
  });

  it("recognizes a saved polygon from before side counts were stored", () => {
    const show = emptyShow();
    const surface = newSurface(show.output, 0);
    const legacy = { ...surface, ...polygonSidesPatch(surface, 6) };
    delete (legacy as { polygonSides?: number }).polygonSides;
    show.scenes[0].surfaces.push(legacy);
    expect(parseShow(serializeShow(show)).scenes[0].surfaces[0].polygonSides).toBe(6);
  });

  it("does not treat an arbitrary six-point sketch as a regular polygon", () => {
    const show = emptyShow();
    const surface = newSurface(show.output, 0);
    surface.masks = [[[0, 0], [50, 0], [70, 25], [45, 80], [20, 65], [0, 20]]];
    show.scenes[0].surfaces.push(surface);
    expect(parseShow(serializeShow(show)).scenes[0].surfaces[0].polygonSides).toBeUndefined();
  });
});
