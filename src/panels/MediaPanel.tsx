import { useState } from "react";
import { AetherIcon, Button, EmptyState, IconButton, Tabs, SelectField, FieldRow } from "@aether/ui";
import { AssetBrowser } from "./AssetBrowser";
import type { AssetResult } from "../assets/openverse";
import { hosted } from "../api";
import { formatBytes } from "../format";
import { activeScene, type MapShow } from "../document";
import { mediaUsage } from "../media-usage";

import { canPlaceContent, type ContentTarget, type ContentPlacement } from '../content-placement';

export interface MediaPanelProps {
  show: MapShow;
  /** True when the document is saved with no unsaved edits. */
  settled: boolean;
  onAdd: () => void;
  onRemove: (mediaID: string) => void;
  onCleanup: () => Promise<number>;
  /** The layer a placed clip goes on, if one is selected. */
  targetLayer: string | null;
  onPlace: (mediaID: string, target: ContentTarget, placement: ContentPlacement) => void;
  selectedID?: string | null;
  /** Brings a browsed asset into the show, the way a local upload arrives. */
  onImportAsset: (file: File, result: AssetResult) => Promise<void> | void;
}

/**
 * The Assets tab: what you can bring in, and what this show already has.
 *
 * It used to be only the second of those, which answered "what did I import"
 * but never "what could I import" — so finding something to project meant
 * leaving the app. Browse leads, because that is the question you have when
 * the tab is empty.
 */

export function MediaPanel({ show, settled, onAdd, onRemove, onCleanup, targetLayer, onPlace, onImportAsset, selectedID }: MediaPanelProps) {
  const [status, setStatus] = useState("");
  const [target, setTarget] = useState<ContentTarget>('surface');
  const [placement, setPlacement] = useState<ContentPlacement>('replace');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("browse");

  // Across every scene: removing a clip used elsewhere should not look unused.
  const usedBy = (mediaID: string) => mediaUsage(show, mediaID);

  const inShow = show.media.length === 0 ? (
      <EmptyState
        compact
        icon={<AetherIcon name="import" />}
        title="Nothing in this show yet"
        description="Browse for an asset, or add a file of your own."
        primaryAction={<Button onClick={onAdd}>Add media</Button>}
      />
  ) : (
    <div className="map-media-panel">
      <div className="map-media-assignment">
        <Button onClick={onAdd}>Add media</Button>
        <FieldRow label="Apply to"><SelectField aria-label="Content target" value={target} onChange={e => {
          setTarget(e.target.value as ContentTarget); setPlacement(e.target.value === 'scene' ? 'layer' : 'replace');
        }} options={[
          { value: 'surface', label: `Selected item${targetLayer ? ' · ' + targetLayer : ''}` },
          { value: 'surfaces', label: 'All mapped surfaces in this scene' },
          { value: 'scene', label: `${activeScene(show).name} (entire scene)` },
        ]} /></FieldRow>
        <FieldRow label="Action"><SelectField aria-label="Content action" value={placement} onChange={e => setPlacement(e.target.value as ContentPlacement)} options={[
          ...(target === 'scene' ? [{ value: 'layer', label: 'Add visual layer' }] : []),
          { value: 'replace', label: 'Replace current visual' }, { value: 'append', label: 'Append to content track' },
        ]} /></FieldRow>
        <p className="map-hint">{target === 'surfaces' ? 'Creates one visual shared by all mapped surfaces. Choose Repeat or Span in its Targets. Black masks are preserved.' : target === 'scene' ? 'Fills the entire scene. Move its layer forward or backward to place it above or below other assets.' : 'A selected visual is replaced directly; a selected surface receives a new visual without changing its mapping.'}</p>
      </div>

      <ul className="map-media-list">
        {show.media.map((media) => {
          const uses = usedBy(media.id);
          return (
            <li key={media.id} className="map-media-item">
              <AetherIcon name={media.kind === "video" ? "file-clip" : "file-show"} />
              <div className="map-media-text">
                <span className="map-media-name" title={media.name}>
                  {media.name}
                </span>
                <span className="map-media-meta">
                  {media.width}×{media.height} · {formatBytes(media.bytes)}
                  {uses === 0 ? " · unused" : ` · ${uses} reference${uses === 1 ? "" : "s"}`}
                </span>
              </div>
              <Button
                disabled={!canPlaceContent(show, target, selectedID, placement)}
                title={placement === 'layer' ? 'Add an independent scene visual layer' : placement === 'replace' ? 'Replace the current visual on this target' : 'Append after the target’s existing clips'}
                onClick={() => onPlace(media.id, target, placement)}
              >
                Apply
              </Button>
              <IconButton
                label={`Remove ${media.name} from this show`}
                disabled={uses > 0}
                title={uses > 0 ? "Remove this asset from its surfaces, clips and setup backgrounds first." : "Remove unused asset"}
                onClick={() => onRemove(media.id)}
              >
                <AetherIcon name="delete" />
              </IconButton>
            </li>
          );
        })}
      </ul>

      {hosted && (
        <div className="map-media-cleanup">
          <Button
            disabled={!settled || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const removed = await onCleanup();
                setStatus(
                  removed === 0
                    ? "Nothing to clean up."
                    : `Deleted ${removed} file${removed === 1 ? "" : "s"}.`,
                );
              } catch (problem) {
                setStatus((problem as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Delete unused files
          </Button>
          <div className="map-hint">
            {settled
              ? "Removes stored files this show no longer references. The server refuses to delete anything another saved show still uses."
              : "Save the show first — deleting files it still references would leave a saved show without its pixels."}
          </div>
          {status && <div className="map-hint">{status}</div>}
        </div>
      )}
    </div>
  );

  return (
    <div className="map-assets">
      <Tabs
        activeID={tab}
        onSelect={setTab}
        tabs={[
          { id: "browse", label: "Browse" },
          { id: "show", label: `In this show${show.media.length ? ` (${show.media.length})` : ""}` },
        ]}
      />
      {tab === "browse"
        ? <AssetBrowser onChooseFile={onAdd} onImport={onImportAsset} targetLayer={targetLayer} />
        : inShow}
    </div>
  );
}
