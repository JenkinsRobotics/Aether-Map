import { manualSourceEdit } from '../source-motion';
import { ChromaKeyFields } from '../media/ChromaKeyFields';
import { DrawingFields } from "./DrawingFields";
import { VectorFillFields } from "./VectorFillFields";
import { useRef, useState } from "react";
import { Button, ColorField, FieldRow, NumberField, SelectField, TextField } from "@aether/ui";
import { DEFAULT_TEXT, type MapShow, type Surface } from "../document";
import { DEFAULT_CAMERA, DEFAULT_TRACKER, type TrackerSource } from "./types";
import { newShader, SHADERS } from "./shader-catalog";
import { ShaderFields } from "./ShaderFields";
import { CameraFields } from "./CameraFields";
import { SourceCropFields } from "./SourceCropFields";

export function SourceFields({ surface, show, onPatch, onPickMedia, allowTypeChange = true, showFit = true, showPresets = true }: { showPresets?:boolean; allowTypeChange?: boolean; showFit?: boolean; surface: Surface; show: MapShow; onPatch: (id: string, patch: Partial<Surface>) => void; onPickMedia: () => void }) {
  const s = surface.source, media = show.media.find((m) => m.id === s.mediaId);
  const fontInput = useRef<HTMLInputElement>(null), [fontError, setFontError] = useState("");
  const content = s.web ? "web" : s.cast ? "cast" : s.drawing ? "drawing" : s.tracker ? "tracker" : s.webcam ? "webcam" : s.shader ? "shader" : s.text ? "text" : (s.fill || s.fillGradient) ? "fill" : s.testPattern ? "test" : "media";
  const source = (patch: Partial<Surface["source"]>) => onPatch(surface.id, { source: manualSourceEdit(s, { ...s, ...patch }) });
  const patchText = (patch: Partial<typeof DEFAULT_TEXT>) => source({ text: { ...DEFAULT_TEXT, ...s.text, ...patch } });
  const fileField = <>
    <FieldRow label="File" help={media ? `${media.width}×${media.height}` : undefined}><Button onClick={onPickMedia}>{media ? media.name : "Choose file…"}</Button></FieldRow>
    {show.media.length > 0 && <FieldRow label="Use"><SelectField aria-label="Source asset" value={s.mediaId ?? ""} placeholder="Nothing" options={show.media.filter((m) => !s.shader || m.kind === "image").map((m) => ({ value: m.id, label: m.name }))} onChange={(e) => {
      const m = show.media.find((m) => m.id === e.target.value); source({ mediaId: m?.id ?? null, ...(!s.shader && m ? { rect: [0, 0, m.width, m.height] } : {}) });
    }} /></FieldRow>}
  </>;
  return <>
    {showFit && <FieldRow label="Content placement"><SelectField aria-label="Content placement" value={s.fit ?? 'stretch'}
      options={[{ value: 'stretch', label: 'Stretch to surface' }, { value: 'contain', label: 'Fit · keep whole input' }, { value: 'cover', label: 'Fill · crop to surface' }]}
      onChange={e => source({ fit: e.target.value as Surface['source']['fit'] })} /></FieldRow>}
    {surface.clips.length > 0 && <div className="map-hint">Timeline clips replace this input during their span. Remove those clips to use this input throughout.</div>}
    {allowTypeChange && <FieldRow label="Fill with"><SelectField aria-label="Surface content" value={content} options={[
      { value: "media", label: "Media" }, { value: "drawing", label: "Drawing" }, { value: "fill", label: "Colour" }, { value: "text", label: "Text" },
      { value: "shader", label: "Shader" }, { value: "webcam", label: "Webcam" }, { value: "tracker", label: "Tracker" }, { value: "cast", label: "Cast" }, { value: "web", label: "Web window" }, { value: "test", label: "Test pattern" },
    ]} onChange={(e) => {
      const kind = e.target.value;
      onPatch(surface.id, { source: { mediaId: s.mediaId, rect: s.rect, fit: s.fit,
        ...(kind === "drawing" ? { drawing: { strokes: [] } } : kind === "fill" ? { fill: "#ffffff" } : kind === "text" ? { text: { ...DEFAULT_TEXT } } : kind === "shader" ? { shader: newShader() } : kind === "webcam" ? { webcam: { ...DEFAULT_CAMERA } } : kind === "tracker" ? { tracker: { ...DEFAULT_TRACKER } } : kind === "test" ? { testPattern: "grid" as const } : kind === "cast" ? { cast: true as const } : kind === "web" ? { web: { url: "" } } : {}) } });
    }} /></FieldRow>}
    {s.web && <FieldRow label="Web address" help="Opens on the player in its own window over this surface. Sign in on the player once with a keyboard and mouse.">
      <TextField aria-label="Web address" placeholder="https://www.example.com" value={s.web.url} onChange={(e) => source({ web: { url: e.target.value.trim() } })} /></FieldRow>}
    {s.cast && <div className="map-hint">Shows what you cast to the player with Cast into show in Players. The rest of the show keeps running.</div>}
    {s.drawing && <DrawingFields drawing={s.drawing} onChange={drawing => source({ drawing })} />}
    {content === "fill" && <VectorFillFields source={s} onChange={source} />}
    {s.shader && <><ShaderFields showPresets={showPresets} shader={s.shader} onChange={(shader) => source({ shader })} />{SHADERS.find((p) => p.id === s.shader?.preset)?.image && fileField}</>}
    {(s.webcam || s.tracker) && <CameraFields source={s.tracker ?? s.webcam!} tracker={s.tracker} onChange={(camera) => {
      const h = camera.aspect === "4:3" ? 960 : camera.aspect === "1:1" ? 1280 : 720;
      source({ ...(s.tracker ? { tracker: camera as TrackerSource } : { webcam: camera }), rect: [0, 0, 1280, h] });
    }} />}
    {s.text && <>
      <FieldRow label="Text"><textarea className="map-feature-text" aria-label="Text content" value={s.text.text} onChange={(e) => patchText({ text: e.target.value })} /></FieldRow>
      <FieldRow label="Font"><SelectField aria-label="Font family" value={s.text.fontFamily ?? "sans-serif"} options={[{ value: "sans-serif", label: "System" }, { value: "serif", label: "Serif" }, { value: "monospace", label: "Monospace" }, ...(s.text.fontData ? [{ value: s.text.fontName ?? s.text.fontFamily!, label: "Imported font" }] : [])]} onChange={(e) => patchText({ fontFamily: e.target.value, ...(s.text?.fontData ? { fontName: s.text.fontName ?? s.text.fontFamily } : {}) })} /></FieldRow>
      <Button onClick={() => fontInput.current?.click()}>Import font…</Button>
      <input hidden ref={fontInput} type="file" accept=".woff,.woff2,.ttf,.otf" aria-label="Import font" onChange={async (e) => {
        const file = e.target.files?.[0]; if (!file) return;
        if (file.size > 2000000) { setFontError("Choose a font smaller than 2 MB."); return; }
        const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
        const family = `MapFont${Date.now()}`;
        try { await new FontFace(family, `url(${data})`).load(); patchText({ fontData: data, fontFamily: family, fontName: family }); setFontError(""); }
        catch { setFontError("That file could not be loaded as a font."); }
      }} />
      {fontError && <div className="map-error">{fontError}</div>}
      <FieldRow label="Weight"><SelectField aria-label="Font weight" value={String(s.text.fontWeight ?? 400)} options={[{ value: "300", label: "Light" }, { value: "400", label: "Regular" }, { value: "500", label: "Medium" }, { value: "600", label: "Semibold" }, { value: "700", label: "Bold" }, { value: "900", label: "Black" }]} onChange={(e) => patchText({ fontWeight: Number(e.target.value) })} /></FieldRow>
      <Button aria-pressed={Boolean(s.text.italic)} onClick={() => patchText({ italic: !s.text!.italic })}>Italic</Button>
      {([['sizePx', 'Size', 8, 1], ['lineHeight', 'Line height', .1, .1], ['letterSpacingPx', 'Letter spacing', -50, 1]] as const).map(([key, label, min, step]) => <FieldRow key={key} label={label}><NumberField aria-label={label} value={s.text![key] ?? (key === "lineHeight" ? 1.2 : 0)} min={min} step={step} unit={key === "lineHeight" ? undefined : "px"} onValueChange={(v) => v !== null && patchText({ [key]: v })} /></FieldRow>)}
      <FieldRow label="Colour"><ColorField ariaLabel="Text colour" value={s.text.color} onChange={(color) => patchText({ color })} /></FieldRow>
      <FieldRow label="Background"><TextField aria-label="Text background" value={s.text.background} onChange={(e) => patchText({ background: e.target.value })} /></FieldRow>
      <FieldRow label="Align"><SelectField aria-label="Text alignment" value={s.text.align} options={[{ value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }, { value: "justify", label: "Justify" }]} onChange={(e) => patchText({ align: e.target.value as typeof DEFAULT_TEXT.align })} /></FieldRow>
    </>}
    {s.testPattern && <SelectField aria-label="Test pattern" value={s.testPattern} options={[{ value: "grid", label: "Grid" }, { value: "bars", label: "Colour bars" }]} onChange={(e) => source({ testPattern: e.target.value as "grid" | "bars" })} />}
    {content === "media" && <>{fileField}{media && media.kind !== "audio" && <ChromaKeyFields value={s.chromaKey} onChange={chromaKey => source({ chromaKey })} />}{media && <SourceCropFields rect={s.rect} media={media} onChange={(rect) => source({ rect })} />}</>}
  </>;
}
