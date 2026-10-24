import { STAGE_DEFINITIONS } from './original-shader-presets';
import type { CSSProperties } from 'react';
import { GLShader, PREAMBLE } from './GLShader';

/** Original projection generators. Each entry has its own spatial algorithm;
 * palettes/presets below are variations, not additional generators. */
const COMMON = `${PREAMBLE}
float hash(float n) { return fract(sin(n*127.1)*43758.5453); }
float segment(vec2 p,vec2 a,vec2 b) { vec2 d=b-a;return length(p-a-d*clamp(dot(p-a,d)/max(dot(d,d),0.000001),0.0,1.0)); }
vec2 position() { return spin(uRotation*TAU/360.0)*(gl_FragCoord.xy-.5*uResolution)/min(uResolution.x,uResolution.y)/max(.05,abs(uScale)); }
float stroke(float d,float width) { return 1.0-smoothstep(width,width+1.5/min(uResolution.x,uResolution.y),d); }
`;
export const STAGE_FRAGMENTS = {
 'fireworks':`${COMMON}
uniform float uBursts,uParticles,uGravity,uGlow,uTail;
void main(){
 vec2 p=position();vec3 col=uColor0;float count=clamp(floor(uBursts),1.0,6.0),rays=clamp(floor(uParticles),8.0,64.0);
 for(int i=0;i<6;i++){
  float n=float(i);if(n>=count)break;
  float clock=uTime*.32+n/count,cycle=floor(clock),age=fract(clock),seed=n*19.0+cycle*7.0;
  vec2 center=vec2((hash(seed+4.0)-.5)*.9,(hash(seed+8.0)-.5)*.45+.10-age*age*clamp(uGravity,0.0,1.0));
  vec2 q=p-center;float angle=atan(q.y,q.x),slice=TAU/rays,ray=floor((angle+TAU)/slice+.5);
  float radius=(.08+.32*hash(seed+2.0))*sqrt(age),a=ray*slice;
  float jitter=.75+.25*hash(ray+seed*3.0);radius*=jitter;
  float distance=segment(q,vec2(cos(a),sin(a))*radius*(1.0-clamp(uTail,0.0,.9)),vec2(cos(a),sin(a))*radius);
  float light=(stroke(distance,.0015)+exp(-distance*95.0)*.24)*sin(age*3.14159265)*clamp(uGlow,0.0,4.0);
  col+=mix(uColor1,uColor2,hash(ray+seed))*light;
 }
 fragColor=vec4(clamp(col,0.0,1.0),1.0);
}`,
 'electric-storm':`${COMMON}
uniform float uBolts,uRoughness,uGlow,uWidth;
float bolt(float y,float seed){float cell=floor(y*18.0),f=fract(y*18.0);return mix(hash(cell+seed),hash(cell+seed+1.0),f)-.5;}
void main(){
 vec2 p=position();vec3 col=uColor0;float flash=floor(uTime*6.0),brightness=.25+.75*pow(max(0.0,sin(uTime*18.0)),2.0);
 for(int i=0;i<5;i++){
  float n=float(i);if(n>=clamp(floor(uBolts),1.0,5.0))break;
  float seed=flash*29.0+n*11.0,x=(hash(seed)-.5)*1.1;
  float path=x+bolt(p.y+1.0,seed)*clamp(uRoughness,0.0,1.0)*.4;
  float d=abs(p.x-path),branch=abs(p.x-path-(.2-p.y)*.7);
  if(p.y<.2&&p.y>-.2)d=min(d,branch);
  float light=stroke(d,clamp(uWidth,.0005,.04))+exp(-d*55.0)*.35;
  col+=mix(uColor1,uColor2,stroke(d,.002))*light*brightness*clamp(uGlow,0.0,3.0);
 }
 fragColor=vec4(clamp(col,0.0,1.0),1.0);
}`,
 'radar-sweep':`${COMMON}
uniform float uRings,uBlips,uTrail,uGlow;
void main(){
 vec2 p=position();float r=length(p),a=atan(p.y,p.x),sweep=mod(uTime*.65,TAU);
 float behind=mod(sweep-a+TAU,TAU),trail=clamp(uTrail,.03,2.0);
 float disc=1.0-smoothstep(.46,.47,r),rings=stroke(abs(fract(r*clamp(uRings,1.0,12.0)/.46)-.5),.015);
 float cross=max(stroke(abs(p.x),.0008),stroke(abs(p.y),.0008));
 vec3 col=uColor0+uColor1*disc*(rings*.18+cross*.10+exp(-behind/trail)*.25);
 for(int i=0;i<24;i++){
  float n=float(i);if(n>=clamp(floor(uBlips),0.0,24.0))break;
  float theta=hash(n+7.0)*TAU,rad=.08+.35*hash(n+39.0);
  vec2 center=vec2(cos(theta),sin(theta))*rad;float age=mod(sweep-theta+TAU,TAU);
  float dotLight=exp(-length(p-center)*350.0)*exp(-age/1.4);
  col+=uColor2*dotLight*clamp(uGlow,0.0,4.0);
 }
 col+=uColor2*disc*exp(-behind*120.0)*.45;
 fragColor=vec4(clamp(col,0.0,1.0),1.0);
}`,
 'moire-weave':`${COMMON}
uniform float uSpacing,uTwist,uContrast;
void main(){
 vec2 p=position();float spacing=clamp(uSpacing,8.0,150.0),twist=clamp(uTwist,0.0,3.0);
 vec2 q=spin(.08+sin(uTime*.17)*.23*twist)*p;
 float first=sin(p.x*spacing+sin(p.y*3.0+uTime*.3)*twist);
 float second=sin(q.x*spacing-uTime*.3);
 float beat=clamp(.5+.5*first*second*clamp(uContrast,.1,3.0),0.0,1.0);
 vec3 col=mix(uColor0,uColor1,beat);col=mix(col,uColor2,pow(beat,6.0)*.6);
 fragColor=vec4(col,1.0);
}`,
 'lissajous-ribbons':`${COMMON}
uniform float uFrequencyX,uFrequencyY,uWidth,uGlow;
vec2 curve(float t){return vec2(sin(t*clamp(uFrequencyX,1.0,6.0)+uTime*.27),sin(t*clamp(uFrequencyY,1.0,6.0)))*.38;}
void main(){
 vec2 p=position();float distance=10.0,nearest=0.0;vec2 previous=curve(0.0);
 for(int i=1;i<=96;i++){
  float part=float(i)/96.0;vec2 point=curve(part*TAU);float d=segment(p,previous,point);
  if(d<distance){distance=d;nearest=part;}previous=point;
 }
 float width=clamp(uWidth,.001,.05),light=stroke(distance,width)+exp(-distance*50.0)*clamp(uGlow,0.0,3.0)*.35;
 vec3 tint=mix(uColor1,uColor2,.5+.5*sin(nearest*TAU-uTime));
 fragColor=vec4(clamp(uColor0+tint*light,0.0,1.0),1.0);
}`,
 'pulse-columns':`${COMMON}
uniform float uColumns,uSteps,uGap,uAmplitude,uGlow;
void main(){
 vec2 p=position()+.5;float columns=clamp(floor(uColumns),3.0,64.0),column=floor(p.x*columns),x=fract(p.x*columns);
 float height=(.22+.72*(.5+.5*sin(uTime*1.5+column*.61+sin(column+uTime*.4))))*clamp(uAmplitude,0.0,1.4);
 float gap=clamp(uGap,.01,.8)*.5,inside=step(gap,x)*step(x,1.0-gap),steps=clamp(floor(uSteps),4.0,80.0);
 float bars=step(.06,p.y)*step(p.y,height+.06)*inside*step(.12,fract(p.y*steps));
 vec3 tint=mix(uColor1,uColor2,clamp(p.y,0.0,1.0));
 float halo=exp(-abs(p.y-height-.06)*50.0)*inside*clamp(uGlow,0.0,2.0)*.2;
 fragColor=vec4(clamp(uColor0+tint*(bars+halo),0.0,1.0),1.0);
}`,
 'sand-dunes':`${COMMON}
uniform float uRidges,uWind,uLightAngle,uContrast;
float terrain(vec2 p){float t=uTime*.1*clamp(uWind,0.0,3.0);float bend=sin(p.x*3.0+t)*.45+sin(p.x*7.0-t)*.12;return sin((p.y+bend)*clamp(uRidges,2.0,20.0)-t)*.1+sin(p.y*43.0+p.x*9.0-t*3.0)*.003;}
void main(){
 vec2 p=position();float h=terrain(p),dx=(terrain(p+vec2(.002,0.0))-h)/.002,dy=(terrain(p+vec2(0.0,.002))-h)/.002;
 vec3 normal=normalize(vec3(-dx,-dy,1.0));float a=uLightAngle*TAU/360.0;
 float light=clamp(dot(normal,normalize(vec3(cos(a),sin(a),.65)))*clamp(uContrast,.2,3.0),0.0,1.0);
 vec3 col=mix(uColor0,uColor1,light);col=mix(col,uColor2,pow(light,6.0)*.4);
 fragColor=vec4(col,1.0);
}`,
 'digital-rain':`${COMMON}
uniform float uColumns,uTrail,uGlow;
float glyph(vec2 q,float seed){
 float d=1.0;
 for(int i=0;i<7;i++){
  float n=float(i);if(hash(seed+n*7.0)<.45)continue;
  vec2 a,b;
  if(i<3){float y=.22+float(i)*.28;a=vec2(.25,y);b=vec2(.75,y);}
  else{float x=i<5?.25:.75,y=mod(float(i),2.0)<.5?.22:.50;a=vec2(x,y);b=vec2(x,y+.28);}
  d=min(d,segment(q,a,b));
 }
 return 1.0-smoothstep(.025,.065,d);
}
void main(){
 vec2 p=position()+.5;float cols=clamp(floor(uColumns),6.0,80.0),rows=cols*.75;
 vec2 cell=floor(p*vec2(cols,rows)),q=fract(p*vec2(cols,rows));
 float head=fract(hash(cell.x+13.0)-uTime*.11*(.5+hash(cell.x+9.0)))*rows;
 float distance=mod(cell.y-head+rows,rows),trail=exp(-distance/max(1.0,rows*clamp(uTrail,.05,.8)));
 float shape=glyph(q,cell.x*41.0+cell.y*7.0+floor(uTime*3.0));
 vec3 tint=mix(uColor1,uColor2,exp(-distance*1.5));
 fragColor=vec4(clamp(uColor0+tint*shape*trail*clamp(uGlow,0.0,3.0),0.0,1.0),1.0);
}`,
} as const;

type Props = Record<string,unknown>;
const warm=['#100609','#fc7044','#ffe0a0'];
export const STAGE_GENERATORS=STAGE_DEFINITIONS.map(entry=>({...entry,fragment:STAGE_FRAGMENTS[entry.id]}));
export const STAGE_SHADERS=STAGE_GENERATORS.map(entry=>({id:entry.id,label:entry.label,image:false,
 presets:[{name:'Default',params:{...entry.params,colors:[...entry.colors],speed:.7,scale:1,rotation:0}},
  {name:'Amber',params:{...entry.params,colors:warm,speed:.4,scale:1,rotation:0}}],
 component:(props:Props)=><GLShader fragment={entry.fragment} uniforms={Object.fromEntries(Object.keys(entry.params).map(key=>[key,Number(props[key]??entry.params[key as keyof typeof entry.params])]))}
  colors={props.colors as string[]} frame={props.frame as number} scale={props.scale as number} rotation={props.rotation as number}
  preserveDrawingBuffer={props.preserveDrawingBuffer as boolean} minPixelRatio={props.minPixelRatio as number} maxPixelCount={props.maxPixelCount as number} style={props.style as CSSProperties}/>,
}));
