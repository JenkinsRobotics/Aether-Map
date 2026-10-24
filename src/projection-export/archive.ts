/** Uncompressed ZIP for already-compressed PNGs and small editable templates.
 * No dependencies, timestamps, user paths, or remote upload. ZIP32 is deliberately bounded. */
export async function projectionZip(files: { name: string; data: Blob | string }[]): Promise<Blob> {
  const encoder = new TextEncoder(), parts: BlobPart[] = [], directory: BlobPart[] = [];
  let offset = 0, directorySize = 0;
  if (files.length > 1000) throw Error('Export fewer than 1000 files at a time.');
  for (const file of files) {
    if (file.name.startsWith('/') || file.name.split('/').some(s => s === '..') || file.name.includes('\\')) throw Error('Invalid export filename.');
    const name = encoder.encode(file.name), body = typeof file.data === 'string' ? encoder.encode(file.data) : new Uint8Array(await file.data.arrayBuffer());
    if (offset + body.length > 256 * 1024 * 1024) throw Error('Projection package exceeds 256 MB. Export a smaller selection.');
    let crc = 0xffffffff;
    for (const byte of body) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = new Uint8Array(30), l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x800, true);
    l.setUint16(12, 33, true); l.setUint32(14, crc, true); l.setUint32(18, body.length, true); l.setUint32(22, body.length, true); l.setUint16(26, name.length, true);
    parts.push(local, name, body);
    const central = new Uint8Array(46), c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true); c.setUint16(14, 33, true);
    c.setUint32(16, crc, true); c.setUint32(20, body.length, true); c.setUint32(24, body.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
    directory.push(central, name); directorySize += central.length + name.length;
    offset += local.length + name.length + body.length;
  }
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, directorySize, true); e.setUint32(16, offset, true);
  return new Blob([...parts, ...directory, end], { type: 'application/zip' });
}
export function downloadProjection(data: Blob | string, name: string, type = 'image/svg+xml') {
  const url = URL.createObjectURL(typeof data === 'string' ? new Blob([data], { type }) : data);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
