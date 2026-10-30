import { stdin, stdout } from 'node:process';
import { runCommand } from './commands';
import { projectExport } from './project-export';
// Fixed one-request worker. No paths, modules or commands are chosen by input.
try {
  // A sync read of a pipe fails EAGAIN when the writer is slower than us.
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) chunks.push(chunk);
  const request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (request.service && request.service !== '/api/map/project-export') throw new Error('Unknown Map service.');
  const result = request.service ? { result: projectExport(request.arguments) } : runCommand(request.command, request.content, request.arguments);
  const encoded = JSON.stringify(result);
  if (Buffer.byteLength(encoded) > 8 * 1024 * 1024) throw new Error('Show result exceeds the automation size limit.');
  stdout.write(encoded);
} catch (error) {
  stdout.write(JSON.stringify({ error: error instanceof Error ? error.message : 'Map command failed.' }));
}
