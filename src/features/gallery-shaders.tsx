import { GALLERY_DEFINITIONS } from './original-shader-presets';
export { NATIVE_SHADER_IDS } from './original-shader-presets';
import type { CSSProperties } from 'react';
import { GLShader, PREAMBLE } from './GLShader';

/** Original, resolution-independent projection visuals. The show clock drives
 * every frame; no downloads, random runtime state or separate preview renderer. */
const FRAGMENT = `${PREAMBLE}
uniform float uMode;
uniform float uSpeed;
uniform float uDensity;
uniform float uGlow;
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float line(float d, float w) { return 1.0-smoothstep(w,w+0.004,abs(d)); }
vec3 palette(float v) { return mix(uColor1,uColor2,0.5+0.5*sin(v)); }
void main() {
 vec2 uv=gl_FragCoord.xy/uResolution;
 vec2 p=(gl_FragCoord.xy-0.5*uResolution)/min(uResolution.x,uResolution.y);
 p=spin(uRotation*TAU/360.0)*p/max(0.05,uScale);
 float t=uTime*uSpeed, density=max(1.0,uDensity);
 vec3 col=uColor0;
 if(uMode<0.5) {
  for(int i=0;i<8;i++) {
   float f=float(i), a=f*0.65+t*0.13;
   float d=dot(p,vec2(cos(a),sin(a)))-sin(t*0.45+f)*0.32;
   col+=palette(f+t*0.2)*(line(d,0.003)+exp(-abs(d)*60.0)*uGlow*0.45);
  }
 } else if(uMode<1.5) {
  float horizon=0.08;
  if(p.y<horizon) {
   float z=0.22/max(0.015,horizon-p.y);
   float road=p.x*z;
   float grid=max(line(fract(road*density)-0.5,0.025),line(fract(z*2.0-t)-0.5,0.045));
   col=mix(uColor0,palette(z*0.2),grid*clamp(1.4-z*0.075,0.0,1.0));
  } else {
   float sun=1.0-smoothstep(0.19,0.195,length(p-vec2(0.0,0.22)));
   float stripes=step(0.20,fract(p.y*30.0));
   col=mix(uColor0,mix(uColor1,uColor2,clamp(p.y*2.0,0.0,1.0)),sun*stripes);
  }
 } else if(uMode<2.5) {
  vec2 cell=floor((p+1.0)*density), q=fract((p+1.0)*density);
  float n=hash(cell), phase=sin(t*1.5+n*TAU+cell.x*0.25);
  float mask=step(0.07,q.x)*step(0.07,q.y)*step(q.x,0.93)*step(q.y,0.93);
  col=mix(uColor0,palette(n*TAU+t*0.25)*(0.25+0.75*(0.5+0.5*phase)),mask);
 } else if(uMode<3.5) {
  float d=length(p)+0.055*sin(atan(p.y,p.x)*5.0+t)+0.025*sin(p.x*9.0-t);
  float bands=fract(d*density-t*0.1);
  col+=palette(d*8.0+t*0.3)*line(bands-0.5,0.035)*uGlow;
 } else if(uMode<4.5) {
  for(int i=0;i<3;i++) {
   float layer=float(i)+1.0;
   vec2 grid=p*(density+layer*7.0)+vec2(t*0.13,t*0.07)*layer;
   vec2 cell=floor(grid), q=fract(grid)-0.5;
   float n=hash(cell+layer), star=exp(-length(q-vec2(n-0.5,hash(cell+13.0)-0.5)*0.65)*100.0/layer);
   col+=palette(n*6.0)*star*(0.5+0.5*sin(t+n*TAU))*uGlow;
  }
 } else if(uMode<5.5) {
  for(int i=0;i<5;i++) {
   float f=float(i), h=0.12*sin(p.x*3.0+t*0.3+f)+0.06*sin(p.x*8.0-t*0.2+f);
   float curtain=exp(-abs(p.y-h+f*0.08)*12.0)*(0.55+0.45*sin(p.x*density+t*0.4+f));
   col+=palette(f*0.7+p.x*2.0)*curtain*uGlow*0.35;
  }
 } else if(uMode<6.5) {
  for(int i=0;i<3;i++) {
   float layer=float(i)+1.0;
   vec2 grid=(p+vec2(t*0.025*sin(layer),t*0.08))*density*layer;
   vec2 cell=floor(grid), q=fract(grid)-0.5;
   float n=hash(cell+layer);
   col+=palette(n)* (1.0-smoothstep(0.015,0.055/layer,length(q-vec2(n-0.5,hash(cell+5.0)-0.5)*0.6)))*uGlow;
  }
 } else if(uMode<7.5) {
  vec2 grid=(p+vec2(0.0,t*0.06))*density;
  vec2 cell=floor(grid), q=fract(grid)-0.5;
  q=spin((hash(cell)-0.5)*0.7)*q;
  q.y-=0.08; q.y=-q.y;
  float heart=pow(q.x*q.x+q.y*q.y-0.075,3.0)-q.x*q.x*q.y*q.y*q.y;
  col=mix(uColor0,palette(hash(cell)*TAU),1.0-smoothstep(-0.0001,0.0002,heart));
 } else if(uMode<8.5) {
  vec2 eye=p-vec2(sin(t*0.45)*0.06,cos(t*0.35)*0.03);
  float r=length(eye), a=atan(eye.y,eye.x);
  float orb=1.0-smoothstep(0.345,0.35,r);
  vec3 sclera=vec3(0.88,0.85,0.79)*sqrt(max(0.0,1.0-r*r/0.125));
  float iris=1.0-smoothstep(0.16,0.165,r);
  vec3 irisColor=palette(sin(a*density)+sin(a*density*2.3+r*95.0))* (0.3+0.7*sin(a*33.0+r*160.0)*sin(a*33.0+r*160.0));
  vec3 eyeball=mix(sclera,irisColor,iris);
  eyeball=mix(eyeball,vec3(0.005),1.0-smoothstep(0.058,0.065+0.006*sin(t),r));
  eyeball+=vec3(0.7)*(1.0-smoothstep(0.012,0.033,length(eye-vec2(-0.065,0.08))));
  col=mix(uColor0,eyeball,orb);
 } else if(uMode<9.5) {
  vec2 q=p*1.8;
  float flicker=0.8+0.12*sin(t*7.0)+0.08*sin(t*13.0);
  float eyes=step(abs(abs(q.x)-0.32),0.18)*step(0.1,q.y)*step(q.y,0.38-abs(abs(q.x)-0.32));
  float nose=step(abs(q.x),0.10)*step(-0.06,q.y)*step(q.y,0.16-abs(q.x));
  float mouth=step(abs(q.x),0.6)*step(-0.39+0.20*q.x*q.x,q.y)*step(q.y,-0.16-0.10*cos(q.x*14.0));
  col+=mix(uColor1,uColor2,uv.y)*clamp(eyes+nose+mouth,0.0,1.0)*flicker*uGlow;
 } else {
  float hill=-0.19+0.10*sin(p.x*4.0)+0.035*sin(p.x*11.0);
  col=mix(uColor0,palette(p.y*4.0+t*0.06),smoothstep(-0.4,0.8,p.y)*0.65);
  col+=uColor2*(1.0-smoothstep(0.075,0.08,length(p-vec2(0.25,0.25))));
  col=mix(col,uColor0*0.4,1.0-smoothstep(hill,hill+0.004,p.y));
  float frame=max(line(p.x,0.012),line(p.y,0.012));
  frame=max(frame,step(0.73,abs(p.x))); frame=max(frame,step(0.43,abs(p.y)));
  col=mix(col,vec3(0.012),frame);
 }
 fragColor=vec4(clamp(col,0.0,1.0),1.0);
}`;

type Props = Record<string, unknown>;
function GalleryShader(props: Props) {
 return <GLShader fragment={FRAGMENT} uniforms={Object.fromEntries(['mode','speed','density','glow'].map(key => [key, Number(props[key] ?? 1)]))}
  colors={props.colors as string[]} frame={props.frame as number} scale={props.scale as number} rotation={props.rotation as number}
  preserveDrawingBuffer={props.preserveDrawingBuffer as boolean} minPixelRatio={props.minPixelRatio as number}
  maxPixelCount={props.maxPixelCount as number} style={props.style as CSSProperties} />;
}
export const GALLERY_SHADERS = GALLERY_DEFINITIONS.map((entry,mode) => ({...entry, component:(props:Props)=><GalleryShader {...props} mode={mode}/>, image:false}));
