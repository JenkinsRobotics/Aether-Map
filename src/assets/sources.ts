/**
 * Asset sources Aether Map cannot search from inside the app — yet.
 *
 * Openverse is integrated because it needs no key and has a public API. These
 * do not qualify, for two different reasons, and `integration` says which:
 *
 *  - "api"  — a real search API, but it needs a key. A key shipped in a browser
 *             bundle is a published key, so these wait on the host holding one.
 *             They are the obvious next integrations.
 *  - "site" — no API. Most are download libraries made for exactly this work,
 *             which is why they earn a link even though nothing here can search
 *             them.
 *
 * URLs are canonical. Several of these arrived with Google Ads click ids and
 * campaign parameters attached (`gclid`, `utm_*`, `gbraid`, `srsltid`); those
 * are stripped, because shipping them would route operators through someone
 * else's ad attribution and would rot the moment the ids expire.
 *
 * `access` is what it costs, not what it is licensed as. Terms differ per site
 * and per clip, so nothing here states a licence — the card sends you to the
 * source to read it.
 */
export interface AssetSource {
  name: string;
  url: string;
  integration: "api" | "site";
  access: "free" | "mixed" | "paid";
  /** One line: what it is, and what is worth knowing before clicking. */
  note: string;
}

const ACCESS_LABEL: Record<AssetSource["access"], string> = {
  free: "Free",
  mixed: "Free & paid",
  paid: "Paid",
};

export const accessLabel = (source: AssetSource) => ACCESS_LABEL[source.access];

/**
 * Ordered by what is most useful to someone looking for something to project:
 * free and made for projection mapping first, general free next, paid last.
 */
export const EXTERNAL_SOURCES: readonly AssetSource[] = [
  {
    name: "4mapper Video Library",
    url: "https://4mapper.com/video-library/",
    integration: "site",
    access: "free",
    note: "VJ loops, particles, smoke and fractals, made for projection mapping. Royalty-free, no attribution — it is Pixabay content, curated.",
  },
  {
    name: "Lumabox",
    url: "https://www.lumabox.com/house-mapping/guides/free-video-for-projection-mapping/",
    integration: "site",
    access: "free",
    note: "A guide to free video for house mapping, with sources collected for you.",
  },
  {
    name: "StageLoops",
    url: "https://stageloops.com/free/free-projection-mapping-content/",
    integration: "site",
    access: "free",
    note: "Free projection-mapping downloads.",
  },
  {
    name: "Pixabay",
    url: "https://pixabay.com/videos/search/vj%20loop/",
    integration: "api",
    access: "free",
    note: "Free photos and video, and the catalogue behind 4mapper's library. Search and import in Map when a Studio administrator connects Pixabay.",
  },
  {
    name: "Pexels",
    url: "https://www.pexels.com/search/videos/projection%20mapping/",
    integration: "api",
    access: "free",
    note: "Free photos and video with an API. A candidate to integrate after Pixabay.",
  },
  {
    name: "Openverse",
    url: "https://openverse.org/",
    integration: "api",
    access: "free",
    note: "The catalogue searched above, if you would rather browse it there.",
  },
  {
    name: "VJ Loops Farm",
    url: "https://vjloopsfarm.com/category/video-mapping-loops/",
    integration: "site",
    access: "mixed",
    note: "Loops made for video mapping. Some free, most paid.",
  },
  {
    name: "Video Mapping Store",
    url: "https://videomapping.store/vj/vj-loops/",
    integration: "site",
    access: "paid",
    note: "VJ loops and 3D mapping content, sold per pack.",
  },
  {
    name: "Storyblocks",
    url: "https://www.storyblocks.com/video/search/projection-mapping",
    integration: "site",
    access: "paid",
    note: "Subscription stock video, searched for projection mapping.",
  },
  {
    name: "Motion Array",
    url: "https://motionarray.com/stock-video/vj-loops-1/",
    integration: "site",
    access: "paid",
    note: "Subscription stock video, VJ loops.",
  },
  {
    name: "Pond5",
    url: "https://www.pond5.com/stock-footage/",
    integration: "site",
    access: "paid",
    note: "Stock footage marketplace, priced per clip.",
  },
];
