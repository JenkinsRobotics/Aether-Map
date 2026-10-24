/** Local-file CLI / MCP adapter. File authority is fixed by the launch command. */
import { readFileSync, writeFileSync, renameSync, unlinkSync, lstatSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { stdin, stdout, argv } from 'node:process';
import { emptyShow } from '../document';
import { serializeShow } from '../show-file';
import { normalizeDocument } from '../normalize-document';
import { runCommand } from '../automation/commands';
import { mapCommands, object } from './catalog';

const options = argv.slice(3), mode = argv[2];
const option = (name: string) => { const at = options.indexOf(name); return at < 0 ? undefined : options[at + 1]; };
const filename = option('--file'), writable = options.includes('--write');
const path = filename ? resolve(filename) : null;
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function read() {
  if (!path) throw Error('Launch with --file /absolute/show.aethermap.');
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4 * 1024 * 1024) throw Error('Choose a regular show file no larger than 4 MiB.');
  return readFileSync(path, 'utf8');
}
function execute(command: string, input: unknown) {
  const args = object(input), { expected_sha256, ...productArgs } = args;
  if (['app','id','expected_revision'].some(key => Object.hasOwn(productArgs,key))) throw Error('Local commands cannot choose Studio file authority.');
  const descriptor = mapCommands.find(c => c.id === command);
  if (!descriptor) throw Error('Unknown command.');
  const content = read(), before = hash(content);
  if (descriptor.writes && (!writable || expected_sha256 !== before)) throw Error('Editing requires --write and the current expected_sha256 returned by inspection.');
  const result = runCommand(command, content, productArgs);
  if (result.content !== undefined) {
    if (hash(read()) !== before) throw Error('The file changed while preparing this command. Inspect again.');
    const bytes = result.content;
    if (Buffer.byteLength(bytes) > 4 * 1024 * 1024) throw Error('Result exceeds 4 MiB.');
    const temp = join(dirname(path!), `.${basename(path!)}.${randomUUID()}.tmp`);
    try { writeFileSync(temp, bytes, { flag: 'wx', mode: 0o600 }); renameSync(temp, path!); }
    finally { try { unlinkSync(temp); } catch { /* Already renamed. */ } }
  }
  return { changed: result.content !== undefined, file_sha256: hash(result.content ?? content), result: result.result };
}
const localTools = mapCommands.filter(c => writable || !c.writes).map(c => ({ name: c.id.replaceAll('.', '_'), description: c.description,
  inputSchema: { ...c.inputSchema, properties: { ...c.inputSchema.properties,
    ...(c.writes ? { expected_sha256: {type:'string',minLength:64,maxLength:64,description:'Current file hash from inspection; refuses stale edits.'} } : {}),
  }, required: [...c.inputSchema.required, ...(c.writes ? ['expected_sha256'] : [])] } }));
function mcp() {
  // This process grants one launch-selected file, never arbitrary paths or IO.
  read();
  const receipts = new Map<string, {request: string; response: unknown}>();
  createInterface({input:stdin,crlfDelay:Infinity}).on('line', line => {
    let id: unknown = null;
    try {
      if (Buffer.byteLength(line) > 262144) throw Error('MCP request exceeds 256 KiB.');
      const request = object(JSON.parse(line));
      if (!Object.hasOwn(request,'id')) return;
      id = request.id;
      const key = JSON.stringify(id), previous = receipts.get(key);
      if (previous) {
        if (previous.request !== line) throw Error('Request ID reused with different arguments.');
        stdout.write(JSON.stringify(previous.response)+'\n'); return;
      }
      let result: unknown;
      switch (request.method) {
        case 'initialize': result = {protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'aether-map',version:'1.0.0'}}; break;
        case 'ping': result = {}; break;
        case 'tools/list': result = {tools:localTools}; break;
        case 'tools/call': {
          const params = object(request.params), tool = localTools.find(t => t.name === params.name);
          if (!tool) throw Error('Tool unavailable in this connection.');
          try { result = {content:[{type:'text',text:JSON.stringify(execute(tool.name.replaceAll('_','.'),params.arguments ?? {}))}]}; }
          catch (error) { result = {isError:true,content:[{type:'text',text:(error as Error).message}]}; }
          break;
        }
        default: throw Error('Unsupported MCP method.');
      }
      const response = {jsonrpc:'2.0',id,result};
      receipts.set(key,{request:line,response}); if(receipts.size>100) receipts.delete(receipts.keys().next().value!);
      stdout.write(JSON.stringify(response)+'\n');
    } catch (error) { stdout.write(JSON.stringify({jsonrpc:'2.0',id,error:{code:-32602,message:(error as Error).message}})+'\n'); }
  });
}
try {
  if (mode === 'mcp') mcp();
  else if (mode === 'catalog') stdout.write(JSON.stringify({tools:localTools})+'\n');
  else if (mode === 'init') {
    if (!path) throw Error('Use --file for the new show. Existing files are never overwritten.');
    const bytes = serializeShow(normalizeDocument(emptyShow()));
    writeFileSync(path,bytes,{flag:'wx',mode:0o600}); stdout.write(JSON.stringify({created:true,file_sha256:hash(bytes)})+'\n');
  } else if (mode === 'inspect') stdout.write(JSON.stringify(execute('map.show.inspect',{}))+'\n');
  else if (mode === 'run') {
    const args = JSON.parse(readFileSync(stdin.fd,'utf8'));
    stdout.write(JSON.stringify(execute(option('--command') ?? '', {...object(args),...(option('--expected-sha256') ? {expected_sha256:option('--expected-sha256')} : {})}))+'\n');
  } else throw Error('Use init, inspect, catalog, run --command map.…, or mcp; --file selects the show; --write permits guarded edits.');
} catch (error) { stdout.write(JSON.stringify({error:(error as Error).message})+'\n'); process.exitCode=1; }
