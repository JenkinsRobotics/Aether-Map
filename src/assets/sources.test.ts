import { describe, expect, it } from "vitest";
import { accessLabel, EXTERNAL_SOURCES } from "./sources";

describe("external asset sources", () => {
  it("carries no tracking or campaign parameters", () => {
    // Several of these arrived with Google Ads click ids attached. Shipping one
    // would route operators through someone else's attribution, and it rots as
    // soon as the id expires.
    for (const source of EXTERNAL_SOURCES) {
      const query = new URL(source.url).searchParams;
      for (const junk of ["gclid", "gbraid", "srsltid", "gad_source", "gad_campaignid", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
        expect(query.has(junk), `${source.name} carries ${junk}`).toBe(false);
      }
    }
  });

  it("is https everywhere, since every card opens a browser", () => {
    for (const source of EXTERNAL_SOURCES) {
      expect(new URL(source.url).protocol, source.name).toBe("https:");
    }
  });

  it("lists free sources before paid ones, which is the order you want them", () => {
    const rank = { free: 0, mixed: 1, paid: 2 };
    const ranks = EXTERNAL_SOURCES.map((source) => rank[source.access]);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });

  it("labels what a source costs, not what it is licensed as", () => {
    expect(accessLabel(EXTERNAL_SOURCES[0])).toBe("Free");
    expect(new Set(EXTERNAL_SOURCES.map(accessLabel))).toEqual(new Set(["Free", "Free & paid", "Paid"]));
  });

  it("names every source exactly once", () => {
    expect(new Set(EXTERNAL_SOURCES.map((s) => s.name)).size).toBe(EXTERNAL_SOURCES.length);
    expect(new Set(EXTERNAL_SOURCES.map((s) => s.url)).size).toBe(EXTERNAL_SOURCES.length);
  });
});
