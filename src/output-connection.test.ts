import { describe, expect, it } from "vitest";
import { outputDeviceName, sceneOutputs } from "./output-connection";
import type { ShowOutput } from "./document";
import type { MapDevice } from "./api";

const output = (over: Partial<ShowOutput> = {}): ShowOutput =>
  ({ id: "o1", name: "Output 1", kind: "monitor", ...over });

const device = (over: Partial<MapDevice> = {}): MapDevice =>
  ({ id: "d1", name: "Foyer Pi", mine: true, claimed: true, seen: 0, document: null, ...over });

const live = () => true;

describe("outputDeviceName", () => {
  it("names the paired player for an edge output and the kind otherwise", () => {
    expect(outputDeviceName(output({ kind: "edge" }), device())).toBe("Foyer Pi");
    expect(outputDeviceName(output({ kind: "edge" }), undefined)).toBe("No device chosen");
    expect(outputDeviceName(output({ kind: "airplay" }), undefined)).toBe("AirPlay");
    expect(outputDeviceName(output(), undefined)).toBe("Output window");
  });
});

describe("sceneOutputs", () => {
  it("returns only the outputs aimed at that scene", () => {
    const outputs = [
      output({ id: "a", sceneId: "s1" }),
      output({ id: "b", sceneId: "s2" }),
      output({ id: "c" }), // bound to nothing: an unbound output is dark
    ];
    const aimed = sceneOutputs(outputs, "s1", {}, [], live, null);
    expect(aimed.map((entry) => entry.output.id)).toEqual(["a"]);
  });

  it("marks an aimed output live only once something shows its picture", () => {
    const outputs = [output({ id: "a", sceneId: "s1" })];
    const dark = sceneOutputs(outputs, "s1", {}, [], live, null);
    expect(dark[0].connection?.live).toBe(false);

    const open = { a: { width: 1280, height: 720, fullscreen: false } };
    const running = sceneOutputs(outputs, "s1", open, [], live, null);
    expect(running[0].connection?.live).toBe(true);
    expect(running[0].device).toBe("Output window");
  });

  it("an edge output is live only while its player is playing this show", () => {
    const outputs = [output({ id: "a", sceneId: "s1", kind: "edge", deviceId: "d1" })];
    const elsewhere = sceneOutputs(outputs, "s1", {}, [device({ document: "other" })], live, "mine");
    expect(elsewhere[0].connection?.live).toBe(false);

    const here = sceneOutputs(outputs, "s1", {}, [device({ document: "mine" })], live, "mine");
    expect(here[0].connection?.live).toBe(true);
    expect(here[0].device).toBe("Foyer Pi");
  });

  it("an offline player is aimed but not live", () => {
    const outputs = [output({ id: "a", sceneId: "s1", kind: "edge", deviceId: "d1" })];
    const aimed = sceneOutputs(outputs, "s1", {}, [device({ document: "mine" })], () => false, "mine");
    expect(aimed).toHaveLength(1);
    expect(aimed[0].connection?.live).toBe(false);
  });
});

it('never reports an unassigned or live-only receiver as playing an offline output', () => {
  const outputs = [output({ kind: 'edge', deviceId: 'd1', sceneId: 's1' })];
  expect(sceneOutputs(outputs, 's1', {}, [device()], live, null)[0].connection?.live).toBe(false);
  const result = sceneOutputs(outputs, 's1', {}, [device({ kind: 'live_receiver', document: 'saved' })], live, 'saved')[0];
  expect(result.connection?.live).toBe(false);
  expect(result.connection?.label).toContain('live mirroring only');
});
