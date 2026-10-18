/** Deterministic, DOM-free color channels for the formats authored by Map. */
export interface SourceColor { hueDeg:number; saturationPercent:number; brightnessPercent:number; alphaPercent:number }
const clamp=(v:number,min=0,max=1)=>Math.min(max,Math.max(min,v));
const names:Record<string,string>={transparent:'#00000000',black:'#000000',white:'#ffffff',red:'#ff0000',green:'#008000',lime:'#00ff00',blue:'#0000ff',yellow:'#ffff00',cyan:'#00ffff',aqua:'#00ffff',magenta:'#ff00ff',fuchsia:'#ff00ff',gray:'#808080',grey:'#808080',silver:'#c0c0c0',maroon:'#800000',olive:'#808000',purple:'#800080',teal:'#008080',navy:'#000080',orange:'#ffa500'};
export function sourceColor(value:string):SourceColor|undefined {
 let raw=value.trim().toLowerCase();raw=Object.hasOwn(names,raw)?names[raw]:raw;
 let rgba:number[]|undefined;
 if(/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/.test(raw)){
  let hex=raw.slice(1);if(hex.length<=4)hex=[...hex].map(c=>c+c).join('');
  rgba=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255);rgba.push(hex.length===8?parseInt(hex.slice(6,8),16)/255:1);
 }else{
  const m=/^(rgba?|hsla?)\(([^()]*)\)$/.exec(raw);if(!m)return;
  const parts=m[2].trim().split(/[\s,/]+/);if(parts.length<3||parts.length>4)return;
  const numeric=/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(%|deg|turn|rad|grad)?$/;
  if(!parts.every(p=>numeric.test(p)&&Number.isFinite(parseFloat(p))))return;
  const alpha=parts[3]===undefined?1:parseFloat(parts[3])/(parts[3].endsWith('%')?100:1);
  if(parts[3]&&/deg|turn|rad/.test(parts[3]))return;
  if(m[1].startsWith('rgb')){
   if(parts.slice(0,3).some(p=>/deg|turn|rad/.test(p)))return;
   rgba=parts.slice(0,3).map(p=>clamp(parseFloat(p)/(p.endsWith('%')?100:255)));rgba.push(clamp(alpha));
  }else{
   if(!parts[1].endsWith('%')||!parts[2].endsWith('%')||parts[0].endsWith('%'))return;
   let h=parseFloat(parts[0]);if(parts[0].endsWith('turn'))h*=360;else if(parts[0].endsWith('grad'))h*=.9;else if(parts[0].endsWith('rad'))h*=180/Math.PI;
   if(!Number.isFinite(h))return;
   h=((h%360)+360)%360/60;const s=clamp(parseFloat(parts[1])/100),l=clamp(parseFloat(parts[2])/100),c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs(h%2-1)),base=l-c/2;
   const rgb=h<1?[c,x,0]:h<2?[x,c,0]:h<3?[0,c,x]:h<4?[0,x,c]:h<5?[x,0,c]:[c,0,x];rgba=[...rgb.map(v=>v+base),clamp(alpha)];
  }
 }
 const [r,g,b,a]=rgba,max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
 const hue=delta===0?0:max===r?((g-b)/delta)%6:max===g?(b-r)/delta+2:(r-g)/delta+4;
 return {hueDeg:((hue*60)%360+360)%360,saturationPercent:max?delta/max*100:0,brightnessPercent:max*100,alphaPercent:a*100};
}
export function sourceColorHex(color:SourceColor,alpha=true):string {
 const h=((color.hueDeg%360)+360)%360/60,s=clamp(color.saturationPercent/100),v=clamp(color.brightnessPercent/100),c=v*s,x=c*(1-Math.abs(h%2-1));
 const rgb=h<1?[c,x,0]:h<2?[x,c,0]:h<3?[0,c,x]:h<4?[0,x,c]:h<5?[x,0,c]:[c,0,x];
 const bytes=rgb.map(n=>n+v-c);if(alpha&&color.alphaPercent<100)bytes.push(clamp(color.alphaPercent/100));
 return '#'+bytes.map(n=>Math.round(clamp(n)*255).toString(16).padStart(2,'0')).join('');
}
