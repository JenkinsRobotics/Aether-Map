import { expect, test } from 'vitest';
import { emptyShow } from './document';
import { outputMappingLook, outputView } from './output-view';
import { parseShow, serializeShow } from './show-file';

test('outputs follow the workspace unless individually overridden; deployment stays visual', () => {
  const output = emptyShow().outputs[0];
  for (const workspace of ['mapping', 'visualization'] as const) {
    expect(outputView(output, workspace)).toBe(workspace);
    expect(outputView({ ...output, view: 'workspace' }, workspace)).toBe(workspace);
    for (const view of ['mapping', 'visualization'] as const) {
      expect(outputView({ ...output, view }, workspace)).toBe(view);
      expect(outputView({ ...output, view }, workspace, false)).toBe('visualization');
    }
  }
});

test('view and mapping design overrides roundtrip independently from other outputs', () => {
  const show = emptyShow(), output = show.outputs[0];
  show.outputs.push({ ...output, id: 'other', name: 'Output 2' });
  output.view = 'mapping';
  output.mappingLook = { ...outputMappingLook(show, output), pattern: 'grid', sections: 8, opacity: .45 };
  const restored = parseShow(serializeShow(show));
  expect(restored).toEqual(show);
  expect(outputMappingLook(restored, restored.outputs[0]).sections).toBe(8);
  expect(outputMappingLook(restored, restored.outputs[1])).toEqual(show.surfaceLook!.external);
  expect(outputView(restored.outputs[1], 'visualization')).toBe('visualization');
});

test('invalid overrides fall back and pattern fields are bounded on load', () => {
  const show = emptyShow();
  Object.assign(show.outputs[0], { view: 'anything', mappingLook: { pattern: 'unknown', sections: 999, opacity: -4 } });
  const restored = parseShow(JSON.stringify(show));
  expect(restored.outputs[0].view).toBeUndefined();
  expect(restored.outputs[0].mappingLook).toMatchObject({ pattern: 'checker', sections: 64, opacity: 0 });
});
