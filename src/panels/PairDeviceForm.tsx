import { useEffect, useRef, useState } from 'react';
import { Button, FieldRow, TextField } from '@aether/ui';
import { devices } from '../api';
import { pairingSignInURL } from '../pairing-route';

/** The code-entry dialog and QR landing page share the same explicit claim flow. */
export function PairDeviceForm({ initialCode = '', invalidLink = false, onPaired, onCancel, onBusyChange }: {
  initialCode?: string;
  invalidLink?: boolean;
  onPaired: (id: string) => void;
  onCancel?: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [code, setCode] = useState(() => /^[0-9]{6}$/.test(initialCode) ? initialCode : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(invalidLink ? 'This pairing link has an invalid code. Enter the six-digit code shown on the player.' : '');
  const [signIn, setSignIn] = useState(false);
  const pending = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const pair = async () => {
    if (pending.current || !/^[0-9]{6}$/.test(code)) return;
    pending.current = true; setBusy(true); onBusyChange?.(true); setError(''); setSignIn(false);
    try {
      const result = await devices.claim(code);
      if (mounted.current) onPaired(result.device_id);
    } catch (problem) {
      if (mounted.current) {
        setError((problem as Error).message);
        setSignIn((problem as { status?: number }).status === 401);
      }
    } finally {
      pending.current = false;
      if (mounted.current) { setBusy(false); onBusyChange?.(false); }
    }
  };
  return <form className="map-pair-device-form" onSubmit={event => { event.preventDefault(); void pair(); }}>
    <p className="map-dialog-lead">Check that this code matches the player you want to add to your account.</p>
    <FieldRow label="Pairing code">
      <TextField aria-label="Pairing code" autoComplete="one-time-code" disabled={busy} value={code}
        inputMode="numeric" maxLength={6} placeholder="000000" autoFocus
        onChange={event => setCode(event.target.value.replace(/[^0-9]/g, '').slice(0, 6))} />
    </FieldRow>
    {error && <p role="alert" className="map-error">{error}</p>}
    {signIn && <p><a href={pairingSignInURL(code)}>Sign in to pair this player</a></p>}
    <div className="map-device-actions">
      {onCancel && <Button type="button" disabled={busy} onClick={onCancel}>Cancel</Button>}
      <Button type="submit" primary disabled={busy || !/^[0-9]{6}$/.test(code)}>{busy ? 'Pairing…' : 'Pair'}</Button>
    </div>
  </form>;
}
