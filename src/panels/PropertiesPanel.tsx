import { sceneSize } from "../scene-size";
import { CommonFields } from "../features/CommonFields";
import {
  AetherIcon,
  Button,
  ColorField,
  EmptyState,
  FieldRow,
  InspectorSection,
  IconButton,
  NumberField,
  ParameterRow,
  TextField,
} from "@aether/ui";
import { type MapShow, type Point, type Quad, type Surface } from "../document";
import { addMaskPoint, defaultMask, hasMask } from "../masks";

const CORNER_LABELS = ["Top left", "Top right", "Bottom right", "Bottom left"];

export interface PropertiesPanelProps {
  workspace?: "mapping" | "visualization";
  onEditOutline?: () => void;
  surface: Surface | null;
  show: MapShow;
  onPatch: (id: string, patch: Partial<Surface>) => void;
  onDelete: (id: string) => void;
  onReorder?: (id: string, direction: -1 | 1) => void;
  onOutputSize: (width: number, height: number) => void;
  /** What the output window last reported it is projecting onto. */
  deviceSize: { width: number; height: number; fullscreen: boolean } | null;
  /** Replace the whole mask list — add, edit or remove shapes. */
  onMasks: (id: string, masks: Point[][]) => void;
}

/** Surface-owned fields only. Child content and its timing are edited through
 * VisualProperties after selecting a visual in Assets or the timeline. */

