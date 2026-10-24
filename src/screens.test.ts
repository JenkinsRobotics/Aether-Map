import { describe, expect, it } from "vitest";
import {
  canListDisplays,
  describeDisplay,
  displaySupport,
  explainDisplaySupport,
  listDisplays,
  outputWindowFeatures,
} from "./screens";

const fakeScreen = (over: Partial<Screen & { availLeft: number; availTop: number }> = {}) =>
  ({ width: 1920, height: 1080, availLeft: 0, availTop: 0, ...over }) as Screen;

function fakeWindow(details?: {
  screens: Record<string, unknown>[];
  current?: number;
}): Window {
  const win = { screen: fakeScreen() } as unknown as Window & Record<string, unknown>;
  if (details) {
    win.getScreenDetails = async () => ({
      screens: details.screens,
      currentScreen: details.screens[details.current ?? 0],
    });
  }
  return win;
}

describe("listDisplays", () => {
  it("reports every attached display with position and size", async () => {
    const win = fakeWindow({
      screens: [
        { availLeft: 0, availTop: 0, width: 1512, height: 982, label: "Built-in", isPrimary: true },
        { availLeft: 1512, availTop: -100, width: 1920, height: 1080, label: "EPSON PJ" },
      ],
      current: 0,
    });
    expect(canListDisplays(win)).toBe(true);
    const displays = await listDisplays(win);
    expect(displays).toHaveLength(2);
    expect(displays[1]).toMatchObject({
      label: "EPSON PJ",
      width: 1920,
      height: 1080,
      left: 1512,
      top: -100,
      isPrimary: false,
      isCurrent: false,
    });
    expect(displays[0].isCurrent).toBe(true);
  });

  it("names an unlabelled display by its position in the list", async () => {
    const win = fakeWindow({ screens: [{ availLeft: 0, availTop: 0, width: 800, height: 600, label: "" }] });
    expect((await listDisplays(win))[0].label).toBe("Display 1");
  });

  it("does not invent a detected display when the API is missing", async () => {
    const win = fakeWindow();
    expect(canListDisplays(win)).toBe(false);
    const displays = await listDisplays(win);
    expect(displays).toEqual([]);
  });
});

describe("outputWindowFeatures", () => {
  it("places a popup on the chosen display, filling it", () => {
    const features = outputWindowFeatures({
      id: "x",
      label: "PJ",
      width: 1920,
      height: 1080,
      left: 1512,
      top: -100,
      isPrimary: false,
      isCurrent: false,
    });
    expect(features).toBe("popup,left=1512,top=-100,width=1920,height=1080");
  });
});

describe("describeDisplay", () => {
  it("says which one is which", () => {
    expect(
      describeDisplay({
        id: "a",
        label: "Built-in",
        width: 1512,
        height: 982,
        left: 0,
        top: 0,
        isPrimary: true,
        isCurrent: true,
      }),
    ).toBe("Built-in — 1512×982 (primary, editor is here)");
  });
});

describe("displaySupport", () => {
  const win = (over: Record<string, unknown>) =>
    ({ screen: fakeScreen(), isSecureContext: true, self: 1, top: 1, ...over }) as unknown as Window;

  it("says the browser lacks it when the page is otherwise fine", () => {
    expect(displaySupport(win({}))).toEqual({ supported: false, reason: "browser" });
    expect(explainDisplaySupport(displaySupport(win({})))).toMatch(/Chrome, Edge, Arc or Brave/);
  });

  it("blames an insecure page before blaming the browser", () => {
    expect(displaySupport(win({ isSecureContext: false }))).toEqual({
      supported: false,
      reason: "insecure",
    });
  });

  it("blames an embedding frame", () => {
    expect(displaySupport(win({ top: 2 }))).toEqual({ supported: false, reason: "embedded" });
  });

  it("is supported when the API is present", () => {
    expect(displaySupport(win({ getScreenDetails: async () => ({ screens: [], currentScreen: {} }) })))
      .toEqual({ supported: true });
  });
});
