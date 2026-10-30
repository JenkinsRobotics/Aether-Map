import { visualLookVersion,VISUAL_LOOK_SLOTS,storeVisualLook,recallVisualLook,clearVisualLook,randomVisualLook } from '../visual-looks';
import { sourceParameters, setSourceMotionBases, readSourceMotion, sourceMotionVersion,MAX_SOURCE_MOTION_CHANNELS } from '../source-motion';
import { parameterKeys, parameterModulation } from './parameter-motion';
import { VISUAL_MOTION_PARAMETERS, readVisualMotion, visualMotionVersion } from '../visual-motion';
import { effectDefinition, isEffectKind, effectAmount } from '../visual-effects';
import { DEFAULT_TEXT, type MapShow, type Surface } from '../document';
import { GALLERY_VISUALS } from '../features/visual-gallery';
import { addSimpleVisual, replaceSimpleVisual, visualIsLocked } from '../simple-visuals';
import { visualSource } from '../media-pool';
import { MAIN_TIMELINE } from '../timelines';
import { DEFAULT_PLACEMENT } from '../visual-placement';
import type { Visual, VisualEffect } from '../visual-model';
import { jsonObject, name, number, object } from './catalog';

function color(value: unknown): string {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)) throw Error('Use a hex color: #RRGGBB or #RRGGBBAA.');
  return value;
}
export function visualSourceSpec(show: MapShow, value: unknown): Surface['source'] {
  const spec = object(value);
  const source: Surface['source'] = { mediaId: null, rect: [0, 0, 1920, 1080] };
  switch (spec.kind) {
    case 'gallery': {
      object(spec, ['kind', 'id']);
      const preset = GALLERY_VISUALS.find(item => item.id === spec.id);
      if (!preset) throw Error('Unknown gallery ID. Discover the gallery first.');
      return { ...source, shader: structuredClone(preset.shader) };
    }
    case 'color': object(spec, ['kind', 'color']); return { ...source, fill: color(spec.color) };
    case 'text': {
      object(spec, ['kind', 'text', 'color', 'size']);
      if (typeof spec.text !== 'string' || !spec.text.trim() || spec.text.length > 2000) throw Error('Text must contain 1–2000 characters.');
      return { ...source, text: { ...DEFAULT_TEXT, text: spec.text,
        ...(spec.color !== undefined ? { color: color(spec.color) } : {}),
        ...(spec.size !== undefined ? { sizePx: number(spec.size, 'text size', 1, 1000) } : {}),
      } };
    }
    case 'media': {
      object(spec, ['kind', 'media_id']);
      const media = show.media.find(item => item.id === spec.media_id);
      if (!media || media.kind === 'audio') throw Error('Choose an existing image or video media ID. Import the file first.');
      return { ...source, mediaId: media.id, rect: [0, 0, media.width, media.height] };
    }
    case 'gradient': {
      // Drawn as SVG, so it plays on players without usable WebGL.
      object(spec, ['kind', 'colors', 'angle_degrees', 'radial']);
      if (!Array.isArray(spec.colors) || spec.colors.length < 2 || spec.colors.length > 16) throw Error('A gradient needs 2–16 colors.');
      const colors = spec.colors.map(color), last = colors.length - 1;
      return { ...source, fill: colors[0], fillGradient: { kind: spec.radial === true ? 'radial' : 'linear',
        angleDeg: spec.angle_degrees === undefined ? 90 : number(spec.angle_degrees, 'angle_degrees', 0, 360),
        stops: colors.map((c, i) => ({ offset: i / last, color: c, opacity: 1 })) } };
    }
    case 'cast': object(spec, ['kind']); return { ...source, cast: true };
    case 'web': {
      object(spec, ['kind', 'url']);
      if (typeof spec.url !== 'string' || !/^https:\/\/\S{1,2040}$/.test(spec.url)) throw Error('Web address must be an https:// URL without spaces.');
      return { ...source, web: { url: spec.url } };
    }
    default: throw Error('Source kind must be gallery, color, gradient, text, media, cast or web.');
  }
}

