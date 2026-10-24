/** Renderer-independent metadata for Map’s original RGB palette generators. */
const variants = (_mode: number, names: string[], colors: string[][], density: number, speed = 0.5) => names.map((name,i) => ({name,
 params: { density: density*(1+i*0.3), speed: speed*(1+i*0.25), glow: 1, scale: 1, rotation: 0, colors: colors[i] }}));
const neon = [['#020611','#08ddf7','#ef3af2'],['#020a09','#38ff8e','#ffd962'],['#0c020b','#fa458c','#6776ff']];
const cool = [['#020715','#27a4b8','#aeecff'],['#06071b','#956aff','#ffc8e9'],['#020d0b','#26bf82','#e0f5a4']];
export const GALLERY_DEFINITIONS = [
 {id:'neon-beams',label:'Neon Beams',presets:variants(0,['Laser studio','Electric lime','Rose lasers'],neon,6)},
 {id:'synthwave',label:'Synthwave',presets:variants(1,['Midnight drive','Miami sunset','After hours'],neon,5,0.65)},
 {id:'pixel-mosaic',label:'Pixel Mosaic',presets:variants(2,['Pixel dance','Arcade lights','Disco tiles'],neon,12)},
 {id:'contour-lines',label:'Contour Lines',presets:variants(3,['Contour bloom','Topographic glow','Ripple rings'],cool,18)},
 {id:'starfield',label:'Starfield',presets:variants(4,['Starlight','Violet cosmos','Fireflies'],cool,6,0.4)},
 {id:'aurora',label:'Aurora',presets:variants(5,['Northern lights','Violet curtains','Emerald sky'],cool,16,0.35)},
 {id:'snowfall',label:'Snowfall',presets:variants(6,['Winter snow','Sugar plum snow','Golden flurries'],cool,5)},
 {id:'heart-confetti',label:'Heart Confetti',presets:variants(7,['Candy hearts','Valentine glow','Golden hearts'],[['#160817','#ff356b','#f6a2cf'],['#090312','#a545df','#f38ee8'],['#130907','#af7535','#fff0ab']],3,0.35)},
 {id:'watchful-eye',label:'Watchful Eye',presets:variants(8,['Blue eye','Amber eye','Emerald eye'],[['#000000','#224b63','#84c8d9'],['#000000','#6f2f0f','#c39339'],['#000000','#234b2e','#a1b257']],36,0.5)},
 {id:'jack-lantern',label:'Jack-o’-lantern',presets:variants(9,['Pumpkin grin','Witchlight grin','Ghostlight grin'],[['#000000','#fb4b00','#ffcc39'],['#000000','#4dce27','#c1ff55'],['#000000','#542ad2','#a0c7ff']],3,0.5)},
 {id:'moonlit-window',label:'Moonlit Window',presets:variants(10,['Moonlit hills','Twilight window','Emerald evening'],cool,3,0.3)},
];
const stageNeon=['#020611','#08ddf7','#ef3af2'];
export const STAGE_DEFINITIONS=[
 {id:'fireworks',label:'Fireworks',category:'Holiday',description:'Staggered radial spark bursts with falling trails.',params:{bursts:3,particles:32,gravity:.22,glow:1.4,tail:.2},colors:stageNeon},
 {id:'electric-storm',label:'Electric Storm',category:'Halloween',description:'Branching lightning bolts with changing paths and local flicker.',params:{bolts:2,roughness:.6,glow:1.1,width:.002},colors:['#01030d','#3b6dee','#dceaff']},
 {id:'radar-sweep',label:'Radar Sweep',category:'Neon',description:'A rotating radar beam reveals points across concentric range rings.',params:{rings:5,blips:14,trail:.4,glow:1.8},colors:['#010a07','#16966a','#72ffb8']},
 {id:'moire-weave',label:'Moire Weave',category:'Geometric',description:'Two fine gratings interfere to form slowly shifting woven bands.',params:{spacing:70,twist:1,contrast:1.5},colors:stageNeon},
 {id:'lissajous-ribbons',label:'Lissajous Ribbons',category:'Geometric',description:'Two oscillations trace a luminous ribbon with an evolving phase.',params:{frequencyX:3,frequencyY:2,width:.004,glow:1},colors:stageNeon},
 {id:'pulse-columns',label:'Pulse Columns',category:'Pixel',description:'Segmented columns rise and fall in a repeating decorative rhythm. Assign audio to amplitude for live response.',params:{columns:22,steps:28,gap:.2,amplitude:.85,glow:.6},colors:stageNeon},
 {id:'sand-dunes',label:'Sand Dunes',category:'Ambient',description:'Wind-shaped ridges catch directional light as their surface flows.',params:{ridges:9,wind:1,lightAngle:45,contrast:1.1},colors:['#24132c','#d08c59','#ffe0a8']},
 {id:'digital-rain',label:'Digital Rain',category:'Pixel',description:'Abstract illuminated glyphs fall in columns with fading trails.',params:{columns:32,trail:.25,glow:1.6},colors:['#000603','#08a356','#a2ffcc']},
] as const;

export const NATIVE_SHADER_IDS=new Set(['kaleidoscope','tunnel',...GALLERY_DEFINITIONS.map(entry=>entry.id),...STAGE_DEFINITIONS.map(entry=>entry.id)]);
