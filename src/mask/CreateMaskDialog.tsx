import { useState } from 'react';
import { Button, Dialog } from '@aether/ui';
import { newSurface, type Surface } from '../document';
import { AlphaMaskControls } from './AlphaMaskControls';
export function CreateMaskDialog({ mode, size, onClose, onCreate }: {
  mode: 'text' | 'image' | 'subject'; size: { width: number; height: number }; onClose: () => void; onCreate: (s: Surface) => void;
}) {
  const [surface, setSurface] = useState(() => ({ ...newSurface(size, 0), name: mode === 'text' ? 'Text mask' : 'Image mask' }));
  return <Dialog open title="Create silhouette surface" onClose={onClose}>
    <p className="map-hint">Create a shaped surface now, then apply its visual content in Visualization.</p>
    <AlphaMaskControls surface={surface} initialMode={mode} defaultOpen onPatch={(_, patch) => setSurface(s => ({ ...s, ...patch }))} />
    {surface.alphaMask && <div className="map-alpha-preview" style={{ background: 'var(--aether-color-accent)', height: 180, maskImage: `url("${surface.alphaMask.png}")`, maskSize: 'contain', maskRepeat: 'no-repeat', maskPosition: 'center' }} />}
    <div className="map-feature-buttons"><Button onClick={onClose}>Cancel</Button><Button primary disabled={!surface.alphaMask} onClick={() => onCreate(surface)}>Create surface</Button></div>
  </Dialog>;
}
