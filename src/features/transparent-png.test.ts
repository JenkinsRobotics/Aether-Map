import { expect, test } from "vitest";
import { Blob } from "node:buffer";
import { validateTransparentPng } from "./transparent-png";

const sig = [137, 80, 78, 71, 13, 10, 26, 10];
function chunk(type: string, payload: number[]) {
  const result = new Uint8Array(12 + payload.length);
  new DataView(result.buffer).setUint32(0, payload.length);
  for (let i = 0; i < 4; i++) result[4 + i] = type.charCodeAt(i);
  result.set(payload, 8);
  return result;
}
function image(colourType: number, colourKey = false): File {
  const header = chunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, colourType, 0, 0, 0]);
  return new Blob([new Uint8Array(sig), header,
    ...(colourKey ? [chunk("tRNS", [0, 0])] : []), chunk("IDAT", [0]), chunk("IEND", [])]) as unknown as File;
}

test("Transparent PNG accepts alpha or a palette transparency key and rejects opaque files", async () => {
  await expect(validateTransparentPng(image(6))).resolves.toBeUndefined();
  await expect(validateTransparentPng(image(4))).resolves.toBeUndefined();
  await expect(validateTransparentPng(image(3, true))).resolves.toBeUndefined();
  await expect(validateTransparentPng(image(2))).rejects.toThrow("PNG with transparency");
  await expect(validateTransparentPng(new Blob(["video"]) as unknown as File)).rejects.toThrow("PNG image");
});
