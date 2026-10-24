import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from 'vite';
// A product-owned headless build of the exact browser parser/evaluator/commands.
await build({ configFile: false, publicDir: false, ssr: { noExternal: true }, build: {
  ssr: 'src/automation/runner.ts', outDir: 'service/aether_map_service/runtime',
  emptyOutDir: true, minify: false,
  rollupOptions: { output: { entryFileNames: 'runner.mjs' } },
} });

const directory = 'service/aether_map_service/runtime';
const commands = JSON.parse(await readFile('service/aether_map_service/automation-commands.json','utf8'))
  .map(({action, ...descriptor}) => descriptor);
const sha256 = createHash('sha256').update(await readFile(`${directory}/runner.mjs`)).digest('hex');
await writeFile(`${directory}/native-worker.json`, JSON.stringify({
  schema: 1, app: 'map', entry: 'runner.mjs', sha256, commands, services: ['/api/map/project-export'],
}, null, 2) + '\n');

// The local adapter is bundled independently; the native worker stays self-contained.
await build({configFile:false,publicDir:false,ssr:{noExternal:true},build:{
  ssr:'src/ai/cli.ts',outDir:directory,emptyOutDir:false,minify:false,
  rollupOptions:{output:{entryFileNames:'cli.mjs'}},
}});
