import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const target = new URL("public/vendor/", root);
const manifest = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
for (const name of ["@mediapipe/tasks-vision", "@paper-design/shaders", "@paper-design/shaders-react"]) {
  const installed = JSON.parse(await readFile(new URL(`node_modules/${name}/package.json`, root), "utf8"));
  if (installed.version !== manifest.dependencies[name]) throw new Error(`Vendor version mismatch for ${name}; run npm ci.`);
}
await mkdir(new URL("mediapipe/", target), { recursive: true });
for (const ext of ["js", "wasm"]) {
  const name = `vision_wasm_module_internal.${ext}`;
  await copyFile(new URL(`node_modules/@mediapipe/tasks-vision/wasm/${name}`, root), new URL(`mediapipe/${name}`, target));
}
for (const name of ["shaders", "shaders-react"]) {
  await mkdir(new URL(`${name}/`, target), { recursive: true });
  for (const notice of ["LICENSE", "NOTICE"]) await copyFile(new URL(`node_modules/@paper-design/${name}/${notice}`, root), new URL(`${name}/${notice}`, target));
}
const MODELS = {
  "pose_landmarker_lite.task": "59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a",
  "hand_landmarker.task": "fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1",
  "face_landmarker.task": "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff",
};
for (const [name, expected] of Object.entries(MODELS)) {
  const model = await readFile(new URL(`mediapipe/${name}`, target));
  const checksum = createHash("sha256").update(model).digest("hex");
  if (checksum !== expected) throw new Error(`${name} checksum mismatch. See public/vendor/README.md.`);
}
console.log("Pinned shader notices, local vision runtime and models verified.");
const ort = JSON.parse(await readFile(new URL('node_modules/onnxruntime-web/package.json', root), 'utf8'));
if (ort.version !== manifest.dependencies['onnxruntime-web']) throw new Error('ONNX runtime version mismatch; run npm ci.');
await mkdir(new URL('segmentation/', target), { recursive: true });
for (const name of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'])
  await copyFile(new URL(`node_modules/onnxruntime-web/dist/${name}`, root), new URL(`segmentation/${name}`, target));
const segmentation = await readFile(new URL('segmentation/u2netp.onnx', target));
if (createHash('sha256').update(segmentation).digest('hex') !== '309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8') throw new Error('Subject model checksum mismatch. See vendor/segmentation/README.md.');
await readFile(new URL('segmentation/ONNX-LICENSE', target));
