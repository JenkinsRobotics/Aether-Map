import { Dialog, ToolIcon, type ToolIconName } from "@aether/ui";
import type { FeatureKind } from "../features/types";
import type { CompoundShape } from "../features/shape-groups";

/**
 * One place to start a shape from, the way the reference's add sheet works.
 *
 * The ribbon already carries every one of these, but the ribbon is organised
 * for someone who knows the tool. This is organised for the moment you are
 * standing in front of a wall deciding what to put on it: the primitives
 * first, then the two ways of bringing in something you already have, then the
 * automatic ones.
 */
export type AddShapeChoice =
  | { kind: "tool"; tool: "square" | "circle" | "pen" }
  | { kind: "feature"; feature: FeatureKind }
  | { kind: "compound"; shape: CompoundShape }
  | { kind: "background" }
  | { kind: "png" }
  | { kind: "silhouette"; mode: "text" | "image" | "subject" };

interface Entry {
  id: string;
  label: string;
  icon: ToolIconName;
  choice: AddShapeChoice;
  /** Shown on the wide rows; the primitives are labelled by their tile alone. */
  description?: string;
}

const PRIMITIVES: Entry[] = [
  { id: "square", label: "Square", icon: "rectangle", choice: { kind: "tool", tool: "square" } },
  { id: "circle", label: "Circle", icon: "circle", choice: { kind: "tool", tool: "circle" } },
  { id: "text", label: "Text", icon: "text", choice: { kind: "silhouette", mode: "text" } },
  { id: "outline", label: "Outline", icon: "pen", choice: { kind: "tool", tool: "pen" } },
  { id: "cube", label: "Cube", icon: "map-cube", choice: { kind: "compound", shape: "cube" } },
  { id: "box", label: "Box", icon: "map-box", choice: { kind: "compound", shape: "box" } },
];

const IMPORTS: Entry[] = [
  { id: 'image-mask', label: 'Image silhouette', icon: 'mask', choice: { kind: 'silhouette', mode: 'image' }, description: 'Use image transparency or extract its subject as a mapped surface' },

  { id: "png", label: "Transparent PNG", icon: "transparent-png", choice: { kind: "png" },
    description: "Import an image with a transparent background" },
  { id: "background", label: "Import backdrop", icon: "backdrop", choice: { kind: "background" },
    description: "Create a reference image for aligning your projection." },
];

/**
 * Not built, and shown anyway. Both are on the roadmap and both are the first
 * thing someone looks for after using the reference; a row that says "not yet"
 * is more honest than a gap that looks like the feature was never considered.
 */
const SMART: Pick<Entry, "id" | "label" | "icon" | "description">[] = [
  { id: "detect", label: "Smart Shape Detection", icon: "smart-shape",
    description: "Take a photo and identify shapes automatically" },
  { id: "generate", label: "AI Generation", icon: "ai-generate",
    description: "Describe a visual and generate it for a surface" },
];

export function AddShapeSheet({ open, onClose, onChoose }: {
  open: boolean;
  onClose: () => void;
  onChoose: (choice: AddShapeChoice) => void;
}) {
  const pick = (choice: AddShapeChoice) => { onChoose(choice); onClose(); };
  return (
    <Dialog open={open} title="Add Shape" onClose={onClose}>
      <div className="map-add-grid">
        {PRIMITIVES.map((entry) => (
          <button key={entry.id} type="button" className="map-add-tile" onClick={() => pick(entry.choice)}>
            <ToolIcon name={entry.icon} />
            <span>{entry.label}</span>
          </button>
        ))}
      </div>

      {IMPORTS.map((entry) => (
        <button key={entry.id} type="button" className="map-add-row" onClick={() => pick(entry.choice)}>
          <span className="map-add-row-icon"><ToolIcon name={entry.icon} /></span>
          <span className="map-add-row-text">
            <strong>{entry.label}</strong>
            <small>{entry.description}</small>
          </span>
        </button>
      ))}

      <div className="map-add-heading">Smart tools</div>
      {SMART.map((entry) => (
        <button key={entry.id} type="button" className="map-add-row" disabled
          title="Not built yet.">
          <span className="map-add-row-icon"><ToolIcon name={entry.icon} /></span>
          <span className="map-add-row-text">
            <strong>{entry.label}</strong>
            <small>{entry.description}</small>
          </span>
          <span className="map-add-row-soon">Soon</span>
        </button>
      ))}
    </Dialog>
  );
}
