import { AetherIcon, IconButton, MenuButton, ToolIcon } from '@aether/ui';
import type { MaskTool } from '../mask/tools';
import type { CompoundShape } from '../features/shape-groups';
import './MappingTools.css';

/** Geometry commands stay with Mapping's layer collection. */
export function MappingTools({tool,onTool,cutout,onCutout,onMask,onCompound,onBackdrop,onPng,onEdit,onDelete,canEdit,canDelete}: {
  tool:MaskTool;onTool:(tool:MaskTool)=>void;cutout:boolean;onCutout:()=>void;
  onMask:()=>void;onCompound:(shape:CompoundShape)=>void;onBackdrop:()=>void;onPng:()=>void;
  onEdit:()=>void;onDelete:()=>void;canEdit:boolean;canDelete:boolean;
}) {
  const drawing = [
    ['select','select','Select','V'],['node','node-select','Node','A'],
    ['pen','pen','Pen','P'],['rect','rectangle','Rectangle','M'],
    ['ellipse','ellipse','Ellipse','E'],['polygon','polygon','Polygon','G'],
    ['freehand','freehand','Freehand','N'],
  ] as const;
  return <section className="map-mapping-tools" aria-label="Map tools">
    <div className="map-mapping-tool-row" role="toolbar" aria-label="Draw surfaces">
      {drawing.map(([id,icon,label,key])=><IconButton key={id} appearance="plain" label={label} title={`${label} · ${key}`} aria-pressed={tool===id} onClick={()=>onTool(id)}>
        {icon==='node-select'?<AetherIcon name={icon}/>:<ToolIcon name={icon}/>}</IconButton>)}
      <MenuButton label="More shapes" items={[
        {id:'square',label:'Square',icon:<ToolIcon name="rectangle"/>},
        {id:'circle',label:'Circle',icon:<ToolIcon name="ellipse"/>},
        {id:'box',label:'Box',icon:<ToolIcon name="map-box"/>},
      ]} onSelect={id=>id==='cube'||id==='box'?onCompound(id):onTool(id as MaskTool)}><AetherIcon name="plus"/></MenuButton>
    </div>
    <div className="map-mapping-tool-row" role="toolbar" aria-label="Mapping actions">
      <IconButton appearance="plain" label="Cube" onClick={()=>onCompound('cube')}><ToolIcon name="map-cube"/></IconButton>
      <IconButton appearance="plain" label="Mask" onClick={onMask}><ToolIcon name="mask"/></IconButton>
      <IconButton appearance="plain" label="Cutout" aria-pressed={cutout} onClick={onCutout}><AetherIcon name="scissors"/></IconButton>
      <IconButton appearance="plain" label="Import backdrop" onClick={onBackdrop}><ToolIcon name="backdrop"/></IconButton>
      <IconButton appearance="plain" label="Transparent PNG" onClick={onPng}><ToolIcon name="transparent-png"/></IconButton>
      <IconButton appearance="plain" label="Edit feature" disabled={!canEdit} onClick={onEdit}><AetherIcon name="settings"/></IconButton>
      <IconButton appearance="plain" label="Delete" disabled={!canDelete} onClick={onDelete}><AetherIcon name="delete"/></IconButton>
    </div>
  </section>;
}
