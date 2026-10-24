import { describe, expect, it } from 'vitest';
import { projectExport } from './project-export';
const surface = { name: '<script>alert(1)</script>', corners: [[0,0],[100,0],[100,90],[0,90]], mask: [[0,0],[1,0],[0,1]] };
const run = (name = 'Example.aethermap', extra = {}) => projectExport({ name, content: JSON.stringify({ output: {width: 1920, height: 1080}, scenes: [{name: '\" onload=\"bad', artboard: {widthPx: 2400,heightPx: 1200}, surfaces: [surface]}], media: [{file:'a.png'},{file:'a.png'}], ...extra }) });
describe('portable saved show exports', () => {
  it('exports all artboards, polygons, masks and unique referenced assets', () => {
    const result = run();
    expect(result.folder).toBe('Example'); expect(result.media).toEqual(['a.png']);
    expect(result.svg).toContain('viewBox="0 0 2400 1200"');
    expect(result.svg).toContain('stroke-dasharray="8 6"');
    expect(result.readme).toContain('2400x1200 px, 1 surface(s)');
  });
  it('escapes scene/surface text and never uses names as SVG attributes', () => {
    const result = run('<script>.aethermap');
    expect(result.svg).not.toContain('<script>');
    expect(result.svg).toContain('&lt;script&gt;');
    expect(result.svg).toContain('id="scene-0"');
    expect(result.svg).not.toContain('id="\"');
  });
  it('replaces invalid XML controls and Windows reserved folder names', () => {
    expect(run('CON.aethermap').folder).toBe('Show-CON');
    const svg = run('name\u0000\uD800').svg;
    expect(svg).not.toContain('\u0000'); expect(svg).toContain('\uFFFD');
  });
  it.each(['..', '.', '  ', '../bad\\name\r\n".aethermap'])('keeps %s in one safe path component', name => {
    const folder = run(name).folder;
    expect(folder).not.toMatch(/^[ .]|[ .]$|[\/\\\r\n"]/); expect(folder.length).toBeGreaterThan(0);
  });
  it.each([{scenes: {}}, {media:[{file:'../private.png'}]}, {output:{width:-2}}, {scenes:[{surfaces:[{corners:[[0,0],[1,0],[1,'bad'],[0,1]]}]}]}])('rejects malformed geometry/paths', extra => {
    expect(() => run('show', extra)).toThrow();
  });
});
