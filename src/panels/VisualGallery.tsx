import { GALLERY_LOOPS,loadBundledLoop,loopAssetUrl,type BundledLoop,type GalleryLoop } from '../features/bundled-loops';
import { LoopPreview } from '../features/LoopPreview';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AetherIcon, Button, Dialog, SearchField } from '@aether/ui';
import { GALLERY_CATEGORIES, GALLERY_VISUALS, filterGallery, recentVisuals, rememberVisual, RECENT_VISUALS_KEY, type GalleryVisual } from '../features/visual-gallery';
import { ShaderMedia } from '../features/ShaderMedia';
import { ShaderThumbnail } from '../features/ShaderThumbnail';
import { PreviewQuality } from '../features/PreviewQuality';
import type { PoolSourceKind } from '../pool-sources';
import './VisualGallery.css';

type GalleryItem=GalleryVisual|GalleryLoop;
const quality={scale:1,maxPixelCount:640*360};
function LivePreview({visual,playing}: {visual:GalleryVisual;playing:boolean}) {
 const [time,setTime]=useState(3.25);
 useEffect(()=>{
  if(!playing)return;
  let frame=0,last=0;
  const tick=(now:number)=>{
   if(!document.hidden && last){const delta=Math.min(now-last,100);setTime(current=>current+delta/1000);}last=now;frame=requestAnimationFrame(tick);
  };
  frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
 },[playing,visual.id]);
 return <PreviewQuality.Provider value={quality}><ShaderMedia key={visual.id} shader={visual.shader} timeS={time} placeholder style={{position:'absolute',inset:0}} /></PreviewQuality.Provider>;
}
export function VisualGallery({onClose,onChoose,actionLabel='Add to Media Pool',onCreate,onImport,onImportToProject,onChooseLoop,onlineLibrary,pool,timelines}: {
 onClose:()=>void;onChoose:(visual:GalleryVisual)=>void;actionLabel?:string;
 onChooseLoop?:(file:File,loop:BundledLoop)=>Promise<boolean>;
 onCreate?:(kind:PoolSourceKind)=>void;onImport?:()=>void;
 /** Imports files into the show's pool without applying them to anything. */
 onImportToProject?:()=>void;
 /** Online stock media (Pixabay/Openverse), a source like Import and Live camera. */
 onlineLibrary?:import('react').ReactNode;
 /** The show's own media pool ("In this show"), for reuse and removal. */
 pool?:{assets:readonly {id:string;name:string}[];thumbnail:(id:string)=>import('react').ReactNode;onChoose:(id:string)=>void;onRemove?:(id:string)=>void};
 /** The show's other timelines: a timeline is added like any asset (nested). */
 timelines?:{items:readonly {id:string;name:string}[];onChoose:(id:string)=>void};
}) {
 const [expanded,setExpanded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 // The main area shows the generator gallery, online media or the show's pool.
 const [source,setSource]=useState<'gallery'|'online'|'pool'|'timelines'>('gallery');
 const [poolPick,setPoolPick]=useState<string|null>(null);
 // "In this show" and "Timelines" are the same shelf: pick one, add it.
 const shelf=source==='pool'&&pool?{label:'In this show',...pool,empty:['Nothing in this show yet','Imported media and generators you create appear here for reuse.'],hint:'Select media from this show to reuse it.'}
  :source==='timelines'&&timelines?{label:'Scenes',assets:timelines.items,thumbnail:()=> <AetherIcon name="timeline-tracks"/>,onChoose:timelines.onChoose,onRemove:undefined as ((id:string)=>void)|undefined,empty:['No other scenes yet','Create a scene in the sidebar’s Scenes section; it can then be added like any layer.'],hint:'Select a scene to add it as a layer.'}
  :null;
 const items:GalleryItem[]=useMemo(()=>onChooseLoop?[...GALLERY_VISUALS,...GALLERY_LOOPS]:GALLERY_VISUALS,[onChooseLoop]);
 const categories=onChooseLoop?[...GALLERY_CATEGORIES,'Video loops']:GALLERY_CATEGORIES;
 const [category,setCategory]=useState('All'),[query,setQuery]=useState('');
 const [selected,setSelected]=useState<GalleryItem>(GALLERY_VISUALS[0]);
 const [playing,setPlaying]=useState(()=>!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
 const [recent,setRecent]=useState(()=>{try{return recentVisuals(localStorage.getItem(RECENT_VISUALS_KEY),items.map(v=>v.id));}catch{return [];}});
 const filtered=useMemo(()=>[...filterGallery(category,query),...(onChooseLoop?GALLERY_LOOPS.filter(v=>(category==='All'||category===v.category)&&query.toLowerCase().trim().split(/\s+/).every(term=>`${v.name} ${v.description} ${v.category}`.toLowerCase().includes(term))):[])],[category,query,onChooseLoop]);
 async function choose(){
  setError('');
  if('video' in selected){
   if(!onChooseLoop)return;setBusy(true);
   try{const file=await loadBundledLoop(selected.video);if(!await onChooseLoop(file,selected.video))throw Error('The loop could not be imported. Check the app message and retry.');}
   catch(problem){setError((problem as Error).message);setBusy(false);return;}
   setBusy(false);
  }else onChoose({...selected,shader:structuredClone(selected.shader)});
  const ids=rememberVisual(selected.id,recent);setRecent(ids);
  try{localStorage.setItem(RECENT_VISUALS_KEY,JSON.stringify(ids));}catch{/* Optional device preference. */}
  onClose();
 }
 const card=(visual:GalleryItem,compact=false)=><button type="button" key={visual.id} className={`map-gallery-card${compact?' is-recent':''}`}
  disabled={busy} aria-label={`Preview ${visual.name}`} aria-pressed={selected.id===visual.id} onClick={()=>{setSelected(visual);setError('');}}>
  {'video' in visual?<span className="map-shader-thumbnail"><img src={loopAssetUrl(visual.video,true)} alt="" loading="lazy"/><span className="map-loop-badge">Video · {visual.video.duration}s</span></span>:<ShaderThumbnail shader={visual.shader}/>}<span className="map-gallery-card-name">{visual.name}</span>
 </button>;
 // The pool and Properties live in separate workspace stacking contexts.
 // Put this modal above the entire workspace, including those sidebars.
 return createPortal(<Dialog open title="Visual gallery" onClose={()=>{if(!busy)onClose();}}>
  <div className="map-visual-gallery" aria-busy={busy}>
   <aside className="map-gallery-sources" aria-label="Create or import a visual">
    <div className="map-gallery-brand"><AetherIcon name="palette"/><strong>Visuals</strong><span>{items.length} ready to use</span></div>
    {onCreate && <>
     <Button disabled={busy} onClick={()=>{onClose();onCreate('colour');}}><AetherIcon name="palette"/>Solid color</Button>
     <Button disabled={busy} onClick={()=>{onClose();onCreate('paint');}}><AetherIcon name="brush"/>Drawing</Button>
     <Button disabled={busy} onClick={()=>{onClose();onCreate('text');}}><AetherIcon name="text"/>Text</Button>
    </>}
    {onImport && <Button disabled={busy} onClick={()=>{onClose();onImport();}}><AetherIcon name="import"/>Import image or video</Button>}
    {onImportToProject && <Button disabled={busy} onClick={()=>{onClose();onImportToProject();}}><AetherIcon name="folder"/>Add to project</Button>}
    {onCreate && <Button disabled={busy} onClick={()=>{onClose();onCreate('webcam');}}><AetherIcon name="camera"/>Live camera</Button>}
    {onlineLibrary && <Button disabled={busy} aria-pressed={source==='online'} onClick={()=>setSource(v=>v==='online'?'gallery':'online')}><AetherIcon name="search"/>Online media</Button>}
    {(onCreate || pool || timelines) && <>
     <h3 className="map-gallery-sources-heading">Advanced</h3>
     {onCreate && <Button disabled={busy} onClick={()=>{onClose();onCreate('test-pattern');}}><AetherIcon name="surface"/>Test pattern</Button>}
     {onCreate && <Button disabled={busy} onClick={()=>{onClose();onCreate('tracker');}}><AetherIcon name="tracker"/>Tracker</Button>}
     {pool && <Button disabled={busy} aria-pressed={source==='pool'} onClick={()=>setSource(v=>v==='pool'?'gallery':'pool')}><AetherIcon name="folder"/>In this show</Button>}
     {timelines && <Button disabled={busy} aria-pressed={source==='timelines'} onClick={()=>{setPoolPick(null);setSource(v=>v==='timelines'?'gallery':'timelines');}}><AetherIcon name="timeline-tracks"/>Scenes</Button>}
    </>}
    <p>Generators keep their editable colors and motion. {onChooseLoop?'Video loops import as ordinary media for timing, layering and effects.':'All generators are included and work offline.'}</p>
   </aside>
   {source==='online' ? <main className="map-gallery-main map-gallery-online" aria-label="Online media">{onlineLibrary}</main>
   : shelf ? <><main className="map-gallery-main" aria-label={shelf.label}>
     <div className="map-gallery-scroll">{shelf.assets.length
      ? <div className="map-gallery-grid">{shelf.assets.map(asset=><button type="button" key={asset.id} className="map-gallery-card" aria-label={`Preview ${asset.name}`} aria-pressed={poolPick===asset.id} onClick={()=>setPoolPick(asset.id)}>
         <span className="map-shader-thumbnail">{shelf.thumbnail(asset.id)}</span><span className="map-gallery-card-name">{asset.name}</span></button>)}</div>
      : <div className="map-gallery-empty"><strong>{shelf.empty[0]}</strong><p>{shelf.empty[1]}</p></div>}</div>
    </main>
    <aside className="map-gallery-detail" aria-label="Selected media">{(()=>{const asset=shelf.assets.find(a=>a.id===poolPick);return asset?<div className="map-gallery-detail-copy">
      <div className="map-gallery-preview">{shelf.thumbnail(asset.id)}</div><span className="map-gallery-category">{shelf.label}</span><h2>{asset.name}</h2>
      <Button className="map-gallery-add" primary onClick={()=>{shelf.onChoose(asset.id);onClose();}}>{actionLabel}</Button>
      {shelf.onRemove&&<Button onClick={()=>{shelf.onRemove!(asset.id);setPoolPick(null);}}>Remove from pool</Button>}
    </div>:<div className="map-gallery-detail-copy"><p>{shelf.hint}</p></div>;})()}</aside></>
   : <>
   <main className="map-gallery-main" inert={expanded} aria-hidden={expanded || undefined}>
    <div className="map-gallery-search"><SearchField ariaLabel="Search visuals" placeholder="Search visuals…" value={query} onQueryChange={setQuery}/><span>{filtered.length} visuals</span></div>
    <div className="map-gallery-categories" role="group" aria-label="Visual categories">{['All',...categories].map(name=><button key={name} type="button" disabled={busy} aria-pressed={category===name} onClick={()=>setCategory(name)}>{name}</button>)}</div>
    <div className="map-gallery-scroll">
     {category==='All' && !query.trim() && recent.length>0 && <section aria-label="Recent visuals"><h3>Recent</h3><div className="map-gallery-recent">{recent.flatMap(id=>items.filter(v=>v.id===id)).map(v=>card(v,true))}</div></section>}
     {categories.filter(name=>filtered.some(v=>v.category===name)).map(name=><section key={name} aria-label={`${name} visuals`}><h3>{name}</h3><div className="map-gallery-grid">{filtered.filter(v=>v.category===name).map(v=>card(v))}</div></section>)}
     {!filtered.length && <div className="map-gallery-empty"><strong>No matching visuals</strong><p>Try another search or category.</p><Button onClick={()=>{setQuery('');setCategory('All');}}>Show all visuals</Button></div>}
    </div>
   </main>
   <aside className={`map-gallery-detail${expanded ? ' is-expanded' : ''}`} aria-label="Selected visual">
    <div className="map-gallery-preview">{'video' in selected?<LoopPreview key={selected.id} loop={selected.video} playing={playing}/>:<LivePreview key={selected.id} visual={selected} playing={playing}/>} </div>
    <div className="map-gallery-detail-copy"><span className="map-gallery-category">{selected.category}</span><h2>{selected.name}</h2><p>{selected.description}</p>
     <Button aria-label={playing?'Pause preview':'Play preview'} onClick={()=>setPlaying(v=>!v)}><AetherIcon name={playing?'pause':'play'}/>{playing?'Pause preview':'Play preview'}</Button>
     <Button onClick={()=>setExpanded(v=>!v)}>{expanded?'Back to gallery':'Enlarge preview'}</Button>
     <Button className="map-gallery-add" primary disabled={busy} onClick={()=>void choose()}>{busy?'Importing video…':actionLabel}</Button>
     {'video' in selected&&<small>{selected.video.width} × {selected.video.height} · {selected.video.fps} fps · {selected.video.duration}s · Original Aether artwork</small>}
     {error&&<p role="alert">{error}</p>}
     <small>Previewing does not change your show.</small>
    </div>
   </aside>
   </>}
  </div>
 </Dialog>, document.body);
}
