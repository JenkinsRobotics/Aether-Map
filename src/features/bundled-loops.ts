import manifest from '../../public/visual-loops/manifest.json';
import type { MediaCredit } from '../document';

export interface BundledLoop { id:string; name:string; description:string; file:string; poster:string; width:number; height:number; duration:number; fps:number; bytes:number; sha256:string }
export const BUNDLED_LOOPS:readonly BundledLoop[]=manifest;
export interface GalleryLoop { id:string; name:string; category:'Video loops'; description:string; video:BundledLoop }
export const GALLERY_LOOPS:GalleryLoop[]=BUNDLED_LOOPS.map(video=>({id:`loop:${video.id}`,name:video.name,category:'Video loops',description:video.description,video}));
export const loopCredit:MediaCredit={provider:'Aether Map',creator:'Aether Studio',license:'Original Aether Map artwork',sourceUrl:'',text:'Original procedural video created for Aether Map. No third-party footage.'};
export function loopAssetUrl(loop:BundledLoop,poster=false):string {
 const known=BUNDLED_LOOPS.find(entry=>entry.id===loop.id);
 if(!known)throw Error('Unknown bundled video loop.');
 const url=new URL(`visual-loops/${poster?known.poster:known.file}`,new URL(import.meta.env.BASE_URL,document.baseURI));
 url.searchParams.set('v',known.sha256);
 return url.href;
}
/** Turn the pinned bundled file into an ordinary import. Stored shows and exports
 * retain the media bytes through their existing upload/packaging path. */
export async function loadBundledLoop(loop:BundledLoop,signal?:AbortSignal):Promise<File>{
 const known=BUNDLED_LOOPS.find(entry=>entry.id===loop.id);
 if(!known)throw Error('Unknown bundled video loop.');
 const response=await fetch(loopAssetUrl(known),{signal:signal??AbortSignal.timeout(30000)});
 if(!response.ok)throw Error(response.status===401?'Sign in to load this video loop.':`The video loop could not be loaded (${response.status}).`);
 const buffer=await response.arrayBuffer();
 if(buffer.byteLength!==known.bytes)throw Error('The bundled video is incomplete. Reload the app and try again.');
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),b=>b.toString(16).padStart(2,'0')).join('');
 if(digest!==known.sha256)throw Error('The bundled video failed its integrity check. Reload the app and try again.');
 return new File([buffer],`${known.name}.mp4`,{type:'video/mp4'});
}
