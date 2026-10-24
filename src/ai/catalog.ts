import catalog from '../../service/aether_map_service/automation-commands.json';

export const fileArguments = new Set(['app', 'id', 'expected_revision']);
export const mapCommands = catalog.map(item => ({ ...item, inputSchema: { ...item.inputSchema,
  properties: Object.fromEntries(Object.entries(item.inputSchema.properties).filter(([key]) => !fileArguments.has(key))),
  required: item.inputSchema.required.filter(key => !fileArguments.has(key)),
} }));

/** Every runtime validates the same catalog; provider schemas are not authority. */
export function validateCommand(command: string, args: unknown): asserts args is Record<string, unknown> {
  const descriptor = mapCommands.find(item => item.id === command);
  if (!descriptor) throw Error('Unknown Map command.');
  const values = object(args);
  for (const [key, value] of Object.entries(values)) {
    if (fileArguments.has(key)) continue; // The saved host validates its own file authority.
    const field = descriptor.inputSchema.properties[key] as {type:string;minimum?:number;maximum?:number;minLength?:number;maxLength?:number;enum?:unknown[]} | undefined;
    if (!field) throw Error(`Unknown argument: ${key}.`);
    if (field.type === 'string') {
      if (typeof value !== 'string' || value.length < (field.minLength ?? 0) || value.length > (field.maxLength ?? 10000)) throw Error(`Invalid ${key}.`);
    } else if (typeof value !== 'number' || !Number.isFinite(value) || (field.type === 'integer' && !Number.isInteger(value)) || value < (field.minimum ?? -Infinity) || value > (field.maximum ?? Infinity)) throw Error(`Invalid ${key}.`);
    if (field.enum && !field.enum.includes(value)) throw Error(`Invalid ${key}.`);
  }
  for (const key of descriptor.inputSchema.required) if (!Object.hasOwn(values, key)) throw Error(`Missing argument: ${key}.`);
}
export function object(value: unknown, keys?: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Expected an object.');
  if (keys && Object.keys(value).some(key => !keys.includes(key))) throw Error('Unknown object field.');
  return value as Record<string, unknown>;
}
export function jsonObject(value: unknown) {
  if (typeof value !== 'string' || new TextEncoder().encode(value).length > 65536) throw Error('Use JSON of at most 64 KiB.');
  return object(JSON.parse(value));
}
export function number(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw Error(`Invalid ${label}: use ${min} to ${max}.`);
  return value;
}
export function name(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200 || Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw Error('Name must contain 1–200 printable characters.');
  return value.trim();
}
