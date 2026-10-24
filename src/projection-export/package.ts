import { outputRegion } from '../output-crop';
import type { MapShow, Scene } from '../document';
import { animateSurface } from '../features/animation';
import { sceneSize } from '../scene-size';
import { projectionZip } from './archive';
import { outlinePaths, sceneSvg } from './geometry';
import { maskCanvas, pngBlob, referenceCanvas } from './raster';

export interface ProjectionBrief { prompt: string; durationS: number; surfaceIDs?: readonly string[]; }
export function projectionManifest(show: MapShow, scene: Scene, brief: ProjectionBrief) {
  const { width, height } = sceneSize(show, scene);
  return {
    format: 'aether-projection-reference', version: 1, sceneID: scene.id, sceneName: scene.name,
    widthPx: width, heightPx: height, origin: 'top-left', yAxis: 'down', geometryTimeS: 0,
    target: brief.surfaceIDs ? 'surfaces' : 'scene', targetSurfaceIDs: brief.surfaceIDs ?? null,
    prompt: brief.prompt, durationS: brief.durationS,
    files: { geometry: 'mapping.svg', mask: 'mask.png', targetMask: 'target-mask.png', reference: scene.setupBackground?.visible ? 'reference.png' : null },
    maskMeaning: 'mask.png shows enabled mapped geometry at time zero with ordered cutouts. target-mask.png is the selected surfaces, or the whole artboard minus enabled cutouts for a scene target. White allows artwork; black excludes it. Content opacity and clip timing are not baked in.',
    warnings: [
      'This package is an artwork template, not projector calibration or a complete show.',
      'SVG preserves cubic mask outlines; projected ellipses/rounded source corners are sampled. Text/image alpha silhouettes are in mask.png and the per-surface PNG data below, not vectorized.',
      'Bend parameters affect content sampling; they do not change authored vector boundaries. Raster alpha sampling can differ slightly from browser GPU filtering.',
      ...(show.unassignedSurfaces.length ? ['Unassigned workspace surfaces are not part of this scene.'] : []),
    ],
    surfaces: scene.surfaces.map(raw => { const s = animateSurface(raw, 0); return {
      id: s.id, name: s.name, folder: s.folder ?? null, groupShape: s.groupShape ?? null,
      enabled: s.enabled, kind: s.kind ?? 'surface', sceneCanvas: s.sceneCanvas ?? false,
      cornersPx: s.corners, paths: outlinePaths(s), fillRule: s.maskFillRule ?? 'union',
      shape: s.shape ?? 'rectangle', radiusPx: s.radiusPx ?? 0, alphaMask: s.alphaMask ?? null,
      bend: s.bend ?? null, sourceRectPx: s.source.rect, contentPlacement: s.source.fit ?? 'stretch',
    }; }),
    outputs: show.outputs.filter(o => o.sceneId === scene.id).map(o => ({ id: o.id, name: o.name, region: outputRegion(show, o, { width, height }) })),
  };
}
export function projectionPrompt(scene: Scene, brief: ProjectionBrief) {
  return `Create projection artwork for ${scene.name}.\n\n${brief.prompt.trim()}\n\n` +
    `Use manifest.json for exact pixel dimensions and target surface IDs. mapping.svg contains outlines; mask.png describes mapped geometry; target-mask.png defines the allowed generation area. The reference photo, if included, supplies context only.\n` +
    `Keep architecture, camera framing, surface boundaries and holes fixed. Return a full-artboard image or video with matching dimensions; do not include editor UI, labels or handles. Keep excluded regions black. Aether will enforce final clipping.\n` +
    `For animation: ${brief.durationS} seconds, moving content, request a seamless loop. Actual seam quality must be previewed.\n` +
    `Target: ${brief.surfaceIDs ? brief.surfaceIDs.join(', ') : 'entire scene'}. Do not resize or reposition the map.\n`;
}
export async function buildProjectionPackage(show: MapShow, sceneID: string, mediaUrls: Record<string, string>, brief: ProjectionBrief) {
  const scene = show.scenes.find(s => s.id === sceneID);
  if (!scene) throw Error('The selected scene no longer exists.');
  if (!Number.isFinite(brief.durationS) || brief.durationS < .1 || brief.durationS > 3600) throw Error('Choose a duration between 0.1 and 3600 seconds.');
  if (brief.surfaceIDs && (!brief.surfaceIDs.length || brief.surfaceIDs.some(id => !scene.surfaces.some(s => s.id === id)))) throw Error('The target surfaces no longer exist in this scene.');
  const files: { name: string; data: Blob | string }[] = [
    { name: 'mapping.svg', data: sceneSvg(show, scene) },
    { name: 'manifest.json', data: JSON.stringify(projectionManifest(show, scene, brief), null, 2) },
    { name: 'prompt.txt', data: projectionPrompt(scene, brief) },
    { name: 'mask.png', data: await pngBlob(await maskCanvas(show, scene)) },
    { name: 'target-mask.png', data: await pngBlob(await maskCanvas(show, scene, brief.surfaceIDs, !brief.surfaceIDs)) },
  ];
  const reference = await referenceCanvas(show, scene, mediaUrls);
  if (reference) files.push({ name: 'reference.png', data: await pngBlob(reference) });
  files.push({ name: 'README.txt', data: 'Aether Map projection reference package\n\nCurrent document snapshot, Mapping geometry at time zero. SVG artwork keeps editable cubic paths and compound fill rules. mask.png includes raster silhouettes and ordered cutouts; target-mask.png selects the generation area (whole artboard for scene targets). manifest.json contains stable IDs, dimensions and source placement metadata. Reference image is clipped to the artboard.\n\nThis is not an MPCDI calibration file or a complete Aether project backup. Use Export project for show/media/timing backup. No AI service was called to create this package. Inspect generated artwork before assigning it to your show.\n' });
  return projectionZip(files);
}
