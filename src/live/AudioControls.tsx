import { useEffect, useState } from 'react';
import { AetherIcon, Button, FieldRow, ParameterRow, SelectField } from '@aether/ui';
import './AudioControls.css';
import { configureAudio, selectAudioDevice, selectedAudioDevice, startAudio, stopAudio, useAudio } from './audio';

export function AudioControls({ expanded = false }: { expanded?: boolean }) {
  const audio = useAudio();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState(selectedAudioDevice);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const items = await navigator.mediaDevices?.enumerateDevices?.();
        if (active) setDevices((items ?? []).filter(item => item.kind === 'audioinput'));
      } catch { /* Device discovery can be unavailable; system-default capture still works. */ }
    };
    refresh(); navigator.mediaDevices?.addEventListener?.('devicechange', refresh);
    return () => { active = false; navigator.mediaDevices?.removeEventListener?.('devicechange', refresh); };
  }, [audio.listening]);
  return <details open={expanded || undefined}><summary>Configure audio</summary>
    <FieldRow label="Audio input"><SelectField aria-label="Audio input device" value={deviceId}
      options={[{ value: '', label: 'System default' }, ...devices.filter(device => device.deviceId && device.deviceId !== 'default').map((device, index) => ({ value: device.deviceId, label: device.label || `Input ${index + 1}` }))]}
      onChange={event => {
        const id = event.target.value; setDeviceId(id); selectAudioDevice(id);
        if (audio.listening) { stopAudio(); void startAudio(id); }
      }} /></FieldRow>
    <Button aria-pressed={audio.listening} onClick={() => audio.listening ? stopAudio() : void startAudio()}>{audio.listening ? 'Stop microphone' : 'Start microphone'}</Button>
    <p className="map-hint" role="status">{audio.status}</p>
    <ParameterRow label="Sensitivity" ariaLabel="Audio sensitivity" icon={<AetherIcon name="audio" />} value={audio.settings.sensitivity}
      min={.1} max={10} step={.1} unit="×" sliderRange={{ min: .1, max: 10 }} onChange={sensitivity => configureAudio({ sensitivity })} />
    <ParameterRow label="Smoothing" ariaLabel="Audio smoothing" icon={<AetherIcon name="slider" />} value={audio.settings.smoothing}
      min={0} max={1} step={.05} sliderRange={{ min: 0, max: 1 }} onChange={smoothing => configureAudio({ smoothing })} />
    {(['low', 'mid', 'high', 'level'] as const).map((band, index) => <FieldRow key={band} label={['Bass', 'Middle', 'Treble', 'Volume'][index]}>
      <meter className="map-audio-meter" aria-label={`${band} audio level`} min={0} max={1} value={audio.levels[band]} />
    </FieldRow>)}
  </details>;
}
