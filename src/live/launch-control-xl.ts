/** Original Launch Control XL MK1/MK2, current-template LED protocol.
 * https://fael-downloads-prod.focusrite.com/customer/prod/s3fs-public/downloads/launch-control-xl-programmers-reference-guide.pdf
 * Note-On addresses the template's matching note/CC and channel. It never
 * changes templates, resets the desk or requires SysEx permission.
 */
export function launchControlXLPort(name: string): boolean {
  return /launch\s*control\s*xl/i.test(name) && !/\b(hui|daw)\b/i.test(name);
}
export function launchControlXLMessage(control: number, channel: number, value: number | undefined, focused: boolean, off = false): number[] {
  if (!Number.isInteger(control) || control < 0 || control > 127 || !Number.isInteger(channel) || channel < 0 || channel > 15)
    throw Error('Invalid Launch Control XL address.');
  const level = Math.min(3, 1 + Math.floor(Math.max(0, Math.min(1, Number.isFinite(value) ? value! : 0)) * 3));
  // Copy + Clear flags update both buffers; green/amber use documented levels.
  return [0x90 | channel, control, off ? 12 : 12 + 16 * level + (focused ? level : 0)];
}
