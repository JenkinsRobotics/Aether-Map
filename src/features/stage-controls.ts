/** The original stage generators' effective numeric intervals, shared by all editors. */
export interface StageControl { min:number; max:number; step:number }
const range=(min:number,max:number,step=.01):StageControl=>({min,max,step});
export const STAGE_CONTROLS:Record<string,Record<string,StageControl>>={
 'fireworks':{bursts:range(1,6,1),particles:range(8,64,1),gravity:range(0,1),glow:range(0,4),tail:range(0,.9)},
 'electric-storm':{bolts:range(1,5,1),roughness:range(0,1),glow:range(0,3),width:range(.0005,.04,.0005)},
 'radar-sweep':{rings:range(1,12,1),blips:range(0,24,1),trail:range(.03,2),glow:range(0,4)},
 'moire-weave':{spacing:range(8,150,1),twist:range(0,3),contrast:range(.1,3)},
 'lissajous-ribbons':{frequencyX:range(1,6,.1),frequencyY:range(1,6,.1),width:range(.001,.05,.001),glow:range(0,3)},
 'pulse-columns':{columns:range(3,64,1),steps:range(4,80,1),gap:range(.01,.8),amplitude:range(0,1.4),glow:range(0,2)},
 'sand-dunes':{ridges:range(2,20,.1),wind:range(0,3),lightAngle:range(0,360,1),contrast:range(.2,3)},
 'digital-rain':{columns:range(6,80,1),trail:range(.05,.8),glow:range(0,3)},
};
