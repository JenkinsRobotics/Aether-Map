import { describe, expect, it } from "vitest";
import { parseShow, serializeShow } from "./show-file";
import { activeSurfaces, emptyShow, newSurface, type MapShow } from "./document";

function populated(): MapShow {
  const show = emptyShow();
  const surface = newSurface(show.output, 0);
  const scene = show.scenes[0];
  return {
    ...show,
    media: [
      {
        id: "m1",
        file: "m1.mp4",
        name: "flames.mp4",
        kind: "video",
        bytes: 48210496,
        width: 1920,
        height: 1080,
        duration: 30,
      },
    ],
    scenes: [
      {
        ...scene,
        surfaces: [
          {
            ...surface,
            name: "Front door",
            source: { mediaId: "m1", rect: [0, 0, 1920, 1080] },
            opacity: 0.8,
            masks: [
              [
                [0, 0],
                [10, 0],
                [10, 10],
              ],
            ],
          },
        ],
      },
    ],
  };
}

describe("show file", () => {
  it.each([0, .35, 1])("preserves alignment opacity %s separately from projected opacity", (mappingOpacity) => {
    const show = populated();
    show.scenes[0].surfaces[0].mappingOpacity = mappingOpacity;
    const restored = parseShow(serializeShow(show));
    expect(restored).toEqual(show);
    expect(restored.scenes[0].surfaces[0].opacity).toBe(.8);
  });

  it.each([[undefined, undefined], ["0.5", undefined], [null, undefined], [-1, 0], [2, 1]])(
    "normalizes alignment opacity %s to %s", (input, expected) => {
      const show = populated();
      Object.assign(show.scenes[0].surfaces[0], { mappingOpacity: input });
      expect(parseShow(JSON.stringify(show)).scenes[0].surfaces[0].mappingOpacity).toBe(expected);
    },
  );

  it("round-trips a populated show unchanged", () => {
    const show = populated();
    expect(parseShow(serializeShow(show))).toEqual(show);
  });

  it("round-trips an empty show unchanged", () => {
    // One instance: emptyShow() mints a fresh scene id every call.
    const show = emptyShow();
    expect(parseShow(serializeShow(show))).toEqual(show);
  });

  it("round-trips surfaces parked outside every scene", () => {
    const show = emptyShow();
    show.unassignedSurfaces = [{ ...newSurface(show.output, 0), id: "loose" }];
    expect(parseShow(serializeShow(show)).unassignedSurfaces).toEqual(show.unassignedSurfaces);
  });

  it("refuses a file that is not JSON", () => {
    expect(() => parseShow("not a show")).toThrow(/not an Aether Map show/i);
  });

  it("refuses a future version rather than silently mangling it", () => {
    expect(() => parseShow(JSON.stringify({ version: 99 }))).toThrow(/version 99/i);
  });

  it("refuses a surface that does not have four corners", () => {
    const broken = { version: 1, surfaces: [{ id: "s", corners: [[0, 0]] }] };
    expect(() => parseShow(JSON.stringify(broken))).toThrow(/four corners/i);
  });

  it("fills in defaults rather than producing NaN from a partial file", () => {
    const sparse = JSON.stringify({
      version: 1,
      surfaces: [
        {
          id: "s1",
          corners: [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
          ],
        },
      ],
    });
    const show = parseShow(sparse);
    expect(show.output).toEqual({ width: 1920, height: 1080 });
    expect(activeSurfaces(show)[0].enabled).toBe(true);
    expect(activeSurfaces(show)[0].opacity).toBe(1);
    expect(activeSurfaces(show)[0].source.mediaId).toBeNull();
    expect(JSON.stringify(show)).not.toContain("null,null");
    expect(JSON.stringify(show)).not.toContain("NaN");
  });

  it("clamps an out-of-range opacity instead of trusting the file", () => {
    const show = parseShow(
      JSON.stringify({
        version: 1,
        surfaces: [
          {
            id: "s",
            opacity: 4,
            corners: [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
            ],
          },
        ],
      }),
    );
    expect(activeSurfaces(show)[0].opacity).toBe(1);
  });

  it("migrates a version 1 show into a single scene", () => {
    // Shows saved before scenes existed must open with their work intact.
    const legacy = JSON.stringify({
      version: 1,
      output: { width: 1280, height: 720 },
      media: [
        { id: "m1", file: "m1.png", name: "a.png", kind: "image", bytes: 1, width: 8, height: 8 },
      ],
      surfaces: [
        {
          id: "s1",
          name: "Door",
          corners: [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
          ],
          source: { mediaId: "m1", rect: [0, 0, 8, 8] },
          cues: [{ id: "c1", timeS: 2, action: "hide" }],
        },
      ],
      playback: { mode: "once", durationS: 45 },
    });

    const show = parseShow(legacy);
    expect(show.version).toBe(3);
    expect(show.scenes).toHaveLength(1);
    expect(show.activeSceneId).toBe(show.scenes[0].id);
    expect(show.output).toEqual({ width: 1280, height: 720 });
    expect(show.media).toHaveLength(1);

    const surfaces = activeSurfaces(show);
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0].name).toBe("Door");
    expect(surfaces[0].cues).toHaveLength(1);
    // The old per-show duration becomes the scene's own length.
    expect(show.scenes[0].durationS).toBe(45);
    expect(show.playback.mode).toBe("once");
  });

  it("keeps several scenes and the one that was active", () => {
    const show = emptyShow();
    const twoScenes: MapShow = {
      ...show,
      scenes: [
        { id: "a", name: "Intro", durationS: 10, surfaces: [] },
        { id: "b", name: "Main", durationS: 60, surfaces: [] },
      ],
      activeSceneId: "b",
    };
    const back = parseShow(serializeShow(twoScenes));
    expect(back.scenes.map((s) => s.name)).toEqual(["Intro", "Main"]);
    expect(back.activeSceneId).toBe("b");
  });

  it("falls back to the first scene when the active id is missing", () => {
    const show = emptyShow();
    const broken = JSON.stringify({ ...show, activeSceneId: "gone" });
    expect(parseShow(broken).activeSceneId).toBe(show.scenes[0].id);
  });

  it("round-trips a text surface", () => {
    const show = emptyShow();
    const surface = newSurface(show.output, 0);
    const withText: MapShow = {
      ...show,
      scenes: [
        {
          ...show.scenes[0],
          surfaces: [
            {
              ...surface,
              source: {
                mediaId: null,
                rect: [0, 0, 800, 200],
                text: {
                  text: "BEWARE",
                  sizePx: 120,
                  color: "#ff0000",
                  background: "transparent",
                  align: "center",
                },
              },
            },
          ],
        },
      ],
    };
    expect(parseShow(serializeShow(withText))).toEqual(withText);
  });
});
