import { emptyShow } from './document';
import { serializeShow } from './show-file';

/** Product-owned library creation entry: no editor mounting or persistence. */
export function createDocument(name: string): File {
  const base = name.trim().replace(/\.aethermap$/i, '').trim();
  if (!base) throw new Error('Enter a show name.');
  return new File([new TextDecoder().decode(serializeShow(emptyShow()))], `${base}.aethermap`, { type: 'application/json' });
}
