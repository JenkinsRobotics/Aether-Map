import { expect, test } from 'vitest';
import { createDocument } from './create-document';
import { parseShow } from './show-file';

test('a library-created show opens through the canonical parser with independent initial objects', async () => {
  const file = createDocument('  Gallery 日本語  ');
  expect(file.name).toBe('Gallery 日本語.aethermap');
  const show = parseShow(await file.text());
  expect(show.scenes).toHaveLength(1);
  expect(show.scenes[0].surfaces).toHaveLength(0);
  expect(show.outputs[0].sceneId).toBe(show.activeSceneId);
  const other = parseShow(await createDocument('Other').text());
  expect(other.activeSceneId).not.toBe(show.activeSceneId);
});
test('the product extension is added once and an empty name is rejected', () => {
  expect(createDocument('Gallery.AETHERMAP').name).toBe('Gallery.aethermap');
  expect(() => createDocument(' ')).toThrow('Enter a show name.');
});
