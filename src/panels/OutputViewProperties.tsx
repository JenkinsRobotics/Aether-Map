import { AetherIcon, Button, ColorField, FieldRow, NumberField, SelectField, ParameterRow } from '@aether/ui';
import type { MapShow, ShowOutput, SurfaceAppearance } from '../document';
import { outputMappingLook, outputView, type OutputView } from '../output-view';

/** Output calibration lives on the output, not on a selected surface or shader. */
export function OutputViewProperties({ show, output, workspace, onChange }: {
  show: MapShow; output: ShowOutput; workspace: OutputView;
  onChange: (patch: Partial<ShowOutput>) => void;
}) {
  const view = outputView(output, workspace);
  const look = outputMappingLook(show, output);
  const patchLook = (patch: Partial<SurfaceAppearance>) => onChange({ mappingLook: { ...look, ...patch } });
  return <section aria-label="Output view properties">
    <FieldRow label="Output view" help="Follow the workspace, or keep this output on your chosen view. Deployed players use Visualization.">
      <SelectField aria-label="Output view" value={output.view ?? 'workspace'}
        options={[{ value: 'workspace', label: 'Workspace' }, { value: 'mapping', label: 'Mapping grid' }, { value: 'visualization', label: 'Visualization' }]}
        onChange={event => onChange({ view: event.target.value as ShowOutput['view'] })} />
    </FieldRow>
    <p className="map-hint" role="status">Showing: {view === 'mapping' ? 'Mapping grid' : 'Visualization'}{!output.view || output.view === 'workspace' ? ' · follows workspace' : ' · override'}</p>
    {view === 'mapping' ? <section aria-label="Output mapping design">
      <div className="map-section-label">Mapping design</div>
      <FieldRow label="Pattern"><SelectField aria-label="Output mapping pattern" value={look.pattern}
        options={[{ value: 'checker', label: 'Checkerboard' }, { value: 'grid', label: 'Grid' }, { value: 'fill', label: 'Fill' }]}
        onChange={event => patchLook({ pattern: event.target.value as SurfaceAppearance['pattern'] })} /></FieldRow>
      <FieldRow label="Primary colour"><ColorField ariaLabel="Output pattern primary colour" value={look.primary} onChange={primary => patchLook({ primary })} /></FieldRow>
      {look.pattern !== 'fill' && <>
        <FieldRow label="Secondary colour"><ColorField ariaLabel="Output pattern secondary colour" value={look.secondary} onChange={secondary => patchLook({ secondary })} /></FieldRow>
        <FieldRow label="Sections"><NumberField aria-label="Output pattern sections" value={look.sections} min={1} max={64} step={1}
          onValueChange={sections => sections !== null && patchLook({ sections: Math.round(sections) })} /></FieldRow>
      </>}
      <FieldRow label="Border colour"><ColorField ariaLabel="Output pattern border colour" value={look.border} onChange={border => patchLook({ border })} /></FieldRow>
      <ParameterRow label="Opacity" ariaLabel="Output pattern opacity" icon={<AetherIcon name="lighting" />}
        value={Math.round(look.opacity * 100)} min={0} max={100} step={1} unit="%" sliderRange={{ min: 0, max: 100 }}
        onChange={opacity => patchLook({ opacity: opacity / 100 })} />
      <Button disabled={!output.mappingLook} onClick={() => onChange({ mappingLook: undefined })}>
        <AetherIcon name="undo" /> Use show mapping design
      </Button>
    </section> : <p className="map-hint">Projects the linked scene’s visuals and timing. Select a visual to edit its content.</p>}
  </section>;
}
