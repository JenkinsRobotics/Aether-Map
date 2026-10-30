import { expect, it } from 'vitest';
import { emptyShow } from './document';
import { deploymentReadiness } from './deployment-readiness';
it('requires one explicit scene-bound output for each player and rejects ambiguous routes',()=>{
  const show=emptyShow();expect(deploymentReadiness(show,'pi').blockers).toHaveLength(1);
  show.outputs[0]={...show.outputs[0],kind:'edge',deviceId:'pi'};
  expect(deploymentReadiness(show,'pi').blockers).toEqual([]);
  show.outputs.push({...show.outputs[0],id:'other'});
  expect(deploymentReadiness(show,'pi').blockers[0]).toMatch(/multiple outputs/);
  show.outputs.pop();show.outputs[0].sceneId=undefined;
  expect(deploymentReadiness(show,'pi').blockers).toContain('Choose a scene for this output.');
});
it('rejects suppressed scenes and closed schedules, while reporting a deliberate blackout',()=>{
  const show=emptyShow();show.outputs[0]={...show.outputs[0],kind:'edge',deviceId:'pi',schedule:{fromMinutes:600,toMinutes:600}};
  show.scenes[0].suppressed=true;show.output.blackout=true;
  expect(deploymentReadiness(show,'pi').blockers).toHaveLength(2);
  expect(deploymentReadiness(show,'pi').notes[0]).toMatch(/Blackout/);
});
it('warns when a deployed show will not repeat on its own',()=>{
  const show=emptyShow();show.outputs[0]={...show.outputs[0],kind:'edge',deviceId:'pi'};
  expect(deploymentReadiness(show,'pi').notes.join()).not.toMatch(/Loop/);
  show.playback={mode:'once'};
  expect(deploymentReadiness(show,'pi').notes.join()).toMatch(/plays once.*Loop/i);
  show.playback={mode:'continuous'};
  expect(deploymentReadiness(show,'pi').notes.join()).toMatch(/goes dark.*Loop/i);
});
it('warns that a low-power player draws generators black, including agent-made visuals', async () => {
  const { runCommand } = await import('./automation/commands');
  const { parseShow, serializeShow } = await import('./show-file');
  const base = emptyShow(); base.outputs[0] = { ...base.outputs[0], kind: 'edge', deviceId: 'pi' };
  const text = runCommand('map.visual.create', new TextDecoder().decode(serializeShow(base)),
    { scene_id: base.outputs[0].sceneId!, name: 'Swirl', source_json: '{"kind":"gallery","id":"swirl:2"}' }).content!;
  const show = parseShow(text);
  const pi2 = { model: 'Raspberry Pi 2 Model B Rev 1.1' } as never, pi5 = { model: 'Raspberry Pi 5 Model B Rev 1.0' } as never;
  expect(deploymentReadiness(show, 'pi', pi2).notes.join()).toMatch(/Raspberry Pi 2.*cannot draw generators/);
  expect(deploymentReadiness(show, 'pi', pi5).notes.join()).not.toMatch(/generators/);
  expect(deploymentReadiness(show, 'pi').notes.join()).not.toMatch(/generators/);
});
