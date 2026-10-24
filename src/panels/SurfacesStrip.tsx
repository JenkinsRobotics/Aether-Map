import './SurfaceAssignments.css';
import type { Visual } from '../visual-model';
import { sameVisualTarget, setVisualTarget, setSceneSurfaceTargets } from '../visual-targets';
import { AetherIcon, Button } from "@aether/ui";
import { activeScene, type MapShow, type Point, type Surface } from "../document";
import { editableLayers } from "../background-layer";
import { animateSurface } from "../features/animation";
import { sceneSize } from "../scene-size";

export interface SurfacesStripProps {
  show: MapShow;
  selectedID: string | null;
  /** Visualization edits this visual’s targets; Mapping continues selecting geometry. */
  assignment?: { visual: Visual; onChange: (visual: Visual) => void };
  /** Geometry is animated, so a strip at 15s shows where things are at 15s. */
  timeS: number;
  /** Resolved media URLs, so the backdrop cell can show the actual photo. */
  urls: Record<string, string>;
  onSelect: (id: string) => void;
  onAdd: () => void;
  addLabel?: string;
  /** Double-click opens geometry only outside asset assignment mode. */
  onEdit: (id: string) => void;
}

/**
 * Every surface in the scene, drawn where it actually sits, as one row you pick
 * from.
 *
 * The Layers tree answers "what is in this scene, in what order, containing
 * what" — it is a list of names. This answers a different question, the one you
 * ask standing in front of a wall: *which shape is that?* So each cell draws the
 * whole scene and lights up the one surface it stands for. Picking the fourth
 * rectangle from the left stops being an exercise in remembering which name you
 * gave it.
 */
export function SurfacesStrip({ show, selectedID, timeS, urls, onSelect, onAdd, onEdit, assignment, addLabel = "New surface" }: SurfacesStripProps) {
  const scene = activeScene(show);
  // Mapping includes setup imagery; visual targets are mapped faces only.
  const surfaces = assignment ? scene.surfaces.filter(s => !s.sceneCanvas && s.kind !== "mask") : editableLayers(show);
  const assigned = (surfaceID?: string) => !!assignment?.visual.targets.some(t => sameVisualTarget(t, { sceneID: scene.id, surfaceID }));
  const allAssigned = surfaces.length > 0 && surfaces.every(s => assigned(s.id));
  const toggle = (surfaceID?: string) => assignment && assignment.onChange(setVisualTarget(assignment.visual, { sceneID: scene.id, surfaceID }, !assigned(surfaceID)));
  const size = sceneSize(show);
  // Animated once here, not per cell: every cell draws every surface, so doing
  // it inside the loop is the same work n times over.
  const placed = surfaces.map((surface) => animateSurface(surface, timeS));

  // No empty-state layout. A tray that rearranges itself the moment the last
  // surface goes is a tray you cannot learn: the row is simply empty, and the
  // add button is where it always is.
  return (
    <div className="map-surfaces" data-assigning={assignment ? true : undefined}>
      {/* The visual's name and mapping are asset properties: they live in
          the Properties tab, not in the surface tray (Jonathan). */}
      {/* A labelled group of buttons, not a listbox: a listbox promises arrow-key
          navigation with roving focus, and claiming the role without honouring
          it is worse for a screen reader than plain buttons that Tab reaches.
          `aria-current` is how the rest of the suite says "this is the one". */}
      <div className="map-surfaces-row" role="group" aria-label={assignment ? "Asset surface assignments" : "Surfaces"}>
        {assignment && <button type="button" className={`map-surface-cell map-scene-target${assigned() ? ' is-selected' : ''}`}
          style={{ aspectRatio: `${size.width} / ${size.height}` }} aria-label={`Assign to entire ${scene.name}`} aria-pressed={assigned()}
          disabled={assignment.visual.locked} onClick={e => { if (e.detail < 2) toggle(); }} title={`Entire ${scene.name}`}>
          <AetherIcon name="surface" /><span>Entire scene</span>
        </button>}
        {surfaces.map((surface, index) => {
          const selected = assignment ? assigned(surface.id) : surface.id === selectedID;
          return (
            <button
              key={surface.id}
              type="button"
              aria-current={!assignment && selected ? "true" : undefined}
              aria-pressed={assignment ? selected : undefined}
              disabled={assignment?.visual.locked}
              // The name alone is not enough out loud either: say what state it
              // is in, since the cell says it in colour.
              aria-label={`${assignment ? "Assign to " : ""}${surface.name}${surface.enabled ? "" : ", hidden"}${surface.locked ? ", locked" : ""}`}
              title={surface.name}
              className={[
                "map-surface-cell",
                selected ? "is-selected" : "",
                surface.enabled ? "" : "is-hidden",
              ].filter(Boolean).join(" ")}
              onClick={e => { if (assignment) { if (e.detail < 2) toggle(surface.id); } else onSelect(surface.id); }}
              onDoubleClick={assignment ? undefined : () => onEdit(surface.id)}
              // The tile takes the artboard's shape, so its own border is the
              // scene's edge. Nothing has to draw a second rectangle inside the
              // first, and where a surface sits in the room reads correctly at
              // 40px instead of floating in a letterbox.
              style={{ aspectRatio: `${size.width} / ${size.height}` }}
            >
              <SceneThumbnail size={size} surfaces={placed} subject={index} urls={urls} />
              {!surface.enabled && (
                <span className="map-surface-cell-badge"><AetherIcon name="hidden" /></span>
              )}
              {surface.locked && surface.enabled && (
                <span className="map-surface-cell-badge"><AetherIcon name="mate" /></span>
              )}
            </button>
          );
        })}
      </div>
      {assignment && <div className="map-surface-assignment-actions">

        <Button aria-label="Assign to all surfaces" aria-pressed={allAssigned} disabled={assignment.visual.locked || !surfaces.length}
          onClick={() => assignment.onChange(setSceneSurfaceTargets(assignment.visual, scene, !allAssigned))}>All surfaces</Button>
      </div>}
      <div className="map-surfaces-actions">
        <button type="button" className="map-surfaces-add" onClick={onAdd}
          aria-label={addLabel} title={`${addLabel} in ${scene?.name ?? "this scene"}`}>
          <AetherIcon name="plus" />
        </button>
      </div>
    </div>
  );
}