export function PropertiesPanel({
  workspace,
  onEditOutline,
  surface,
  show,
  onPatch,
  onDelete,
  onReorder,
  onOutputSize,
  deviceSize,
  onMasks,
}: PropertiesPanelProps) {
  if (!surface) {
    return (
      <div className="map-properties">
        <div className="map-section-label">Output</div>
        <FieldRow label="Projector" help="The resolution you are projecting at.">
          <div className="map-corner-fields">
            <NumberField
              value={show.output.width}
              min={320}
              unit="px"
              onValueChange={(value) =>
                value !== null && onOutputSize(value, show.output.height)
              }
            />
            <NumberField
              value={show.output.height}
              min={240}
              unit="px"
              onValueChange={(value) =>
                value !== null && onOutputSize(show.output.width, value)
              }
            />
          </div>
        </FieldRow>
        {deviceSize && (
          <FieldRow
            label="Output window"
            help={
              deviceSize.width === show.output.width &&
              deviceSize.height === show.output.height
                ? "The output resolution matches the output window size."
                : deviceSize.fullscreen
                  ? "Fullscreen output content size."
                  : "Live output content size; updates when the window is resized."
            }
          >
            <div className="map-corner-fields">
              <span className="map-device-size">
                {deviceSize.width}×{deviceSize.height}
              </span>
              <Button
                disabled={
                  deviceSize.width === show.output.width &&
                  deviceSize.height === show.output.height
                }
                onClick={() => onOutputSize(deviceSize.width, deviceSize.height)}
              >
                Match
              </Button>
            </div>
          </FieldRow>
        )}
        <EmptyState
          compact
          icon={<AetherIcon name="cube" />}
          title="Nothing selected"
          description="Select a surface to warp."
        />
      </div>
    );
  }

  const moveCorner = (index: number, axis: 0 | 1, value: number | null) => {
    if (value === null) return;
    const corners = surface.corners.map((p) => [...p]) as Quad;
    corners[index][axis] = value;
    onPatch(surface.id, { corners });
  };
  const layers = show.scenes.find(scene => scene.surfaces.some(s => s.id === surface.id))?.surfaces ?? show.unassignedSurfaces;
  const position = layers.findIndex(s => s.id === surface.id);

  return (
    <div className="map-properties">
      <FieldRow label="Name">
        <TextField
          aria-label="Surface name"
          value={surface.name}
          onChange={(event) => onPatch(surface.id, { name: event.target.value })}
        />
      </FieldRow>

      <FieldRow label="Layer colour" help="The layer marker and selection outline color.">
        <ColorField ariaLabel="Layer colour" value={surface.color}
          onChange={(value) => onPatch(surface.id, { color: value })} />
      </FieldRow>

      {onReorder && <FieldRow label="Layer order">
        <div className="map-feature-buttons">
          <IconButton label="Move layer backward" disabled={surface.locked || position <= 0} onClick={() => onReorder(surface.id, -1)}><AetherIcon name="arrow-down" /></IconButton>
          <IconButton label="Move layer forward" disabled={surface.locked || position === layers.length - 1} onClick={() => onReorder(surface.id, 1)}><AetherIcon name="arrow-up" /></IconButton>
        </div>
      </FieldRow>}

      {workspace === "mapping" && <ParameterRow label="Opacity" ariaLabel="Mapping opacity" icon={<AetherIcon name="lighting" />}
        help="See the backdrop while aligning this surface. Projector output is unchanged."
        value={Math.round((surface.mappingOpacity ?? 1) * 100)} min={0} max={100} step={1} unit="%" sliderRange={{ min: 0, max: 100 }}
        onChange={(value) => onPatch(surface.id, { mappingOpacity: value / 100 })} />}

      {workspace !== "mapping" && <ParameterRow label="Opacity" ariaLabel="Surface opacity" icon={<AetherIcon name="lighting" />}
        value={surface.opacity} min={0} max={1} step={0.01} sliderRange={{ min: 0, max: 1 }}
        onChange={(value) => onPatch(surface.id, { opacity: value })} />}

      {workspace !== "visualization" && <CommonFields surface={surface} output={sceneSize(show)} onPatch={onPatch} />}

      {workspace !== "visualization" && <><InspectorSection title="Corners" defaultOpen={true}>
      {surface.corners.map((corner, index) => (
        <FieldRow key={index} label={CORNER_LABELS[index]}>
          <div className="map-corner-fields">
            <NumberField
              aria-label={`${CORNER_LABELS[index]} X`}
              value={corner[0]}
              onValueChange={(value) => moveCorner(index, 0, value)}
            />
            <NumberField
              aria-label={`${CORNER_LABELS[index]} Y`}
              value={corner[1]}
              onValueChange={(value) => moveCorner(index, 1, value)}
            />
          </div>
        </FieldRow>
      ))}

      </InspectorSection><InspectorSection title="Outline" defaultOpen={true}>
      {onEditOutline && <Button disabled={surface.locked} onClick={onEditOutline}>Edit outline points</Button>}
      <FieldRow
        label="Shape"
        help={
          hasMask(surface)
            ? "The profile that clips this surface. The round corners warp the picture; the square handles move the outline."
            : "The outline is the quad itself. Draw a different profile with the sketch tools, or start one from the quad."
        }
      >
        {hasMask(surface) ? (
          <Button onClick={() => surface.polygonSides
            ? onPatch(surface.id, { masks: [], maskCurves: undefined, polygonSides: undefined })
            : onMasks(surface.id, [])}>Reset to quad</Button>
        ) : (
          <Button onClick={() => onMasks(surface.id, [defaultMask(surface.corners)])}>
            Outline from quad
          </Button>
        )}
      </FieldRow>
      {surface.masks.map((shape, index) => (
        <div key={index} className="map-shape-row">
          <span className="map-shape-name">
            {surface.masks.length > 1 ? `Shape ${index + 1} · ` : ""}
            {shape.length} points
          </span>
          <Button
            onClick={() => {
              const masks = surface.masks.map((s, i) => (i === index ? addMaskPoint(s) : s));
              if (surface.polygonSides) onPatch(surface.id, { masks, polygonSides: undefined });
              else onMasks(surface.id, masks);
            }}
          >
            Add point
          </Button>
          {surface.masks.length > 1 && (
            <Button onClick={() => onMasks(surface.id, surface.masks.filter((_, i) => i !== index))}>
              Remove
            </Button>
          )}
        </div>
      ))}
      {hasMask(surface) && (
        <div className="map-hint">
          Arrow keys nudge a selected handle by one pixel, Shift by ten.
        </div>
      )}

      </InspectorSection></>}
      <div className="map-properties-footer">
        <Button onClick={() => onDelete(surface.id)}>Delete surface</Button>
      </div>
    </div>
  );
}
