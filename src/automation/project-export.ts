/** Portable Map export semantics. Studio supplies saved bytes and owns file authority. */
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Map show object.');
  return value as ObjectValue;
};
const list = (value: unknown): unknown[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error('Invalid Map show collection.');
  return value;
};
const label = (value: unknown, fallback: string) => typeof value === 'string' ? value : fallback;
const xml = (value: string) => value.replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '\uFFFD').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
const dimension = (value: unknown, fallback: number): number => {
  if (value === undefined || value === null || value === 0) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1_000_000) throw new Error('Invalid artboard size.');
  return Math.max(1, Math.trunc(value));
};
function points(value: unknown[]) {
  return value.map(pair => {
    if (!Array.isArray(pair) || pair.length < 2 || !pair.slice(0, 2).every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e9)) throw new Error('Invalid surface geometry.');
    return `${pair[0]},${pair[1]}`;
  }).join(' ');
}
export function projectExport(argumentsValue: unknown) {
  const args = object(argumentsValue);
  if (typeof args.content !== 'string' || typeof args.name !== 'string' || args.content.length > 6 * 1024 * 1024) throw new Error('Invalid export input.');
  const show = object(JSON.parse(args.content));
  const scenes = list(show.scenes).map(object);
  if (scenes.length > 4096) throw new Error('Too many scenes.');
  // ASCII-only download/folder name is portable and cannot become a path or header.
  let folder = args.name.replace(/\.aethermap$/i, '').replace(/[^a-zA-Z0-9 _.-]/g, '-').replace(/^[ .]+|[ .]+$/g, '').slice(0, 80).replace(/[ .]+$/g, '') || 'Aether Map show';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(folder)) folder = `Show-${folder.slice(0, 75)}`;
  const output = object(show.output ?? {});
  const size = (scene: ObjectValue) => {
    const board = object(scene.artboard ?? {});
    return [dimension(board.widthPx, dimension(output.width, 1920)), dimension(board.heightPx, dimension(output.height, 1080))];
  };
  const sizes = scenes.length ? scenes.map(size) : [size({})];
  const width = Math.max(...sizes.map(s => s[0])), height = Math.max(...sizes.map(s => s[1]));
  const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`, `<title>${xml(args.name)}</title>`, `<rect width="${width}" height="${height}" fill="#000"/>`];
  let count = 0;
  for (const [index, scene] of scenes.entries()) {
    svg.push(`<g id="scene-${index}"><title>${xml(label(scene.name, 'Scene'))}</title>`);
    for (const value of list(scene.surfaces)) {
      if (++count > 16384) throw new Error('Too many surfaces.');
      const surface = object(value), corners = list(surface.corners), mask = list(surface.mask);
      if (corners.length === 4) svg.push(`<polygon points="${points(corners)}" fill="none" stroke="#4c9dff" stroke-width="2"><title>${xml(label(surface.name, 'Surface'))}</title></polygon>`);
      if (mask.length >= 3) svg.push(`<polygon points="${points(mask)}" fill="none" stroke="#e7a843" stroke-width="2" stroke-dasharray="8 6"/>`);
    }
    svg.push('</g>');
  }
  svg.push('</svg>');
  const media = list(show.media);
  if (media.length > 4096) throw new Error('Too many media files.');
  const names = [...new Set(media.map(value => {
    const name = object(value).file;
    if (typeof name !== 'string' || !name || /[\/\\\x00-\x1f]/.test(name) || name === '.' || name === '..') throw new Error('Invalid media filename.');
    return name;
  }))].sort();
  const readme = [args.name, '', 'An Aether Map project bundle.', '',
    '  show.aethermap   the exact saved document — open it in Aether Map',
    '  layout.json      the same document for output playback',
    '  wireframe.svg    surface and mask geometry',
    `  media/           every referenced asset (${names.length})`, '', `Scenes: ${scenes.length}`,
    ...scenes.map(scene => `  - ${label(scene.name, 'Scene')}: ${size(scene).join('x')} px, ${list(scene.surfaces).length} surface(s)`), '', 'Assets:', ...names.map(name => `  - ${name}`), ''].join('\n');
  return { folder, svg: svg.join('\n'), readme, media: names };
}
