/** The dedicated image tool accepts PNGs that can actually carry transparent pixels. */
export async function validateTransparentPng(file: File): Promise<void> {
  const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const png = [137, 80, 78, 71, 13, 10, 26, 10];
  if (signature.length !== 8 || png.some((byte, index) => signature[index] !== byte)) {
    throw new Error("Choose a PNG image for Transparent PNG.");
  }

  let offset = 8;
  let hasHeader = false;
  while (offset + 12 <= file.size) {
    const header = new DataView(await file.slice(offset, offset + 8).arrayBuffer());
    const length = header.getUint32(0);
    const type = String.fromCharCode(...new Uint8Array(header.buffer, 4, 4));
    const next = offset + 12 + length;
    if (next > file.size) break;
    if (!hasHeader) {
      if (type !== "IHDR" || length !== 13) break;
      const colourType = new Uint8Array(await file.slice(offset + 8, offset + 21).arrayBuffer())[9];
      if (colourType === 4 || colourType === 6) return;
      hasHeader = true;
    } else if (type === "tRNS") {
      return; // Palette/true-colour PNG with a transparent colour key.
    } else if (type === "IDAT" || type === "IEND") {
      break;
    }
    offset = next;
  }
  throw new Error("Choose a PNG with transparency for Transparent PNG.");
}