export function createAgentVisual(show: MapShow, args: Record<string, unknown>) {
  if (!show.scenes.some(scene => scene.id === args.scene_id)) throw Error('Scene not found.');
  if ((show.visuals?.length ?? 0) >= 4096) throw Error('Visual creation exceeds the 4096-visual limit.');
  const next = addSimpleVisual({ ...show, activeSceneId: args.scene_id as string, activeTimelineID: MAIN_TIMELINE }, visualSourceSpec(show, jsonObject(args.source_json)), name(args.name));
  const visual = next.visuals!.at(-1)!;
  return { show: { ...next, activeSceneId: show.activeSceneId, activeTimelineID: show.activeTimelineID },
    created: { clip_id: visual.id, asset_id: visual.assetID!, track_id: visual.trackID! } };
}

export function editAgentVisual(show: MapShow, args: Record<string, unknown>): MapShow {
  const visual = show.visuals?.find(item => item.id === args.clip_id);
  if (!visual) throw Error('Visual not found.');
  if (visualIsLocked(show, visual)) throw Error('The visual or its track is locked.');
  if (visual.mask || show.tracks?.find(t => t.id === visual.trackID)?.kind === 'audio') throw Error('Choose a visual or timeline clip, not a mask or audio clip.');
  const changes = object(jsonObject(args.changes_json), visual.timelineRefID
    ? ['name','opacity','enabled','loop','start_s','duration_s','motion']
    : ['name','opacity','enabled','mapping','continuous','loop','start_s','duration_s','source','targets','placement','effects','shader','motion','source_parameters','source_motion','preset']);
  if (!Object.keys(changes).length) throw Error('Supply at least one visual change.');
  let next = show;
  if (changes.source !== undefined) next = replaceSimpleVisual(show, visual.id, visualSourceSpec(show, changes.source), visual.name);
  let edited: Visual = { ...next.visuals!.find(v => v.id === visual.id)! };
  if (changes.name !== undefined) edited.name = name(changes.name);
  if (changes.opacity !== undefined) edited.opacity = number(changes.opacity, 'opacity', 0, 1);
  for (const key of ['enabled', 'continuous', 'loop'] as const) if (changes[key] !== undefined) {
    if (typeof changes[key] !== 'boolean') throw Error(`${key} must be true or false.`);
    edited[key] = changes[key];
  }
  if (changes.mapping !== undefined) {
    if (!['repeat','span'].includes(changes.mapping as string)) throw Error('Mapping must be repeat or span.');
    edited.mapping = changes.mapping as Visual['mapping'];
  }
  if (changes.start_s !== undefined) edited.startS = number(changes.start_s, 'start_s', 0, 604800);
  if (changes.duration_s !== undefined) edited.durationS = number(changes.duration_s, 'duration_s', .001, 604800);
  if (edited.startS + edited.durationS > 604800) throw Error('A clip must end within seven days.');
  if (changes.targets !== undefined) {
    if (!Array.isArray(changes.targets) || changes.targets.length > 256) throw Error('Use at most 256 targets.');
    edited.targets = changes.targets.map(value => {
      const target = object(value, ['scene_id','surface_id']);
      const scene = show.scenes.find(s => s.id === target.scene_id);
      if (!scene) throw Error('Target scene not found.');
      if (target.surface_id !== undefined && !scene.surfaces.some(s => s.id === target.surface_id && s.kind !== 'mask' && !s.sceneCanvas)) throw Error('Target surface not found or is not a mapping surface.');
      return { sceneID: scene.id, ...(target.surface_id !== undefined ? {surfaceID: target.surface_id as string} : {}) };
    });
    if (new Set(edited.targets.map(t => JSON.stringify(t))).size !== edited.targets.length) throw Error('Duplicate targets are not allowed.');
    edited.legacyTrack = undefined;
  }
  if (changes.placement !== undefined) {
    const values = object(changes.placement, Object.keys(DEFAULT_PLACEMENT));
    const placement = { ...DEFAULT_PLACEMENT, ...edited.placement };
    for (const key of Object.keys(values) as (keyof typeof placement)[]) {
      const size = key === 'widthPercent' || key === 'heightPercent', rotation = key === 'rotationDeg';
      placement[key] = number(values[key], key, size ? .1 : rotation ? -3600 : -1000, size ? 2000 : rotation ? 3600 : 1000);
    }
    edited.placement = placement;
  }
  if (changes.motion !== undefined) {
    if (changes.motion === null) edited.motion = undefined;
    else {
      const raw = object(changes.motion, ['animation','modulation']);
      const specs = VISUAL_MOTION_PARAMETERS.filter(p => !visual.timelineRefID || p.key === 'opacityPercent');
      const motion = { ...edited.motion };
      for (const field of ['animation','modulation'] as const) if (raw[field] !== undefined) {
        if (raw[field] === null) { delete motion[field]; continue; }
        const values = object(raw[field], specs.map(p => p.key));
        for (const [key, value] of Object.entries(values)) {
          const spec = specs.find(p => p.key === key)!;
          if (field === 'animation') {
            const assignments = { ...motion.animation }, keys = parameterKeys(value, spec.min, spec.max);
            if (keys) assignments[spec.key] = keys; else delete assignments[spec.key];
            motion.animation = assignments;
          } else {
            const assignments = { ...motion.modulation }, assignment = parameterModulation(value, spec.min, spec.max);
            if (assignment) assignments[spec.key] = assignment; else delete assignments[spec.key];
            motion.modulation = assignments;
          }
        }
      }
      edited.motion = readVisualMotion(motion, !!visual.timelineRefID);
    }
  }
  if(changes.source_parameters!==undefined||changes.source_motion!==undefined){
    let source=visualSource(next,edited);
    const media=show.media.find(m=>m.id===source.mediaId),specs=sourceParameters(source,media);
    if(changes.source_parameters!==undefined){
      const values=object(changes.source_parameters,specs.map(p=>p.key));
      const bases=Object.fromEntries(Object.entries(values).map(([key,value])=>{const spec=specs.find(p=>p.key===key)!;const n=number(value,key,spec.min,spec.max);if(spec.options&&!Number.isInteger(n))throw Error('Choice values must be integer indices.');return [key,n];}));source=setSourceMotionBases(source,bases,media);
    }
    if(changes.source_motion!==undefined){
      if(changes.source_motion===null)source={...source,motion:undefined};
      else {
        const raw=object(changes.source_motion,['animation','modulation']),motion={...source.motion};
        for(const field of ['animation','modulation'] as const)if(raw[field]!==undefined){
          if(raw[field]===null){delete motion[field];continue;}
          const values=object(raw[field],specs.map(p=>p.key));
          for(const [key,value] of Object.entries(values)){
            const spec=specs.find(p=>p.key===key)!;
            if(field==='animation'){const assignments={...motion.animation},keys=parameterKeys(value,spec.min,spec.max,!!spec.options);if(keys)assignments[spec.key]=keys;else delete assignments[spec.key];motion.animation=assignments;}
            else {const assignments={...motion.modulation},m=parameterModulation(value,spec.min,spec.max);if(m)assignments[spec.key]=m;else delete assignments[spec.key];motion.modulation=assignments;}
          }
        }
        if(new Set([...Object.keys(motion.animation??{}),...Object.keys(motion.modulation??{})]).size>MAX_SOURCE_MOTION_CHANNELS)throw Error(`Use at most ${MAX_SOURCE_MOTION_CHANNELS} source motion channels; clear an unused channel first.`);
        source={...source,motion:readSourceMotion(motion)};
      }
    }
    edited={...edited,source};
  }
  if (changes.effects !== undefined) {
    if (!Array.isArray(changes.effects) || changes.effects.length > 12) throw Error('Use at most 12 effects.');
    edited.effects = changes.effects.map(value => {
      const e = object(value, ['kind','amount','enabled','modulation','animation']);
      if (!isEffectKind(e.kind)) throw Error('Unknown effect kind.');
      if (e.enabled !== undefined && typeof e.enabled !== 'boolean') throw Error('Effect enabled must be boolean.');
      return { id: crypto.randomUUID(), kind: e.kind as VisualEffect['kind'], amount: effectAmount(e.kind, number(e.amount, 'effect amount', effectDefinition(e.kind).min, effectDefinition(e.kind).max)), enabled: e.enabled !== false,
        ...(e.modulation !== undefined ? { modulation:parameterModulation(e.modulation,effectDefinition(e.kind).min,effectDefinition(e.kind).max) } : {}),
        ...(e.animation !== undefined ? { animation:parameterKeys(e.animation,effectDefinition(e.kind).min,effectDefinition(e.kind).max) } : {}) };
    });
  }
  if (changes.shader !== undefined) {
    const source = structuredClone(visualSource(next, edited));
    if (!source.shader) throw Error('This visual is not a shader.');
    const values = object(changes.shader, ['colors','speed','scale','density','glow','animation','modulation']);
    if (values.colors !== undefined) {
      if (!Array.isArray(values.colors) || !values.colors.length || values.colors.length > 8) throw Error('Use 1–8 shader colors.');
      source.shader.colors = values.colors.map(color);
    }
    for (const key of ['speed','scale','density','glow'] as const) if (values[key] !== undefined) {
      if (typeof source.shader.parameters[key] !== 'number') throw Error(`This shader does not offer ${key}.`);
      source.shader.parameters[key] = number(values[key], key, key === 'speed' ? -10 : 0, key === 'scale' ? 20 : 10);
    }
    const numeric = Object.keys(source.shader.parameters).filter(key=>typeof source.shader!.parameters[key] === 'number' && !['__proto__','constructor','prototype'].includes(key));
    for (const field of ['animation','modulation'] as const) if (values[field] !== undefined) {
      if (values[field] === null) { delete source.shader[field]; continue; }
      const motion = object(values[field], numeric);
      if (Object.keys(motion).length > 256) throw Error('Use at most 256 parameter assignments.');
      for (const [key, value] of Object.entries(motion)) {
        if (field === 'animation') { const next = parameterKeys(value), assignments = { ...source.shader.animation }; if (next) assignments[key]=next; else delete assignments[key]; source.shader.animation=assignments; }
        else { const next=parameterModulation(value), assignments={...source.shader.modulation}; if(next) assignments[key]=next;else delete assignments[key];source.shader.modulation=assignments; }
      }
    }
    edited = { ...edited, source };
  }
  if(changes.preset!==undefined){
    const preset=object(changes.preset,['action','slot','from_clip_id','seed']);
    if(!['store','recall','clear','random'].includes(String(preset.action)))throw Error('Preset action must be store, recall, clear or random.');
    if(preset.action==='random'){
      if(preset.slot!==undefined||preset.from_clip_id!==undefined)throw Error('Random uses a seed, not a slot or source clip.');
      edited=randomVisualLook(next,edited,number(preset.seed,'random seed',0,0xffffffff));
    }else{
      const slot=VISUAL_LOOK_SLOTS.find(s=>s===preset.slot);if(!slot||preset.seed!==undefined)throw Error('Choose preset A, B or C.');
      if(preset.action!=='recall'&&preset.from_clip_id!==undefined)throw Error('A source clip is only used when recalling a preset.');
      const from=preset.from_clip_id===undefined?edited:next.visuals?.find(v=>v.id===preset.from_clip_id);if(!from)throw Error('Preset source visual not found.');
      edited=preset.action==='store'?storeVisualLook(next,edited,slot):preset.action==='clear'?clearVisualLook(next,edited,slot):recallVisualLook(next,edited,slot,from);
    }
  }
  return visualLookVersion(sourceMotionVersion(visualMotionVersion({ ...next, visuals: next.visuals!.map(v => v.id === edited.id ? edited : v) })));
}
