import { describe, expect, it } from "vitest";
import { formatBytes } from "./format";

describe("formatBytes", () => {
  it("uses a unit a person reads at a glance", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 kB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("shows a dash rather than '0 B' for unknown sizes", () => {
    expect(formatBytes(0)).toBe("—");
    expect(formatBytes(-1)).toBe("—");
  });
});
