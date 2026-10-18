import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentInteraction, AgentService } from '@aether/ui/AgentServices';

const imageTools = new Set(['aether_map_mapping_preview', 'aether_map_visual_preview']);
export function providerInteraction(interaction: AgentInteraction, imagesSupported: boolean): AgentInteraction {
  return { ...interaction, tools: interaction.tools.filter(tool => imagesSupported || !imageTools.has(tool.name)) };
}

/** Source preview is usable locally even with an older installed relay. Never
 * advertise image calls to a provider until a real host job declares images-v1.
 * The standard model-list job supplies this before the first normal chat. */
export function useMapProvider(base: AgentService, interaction: AgentInteraction) {
  const [images, setImages] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const service = useMemo<AgentService>(() => ({ async call<T>(action: string, data?: Record<string, unknown>) {
    const result = await base.call<T>(action, data);
    if (alive.current && result && typeof result === 'object' && 'id' in result && 'state' in result)
      setImages('tool_result_format' in result && result.tool_result_format === 'images-v1');
    return result;
  } }), [base]);
  return {service,interaction:providerInteraction(interaction,images)};
}
