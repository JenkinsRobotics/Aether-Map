/** A scanned link supplies a code, never an authority, redirect or credential. */
export function pairingRoute(search: string): { requested: boolean; code: string; invalid: boolean } {
  const values = new URLSearchParams(search).getAll('pair');
  const valid = values.length === 1 && /^[0-9]{6}$/.test(values[0]);
  return { requested: values.length > 0, code: valid ? values[0] : '', invalid: values.length > 0 && !valid };
}
export function pairingSignInURL(code: string): string {
  const query = /^[0-9]{6}$/.test(code) ? `?pair=${code}` : '?pair=';
  return `/?next=${encodeURIComponent(`/map/index.html${query}`)}`;
}
