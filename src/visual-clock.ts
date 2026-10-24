import type { MapShow } from './document';
import type { Visual } from './visual-model';
import { mediaTime } from './clips';
import { visualSource } from './media-pool';
/** Clip-local source time; a compound use samples its child timeline's duration. */
export function visualSourceTime(show:MapShow,visual:Visual,timeS:number):number {
 if(visual.continuous)return timeS;
 if(visual.timelineRefID){
  const duration=show.timelines?.find(t=>t.id===visual.timelineRefID)?.durationS??0,local=visual.inS+timeS-visual.startS;
  return duration>0?(visual.loop?((local%duration)+duration)%duration:Math.max(0,Math.min(local,duration-.000001))):0;
 }
 const source=visualSource(show,visual);return mediaTime(visual,show.media.find(m=>m.id===source.mediaId),timeS);
}

export interface VisualClockSegment {
 startS:number; endS:number; sourceStartS:number; rate:0|1;
}
/** Exact affine projection of the existing clock. Callers intersect the clip's
 * active interval first. Holds and wraps are separate pieces, never interpolated
 * across. A budget refusal is preferable to silently omitting a short loop. */
export function visualClockSegments(show:MapShow,visual:Visual,startS:number,endS:number,maxSegments=16384):VisualClockSegment[] {
 if(![startS,endS].every(Number.isFinite)||startS<0||endS<startS||!Number.isSafeInteger(maxSegments)||maxSegments<1)throw new Error('Invalid timeline clock interval.');
 if(endS===startS)return [];
 if(visual.continuous)return [{startS,endS,sourceStartS:startS,rate:1}];
 const source=visualSource(show,visual);
 const length=visual.timelineRefID?show.timelines?.find(t=>t.id===visual.timelineRefID)?.durationS:show.media.find(m=>m.id===source.mediaId)?.duration;
 const boundaries=new Set([startS,endS]);
 const add=(time:number)=>{if(time>startS&&time<endS)boundaries.add(time);};
 const offset=visual.inS-visual.startS;
 add(visual.timelineRefID?-offset:visual.startS);
 if(length&&length>0){
  if(visual.loop){
   const first=Math.floor((startS+offset)/length)+1,last=Math.ceil((endS+offset)/length)-1;
   if(!Number.isSafeInteger(first)||!Number.isSafeInteger(last)||last-first+1>maxSegments)throw new Error('Timeline loop exceeds the offline segment budget.');
   for(let n=first;n<=last;n++)add(n*length-offset);
  }else add(visual.startS+Math.max(0,length-(visual.timelineRefID?1e-6:0))-visual.inS);
 }
 const times=[...boundaries].sort((a,b)=>a-b);
 if(times.length-1>maxSegments)throw new Error('Timeline loop exceeds the offline segment budget.');
 return times.slice(0,-1).map((startS,i)=>{
  const endS=times[i+1],mid=startS+(endS-startS)/2;
  const raw=visual.inS+(visual.timelineRefID?mid-visual.startS:Math.max(0,mid-visual.startS));
  const held=visual.timelineRefID?!(length&&length>0)||!visual.loop&&(raw<=0||raw>=length-1e-6):mid<visual.startS||!!length&&length>0&&!visual.loop&&raw>=length;
  const rate=held?0:1;
  return {startS,endS,sourceStartS:visualSourceTime(show,visual,mid)-rate*(mid-startS),rate};
 });
}
