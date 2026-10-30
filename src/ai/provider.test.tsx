// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import type { AgentInteraction, AgentService } from '@aether/ui/AgentServices';
import { mapAgentTools } from '../automation/live-commands';
import { useMapProvider } from './provider';

it('gates image tools on the actual host contract without replacing the active transport or edit executor',async()=>{
  const interaction:AgentInteraction={contextKey:'show',tools:mapAgentTools,execute:async()=>({changed:true})};
  let job:Record<string,unknown>={id:'models',state:'completed'};
  const base:AgentService={call:async<T,>()=>job as T};
  const hook=renderHook(()=>useMapProvider(base,interaction));
  const service=hook.result.current.service;
  expect(hook.result.current.interaction.tools).toHaveLength(23);
  await act(async()=>{await service.call('job');});
  expect(hook.result.current.interaction.tools).toHaveLength(23);
  job={...job,tool_result_format:'images-v1'};
  await act(async()=>{await service.call('job');});
  expect(hook.result.current.interaction.tools).toHaveLength(25);
  expect(hook.result.current.service).toBe(service);
  expect(hook.result.current.interaction.execute).toBe(interaction.execute);
  job={id:'other',state:'completed'};
  await act(async()=>{await service.call('job');});
  expect(hook.result.current.interaction.tools).toHaveLength(23);
});
