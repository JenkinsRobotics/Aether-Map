import { useState } from "react";
import { Button, ColorField, NumberField, SegmentedControl, SettingsCard, SettingsRow, Slider } from "@aether/ui";
import { DEFAULT_SURFACE_LOOK, type SurfaceAppearance, type SurfaceLook } from "../document";
import { SurfaceGrid } from "../features/SurfaceGrid";

/**
 * How planes look, set separately for the editor and the projector.
 *
 * The two sides answer different questions. On screen you are manipulating a
 * plane, so it wants corner pins and colours that read against a photographed
 * wall. On the projector you are judging a mapping against a real contour in a
 * dark room, so it wants maximum contrast and no pins — nothing pins a wall.
 * Everywhere else the viewport must match the projector exactly; this is the
 * one setting where making them differ is the point.
 *
 * One side is on screen at a time rather than both: you tune one against its
 * own preview, and a pane showing two of everything is twice as much to read
 * for a comparison nobody makes.
 */
const SIDES = [
  { id: "device", label: "Device" },
  { id: "external", label: "External" },
] as const;

const PATTERNS = [
  { id: "fill", label: "Fill" },
  { id: "grid", label: "Grid" },
  { id: "checker", label: "Checkerboard" },
] as const;

/** Colour labels follow the pattern, because the same slot means two things. */
const COLOUR_LABELS: Record<SurfaceAppearance["pattern"], [string, string | null]> = {
  fill: ["Fill colour", null],
  grid: ["Fill colour", "Grid line colour"],
  checker: ["Primary colour", "Secondary colour"],
};

/**
 * The preview is square and sits centred in a panel the full width of the pane,
 * because a plane is a shape you judge, not a swatch you compare. Pins are
 * drawn proud of its corners, where they are on the canvas, so the pin-size
 * slider shows you the thing it actually changes.
 */
const PREVIEW_PX = 132;
const PREVIEW: [number, number, number, number] = [0, 0, PREVIEW_PX, PREVIEW_PX];
const PREVIEW_PAD = 28;

export function SurfaceLookSettings({ look, onChange }: {
  look: SurfaceLook;
  onChange: (look: SurfaceLook) => void;
}) {
  const [side, setSide] = useState<keyof SurfaceLook>("device");
  const appearance = look[side];
  const set = (patch: Partial<SurfaceAppearance>) => onChange({ ...look, [side]: { ...appearance, ...patch } });
  const [primaryLabel, secondaryLabel] = COLOUR_LABELS[appearance.pattern];
  const showPins = side === "device" && appearance.pinSizePx > 0;

  return (
    <SettingsCard title="Mapping design"
      caption="Alignment patterns used in Mapping, even after adding a visual. Device controls this screen; External controls the projector. Visualization restores your content.">
      <div className="map-look-preview" aria-hidden="true">
        <div className="map-look-stage" style={{ width: PREVIEW_PX, height: PREVIEW_PX }}>
          <SurfaceGrid rect={PREVIEW} look={appearance} style={{ width: PREVIEW_PX, height: PREVIEW_PX }} />
          {showPins && (
            <svg className="map-look-pins" width={PREVIEW_PX + PREVIEW_PAD * 2} height={PREVIEW_PX + PREVIEW_PAD * 2}
              style={{ left: -PREVIEW_PAD, top: -PREVIEW_PAD }}>
              {[[0, 0], [1, 0], [0, 1], [1, 1]].map(([cx, cy], index) => (
                <circle key={index} cx={PREVIEW_PAD + cx * PREVIEW_PX} cy={PREVIEW_PAD + cy * PREVIEW_PX}
                  r={appearance.pinSizePx} fill="none" stroke={appearance.border} strokeWidth={2} />
              ))}
            </svg>
          )}
        </div>
      </div>

      {/* A segmented control with three word-length options does not fit the
          narrow control column a SettingsRow gives it — "Checkerboard" was
          being clipped. Both switches get the full width, with the label above,
          which is also how the reference reads. */}
      <div className="map-look-choice">
        <SegmentedControl ariaLabel="Where this look applies" value={side}
          options={SIDES.map((entry) => ({ id: entry.id, label: entry.label }))}
          onChange={(id) => setSide(id as keyof SurfaceLook)} />
      </div>

      {side === "device" && (
        // Pins are how you grab a corner, so their size is an editor comfort
        // setting. A projection has nothing to grab.
        <SettingsRow label="Pin size">
          <Slider ariaLabel="Pin size" value={appearance.pinSizePx} min={4} max={24} step={1}
            onChange={(pinSizePx) => set({ pinSizePx })} />
        </SettingsRow>
      )}

      <div className="map-look-choice">
        <span className="map-look-choice-label" id="surface-pattern-label">Pattern</span>
        <SegmentedControl ariaLabel="Pattern" value={appearance.pattern}
          options={PATTERNS.map((entry) => ({ id: entry.id, label: entry.label }))}
          onChange={(id) => set({ pattern: id as SurfaceAppearance["pattern"] })} />
      </div>

      <SettingsRow label={primaryLabel}>
        <ColorField ariaLabel={primaryLabel} value={appearance.primary} onChange={(primary) => set({ primary })} />
      </SettingsRow>
      {secondaryLabel && (
        <SettingsRow label={secondaryLabel}>
          <ColorField ariaLabel={secondaryLabel} value={appearance.secondary} onChange={(secondary) => set({ secondary })} />
        </SettingsRow>
      )}
      <SettingsRow label={side === "device" ? "Border and pin colour" : "Border colour"}>
        <ColorField ariaLabel="Border colour" value={appearance.border} onChange={(border) => set({ border })} />
      </SettingsRow>

      <SettingsRow label="Opacity">
        <Slider ariaLabel="Opacity" value={Math.round(appearance.opacity * 100)} min={0} max={100} step={1} unit="%"
          onChange={(percent) => set({ opacity: percent / 100 })} />
      </SettingsRow>

      {appearance.pattern !== "fill" && (
        <SettingsRow label={appearance.pattern === "grid" ? "Grid sections" : "Checkerboard sections"}>
          <NumberField aria-label="Sections" value={appearance.sections} min={1} max={64} step={1}
            onValueChange={(v) => v !== null && set({ sections: Math.round(v) })} />
        </SettingsRow>
      )}

      <Button onClick={() => onChange({ ...look, [side]: DEFAULT_SURFACE_LOOK[side] })}>
        Restore to defaults
      </Button>
    </SettingsCard>
  );
}
