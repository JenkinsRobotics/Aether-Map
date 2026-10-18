import { useState } from 'react';
import { AetherIcon, Button } from '@aether/ui';
import type { MapShow } from '../document';
import { activeScene } from '../document';
import { buildProjectionPackage } from '../projection-export/package';
import { downloadProjection } from '../projection-export/archive';
import { exportName, sceneSvg } from '../projection-export/geometry';

export function ProjectionExport({ show, mediaUrls }: { show: MapShow; mediaUrls: Record<string, string> }) {
  const [busy, setBusy] = useState(false), [status, setStatus] = useState('');
  const scene = activeScene(show);
  async function exportPackage() {
    if (!scene || busy) return;
    setBusy(true); setStatus('Preparing scene geometry and reference…');
    // Freeze the target before any image decoding; switching scenes cannot redirect it.
    const snapshot = structuredClone(show), urls = { ...mediaUrls }, name = exportName(scene.name);
    try {
      const blob = await buildProjectionPackage(snapshot, scene.id, urls, { prompt: '', durationS: 15 });
      downloadProjection(blob, `${name}-projection.zip`); setStatus(`Downloaded ${scene.name} projection package.`);
    } catch (error) { setStatus((error as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="map-export-item">
    <div className="map-export-head"><AetherIcon name="file-drawing"/><strong>Projection references</strong></div>
    <p className="map-dialog-lead">{scene?.name ?? 'Choose a scene'} · editable SVG, PNG geometry mask, enabled backdrop and a surface manifest. Includes current unsaved edits.</p>
    <Button disabled={!scene || busy} onClick={() => scene && downloadProjection(sceneSvg(show, scene), `${exportName(scene.name)}-mapping.svg`)}>Download scene SVG</Button>
    <Button disabled={!scene || busy} onClick={() => void exportPackage()}>{busy ? 'Preparing…' : 'Download projection package'}</Button>
    <p className="map-hint">For a prompt and selected-surface brief, open Aether Agent on the right sidebar. Raster text silhouettes are included in the PNG mask; SVG keeps editable outlines.</p>
    <div className="map-hint" role="status">{status}</div>
  </div>;
}
