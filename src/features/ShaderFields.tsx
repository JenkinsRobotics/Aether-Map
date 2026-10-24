import { ShaderAnimationFields } from './ShaderAnimationFields';
import { ShaderPresetFields } from "./ShaderPresetFields";
import { useRef, useState } from 'react';
import { modulationLabel, parameterSliderRange, parameterStep } from './shader-parameter-controls';
import { ModulationFields } from "./ModulationFields";
import { AudioResponseFields } from "./AudioResponseFields";
import { AetherIcon, Button, ColorField, FieldRow, InspectorSection, IconButton, MenuButton, SelectField, ParameterRow } from "@aether/ui";
import { newShader, parameterIcon, parameterLabel, shaderOptions, SHADER_SECTIONS, SHADERS } from "./shader-catalog";
import { DEFAULT_MODULATION, DEFAULT_SHADER_TIME, type ShaderSource } from "./types";
import { VisualGallery } from '../panels/VisualGallery';
import { startMidi, stopMidi, useMidi } from "../live/midi";

/** Placement and world size: the effect's frame, not the effect. */
const SIZING = ["fit", "scale", "rotation", "originX", "originY", "offsetX", "offsetY", "worldWidth", "worldHeight"];
/** Motion lives in its own section, so it is not one number among forty. */
const TIMING = ["speed"];

