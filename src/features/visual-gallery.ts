import { STAGE_GENERATORS } from './stage-shaders';
import { newShader, SHADERS } from './shader-catalog';
import { SCENE_PRESETS } from './scene-presets';
import type { ShaderSource } from './types';

const families: Record<string, [string, string]> = {
 ...Object.fromEntries(STAGE_GENERATORS.map(s=>[s.id,[s.category,s.description]])),
 'mesh-gradient':['Abstract','Soft fields of color flowing across the scene.'],
 'static-mesh-gradient':['Abstract','A softly rotating blend of colors.'],
 'radial-gradient':['Abstract','Layered radial color with a gentle rotation.'],
 'grain-gradient':['Abstract','Textured color fields with adjustable grain.'],
 'simplex-noise':['Abstract','Organic noise with flowing, adjustable detail.'],
 'perlin-noise':['Abstract','Cloud-like layers of animated noise.'],
 'neuro-noise':['Psychedelic','An animated network of organic cells.'],
 'voronoi':['Geometric','Moving cells and geometric boundaries.'],
 'metaballs':['Blobs','Liquid shapes that merge and separate.'],
 'waves':['Contours','Flowing bands with adjustable wave spacing.'],
 'swirl':['Psychedelic','Swirling color fields with adjustable intensity.'],
 'spiral':['Tunnel','A rotating spiral for depth and motion.'],
 'smoke-ring':['Blobs','A soft ring of billowing color.'],
 'warp':['Psychedelic','Warped patterns and flowing color.'],
 'dot-orbit':['Geometric','Orbiting points of color.'],
 'dot-grid':['Geometric','A regular field of dots with editable spacing.'],
 'color-panels':['Pixel','Animated color panels.'],
 'dithering':['Pixel','Pixel patterns with adjustable dithering.'],
 'god-rays':['Ambient','Rays of colored light.'],
 'pulsing-border':['Neon','A glowing animated frame.'],
 'kaleidoscope':['Geometric','Mirrored radial symmetry with adjustable segments.'],
 'tunnel':['Tunnel','A perspective tunnel with moving rings.'],
 'neon-beams':['Neon','Crossing light beams with soft neon glow.'],
 'synthwave':['Synthwave','A moving perspective grid below a striped sunset.'],
 'pixel-mosaic':['Pixel','A field of individually pulsing colored tiles.'],
 'contour-lines':['Contours','Glowing contour rings with an organic ripple.'],
 'starfield':['Ambient','Layered stars drifting and twinkling in the dark.'],
 'aurora':['Ambient','Slow, flowing curtains of northern light.'],
 'snowfall':['Holiday','Layers of falling snow at different depths.'],
 'heart-confetti':['Holiday','Drifting hearts with an editable color palette.'],
 'watchful-eye':['Eyes','A shaded eye with a moving gaze and detailed iris.'],
 'jack-lantern':['Halloween','A carved pumpkin face with flickering light.'],
 'moonlit-window':['Window','A framed view of rolling hills and a glowing moon.'],
};
export interface GalleryVisual { id: string; name: string; category: string; description: string; shader: ShaderSource }
function galleryShader(id: string, index: number) {
 const shader = newShader(id,index);
 // Upstream Ink Drops uses black ink on transparency. Give the gallery's
 // standalone source a paper background so it is visible on a black output.
 if(id==='metaballs' && index===1)shader.parameters.colorBack='#f2ede5';
 return shader;
}
/** Each tile is an actual configured source, not artwork standing in for one. */
const shaderVisuals: GalleryVisual[] = SHADERS.filter(entry => !entry.image).flatMap(entry =>
 entry.presets.map((preset,index) => ({
  id:`${entry.id}:${index}`, name:preset.name === 'Default' ? entry.label : `${preset.name} · ${entry.label}`,
  category:families[entry.id]?.[0] ?? 'Abstract', description:families[entry.id]?.[1] ?? entry.label,
  shader:galleryShader(entry.id,index),
 })));
// Keep the existing named scene recipes discoverable in the new browser.
// Three old recipes used image filters without a picture; their gallery
// versions now generate complete visuals rather than calibration artwork.
const sceneVisuals: GalleryVisual[] = SCENE_PRESETS.map(preset => {
 let shader = preset.build({width:640,height:360}).surfaces[0].source.shader!;
 let description = preset.caption;
 if(preset.id==='blood-drip') {
  shader=newShader('metaballs'); shader.colors=['#5c0012','#a50924','#e03945'];
  shader.parameters={...shader.parameters,colorBack:'#120002',speed:0.25,count:8,size:0.48};
  description='Slow, dark red droplets that merge and separate.';
 } else if(preset.id==='winter-drift') {
  shader=newShader('snowfall'); shader.parameters.speed=0.4;
  description='Layers of cool snow drifting across a dark winter sky.';
 } else if(preset.id==='deep-water') {
  shader=newShader('aurora'); shader.colors=['#000a12','#0b4a6b','#6fd8ff'];
  shader.parameters.speed=0.3; description='Slow blue currents of light flowing across the scene.';
 }
 return {id:`scene:${preset.id}`,name:preset.name,category:preset.occasion==='Christmas'?'Holiday':preset.occasion==='Party'?'Geometric':preset.occasion,
  description,shader};
});
export const GALLERY_VISUALS: GalleryVisual[] = [...shaderVisuals,...sceneVisuals];
export const GALLERY_CATEGORIES = ['Abstract','Tunnel','Blobs','Neon','Synthwave','Geometric','Pixel','Psychedelic','Contours','Ambient','Eyes','Halloween','Holiday','Window'];
export function filterGallery(category: string, query: string) {
 const terms=query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
 return GALLERY_VISUALS.filter(visual => (category==='All' || visual.category===category) && terms.every(term =>
  `${visual.name} ${visual.category} ${visual.description}`.toLocaleLowerCase().includes(term)));
}
export const RECENT_VISUALS_KEY='aether-map.recent-visuals.v1';
export function recentVisuals(raw: string | null,known=GALLERY_VISUALS.map(v=>v.id)): string[] {
 try {
  const ids:unknown=JSON.parse(raw ?? '[]');
  return Array.isArray(ids) ? [...new Set(ids.filter((id):id is string => typeof id==='string' && known.includes(id)))].slice(0,8) : [];
 } catch { return []; }
}
export function rememberVisual(id: string, previous: string[]) { return [id,...previous.filter(item=>item!==id)].slice(0,8); }