/** The outline a surface actually has: its drawn profile, or its quad. */
function shapesOf(surface: Surface): Point[][] {
  return surface.masks.length ? surface.masks : [surface.corners];
}

/**
 * The scene at thumbnail size, with one surface picked out. Drawn in scene
 * pixels and scaled by the viewBox, so a cell needs no layout maths and the
 * arrangement stays true whatever the artboard is. `non-scaling-stroke` keeps
 * hairlines hairline: a 1920-wide viewBox in a 76px box would otherwise render
 * a 1px stroke at a twenty-fifth of a pixel.
 *
 * The scene's own bounds are not drawn. The cell already has an edge, and a
 * second rectangle just inside it read as a border around a border.
 */
function SceneThumbnail({ size, surfaces, subject, urls }: {
  size: { width: number; height: number };
  surfaces: readonly Surface[];
  subject: number;
  urls: Record<string, string>;
}) {
  const layer = surfaces[subject];
  // The backdrop's subject is the photograph, not an outline of where it sits:
  // a grey rectangle the size of the scene tells you nothing, and recognising
  // the room is the whole reason this cell exists.
  const photo = layer.id.startsWith("background/") && layer.source.mediaId
    ? urls[layer.source.mediaId] : undefined;
  const box = bounds(layer.corners);
  return (
    <svg
      className="map-surface-cell-art"
      viewBox={`0 0 ${size.width} ${size.height}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      {surfaces.map((surface, index) =>
        index === subject || !surface.enabled ? null : shapesOf(surface).map((points, shape) => (
          <polygon key={`${surface.id}-${shape}`} className="map-surface-cell-other"
            points={points.map((point) => point.join(",")).join(" ")}
            vectorEffect="non-scaling-stroke" />
        )),
      )}
      {photo ? (
        <image className="map-surface-cell-photo" href={photo}
          x={box.x} y={box.y} width={box.width} height={box.height}
          preserveAspectRatio="xMidYMid slice" />
      ) : shapesOf(layer).map((points, shape) => (
        <polygon key={shape} className="map-surface-cell-subject"
          points={points.map((point) => point.join(",")).join(" ")}
          style={{ fill: layer.color, stroke: layer.color }}
          vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

/** The axis-aligned box a quad occupies, for placing the backdrop's photo. */
function bounds(points: readonly Point[]) {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