export function ShaderFields({ shader, onChange, showPresets=true }: { showPresets?:boolean; shader: ShaderSource; onChange: (shader: ShaderSource) => void }) {
  const [gallery, setGallery] = useState(false);
  const modulationEditors = useRef<Record<string, HTMLDivElement | null>>({});
  const patch = (key: string, value: string | number | boolean) => onChange({ ...shader, parameters: { ...shader.parameters, [key]: value } });
  const preset = SHADERS.find((s) => s.id === shader.preset) ?? SHADERS[0];
  const defaults = newShader(shader.preset);
  const parameters = { ...defaults.parameters, ...shader.parameters };
  const time = { ...DEFAULT_SHADER_TIME, ...shader.time };
  const setTime = (over: Partial<typeof time>) => onChange({ ...shader, time: { ...time, ...over } });
  const numeric = Object.keys(parameters).filter((key) => typeof parameters[key] === "number");

  /** One control, labelled and icon-led, as a cell of the properties grid. */
  const field = (key: string) => {
    const value = parameters[key], label = parameterLabel(key), options = shaderOptions(shader.preset, key);
    if (value === undefined) return null;
    const moving = Boolean(shader.modulation?.[key]);
    if (typeof value === 'number' && !options) {
      const assignment = shader.modulation?.[key];
      return <div className="map-shader-parameter" key={key}><ParameterRow label={key === 'speed' ? 'Speed' : label} ariaLabel={label}
        icon={<AetherIcon name={parameterIcon(key) as 'slider'} />} value={value}
        step={parameterStep(key,shader.preset)}
        min={/angle|rotation|offset|shift|bias/i.test(key) ? -1000 : 0}
        sliderRange={parameterSliderRange(key,shader.preset)} onChange={next => patch(key, next)}
        modulation={assignment ? { label: modulationLabel(assignment), range: assignment.range,
          onEdit: () => { const editor = modulationEditors.current[key]; editor?.scrollIntoView({ block: 'nearest' }); editor?.querySelector<HTMLSelectElement>('select')?.focus(); } } : undefined} /></div>;
    }
    return (
      <FieldRow label={`${label}${moving ? " ·" : ""}`} htmlFor={`shader-${key}`} key={key}>
        {options ? (
          <SelectField id={`shader-${key}`} aria-label={label} value={String(value)}
            options={options.map((v) => ({ value: v, label: v }))} onChange={(e) => patch(key, e.target.value)} />
        ) : typeof value === "boolean" ? (
          <Button aria-pressed={value} onClick={() => patch(key, !value)}>{value ? "On" : "Off"}</Button>
        ) : (
          <ColorField ariaLabel={label} value={String(value)} onChange={(v) => patch(key, v)} />
        )}
      </FieldRow>
    );
  };

  const modulated = Object.keys(shader.modulation ?? {});
  const midi = useMidi();
  return <>
    {gallery && <VisualGallery onClose={() => setGallery(false)} actionLabel="Use this visual" onChoose={visual => onChange({ ...visual.shader, looks: shader.looks })} />}
    <Button onClick={() => setGallery(true)}>Browse visual gallery</Button>
    <FieldRow label="Shader">
      <MenuButton className="map-shader-picker" label="Shader effect" placement="bottom-start"
        items={SHADERS.map((entry) => ({
          id: entry.id, label: entry.label, kind: "radio" as const, checked: entry.id === shader.preset,
          heading: SHADER_SECTIONS[entry.id as keyof typeof SHADER_SECTIONS],
          // The icon says "this one needs a picture"; the generative ones carry none.
          icon: entry.image ? <AetherIcon name="image" /> : undefined,
        }))}
        onSelect={(id) => onChange({ ...newShader(id), looks: shader.looks })}>
        <span>{preset.label}</span>
        {preset.image ? <AetherIcon name="image" width={14} height={14} /> : null}
      </MenuButton>
    </FieldRow>
    {showPresets&&<ShaderPresetFields shader={shader} onChange={onChange} />}
    <FieldRow label="Variation">
      <SelectField aria-label="Shader variation" value="" placeholder="Choose…"
        options={preset.presets.map((p, i) => ({ value: String(i), label: p.name }))}
        onChange={(e) => onChange({ ...newShader(shader.preset, Number(e.target.value)), time: shader.time, modulation: shader.modulation, animation: shader.animation, looks: shader.looks })} />
    </FieldRow>


    <InspectorSection title="Appearance" actions={
      <IconButton label="Reset to this effect's defaults"
        onClick={() => onChange({ ...defaults, time: shader.time, modulation: shader.modulation, animation: shader.animation, looks: shader.looks })}>
        <AetherIcon name="undo" />
      </IconButton>}>

    {shader.colors.map((color, i) => <FieldRow key={i} label={`Color ${i + 1}`}>
      <ColorField ariaLabel={`Gradient colour ${i + 1}`} value={color}
        onChange={v => onChange({ ...shader, colors: shader.colors.map((c, n) => n === i ? v : c) })} />
    </FieldRow>)}

    <div className="map-shader-grid">
      {Object.keys(parameters).filter((key) => !SIZING.includes(key) && !TIMING.includes(key)).map(field)}
    </div>

    </InspectorSection>
    <InspectorSection title="Motion">
    <div className="map-shader-grid">
      {field("speed")}
      <div className="map-shader-parameter"><ParameterRow label="Time offset" icon={<AetherIcon name="mate" />}
        value={time.offsetS} unit="s" step={.25} min={-3600} onChange={offsetS => setTime({ offsetS })} /></div>
      <div className="map-shader-parameter"><ParameterRow label="Loop every" icon={<AetherIcon name="history" />}
        value={time.loopS} unit="s" step={.5} min={0} onChange={loopS => setTime({ loopS })} /></div>
      <FieldRow label="Direction" htmlFor="shader-direction">
        <SelectField id="shader-direction" aria-label="Direction" value={time.direction}
          options={[{ value: "forward", label: "Forward" }, { value: "reverse", label: "Reverse" }, { value: "pingpong", label: "Ping-pong" }]}
          onChange={(e) => setTime({ direction: e.target.value as typeof time.direction })} />
      </FieldRow>
    </div>
    <div className="map-feature-buttons">
      <Button aria-pressed={time.frozen} onClick={() => setTime({ frozen: !time.frozen })}>
        {time.frozen ? "Frozen" : "Freeze"}
      </Button>
      <Button aria-pressed={midi.connected} title={midi.status}
        onClick={() => (midi.connected ? stopMidi() : void startMidi())}>
        {midi.connected ? "MIDI on" : "MIDI off"}
      </Button>
      <MenuButton className="map-shader-animate" label="Animate a parameter" placement="bottom-start"
        items={numeric.map((key) => ({ id: key, label: parameterLabel(key), kind: "checkbox" as const, checked: Boolean(shader.modulation?.[key]) }))}
        onSelect={(key) => {
          const next = { ...shader.modulation };
          if (next[key]) delete next[key]; else next[key] = { ...DEFAULT_MODULATION };
          onChange({ ...shader, modulation: Object.keys(next).length ? next : undefined });
        }}><span>Animate a parameter…</span></MenuButton>
    </div>

    </InspectorSection>
    <ShaderAnimationFields shader={shader} onChange={onChange} />
    <AudioResponseFields shader={shader} onChange={onChange} />

    {modulated.map(key => <div key={key} ref={element => { modulationEditors.current[key] = element; }}><ModulationFields label={parameterLabel(key)} base={Number(parameters[key]) || 0}
      value={shader.modulation![key]} onChange={value => {
        const next = { ...shader.modulation };
        if (value) next[key] = value; else delete next[key];
        onChange({ ...shader, modulation: Object.keys(next).length ? next : undefined });
      }} /></div>)}

    <InspectorSection title="Shader sizing" defaultOpen={false}><div className="map-shader-grid">{SIZING.map(field)}</div></InspectorSection>
  </>;
}
