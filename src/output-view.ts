import { DEFAULT_SURFACE_LOOK, type MapShow, type ShowOutput } from './document';

export type OutputView = 'mapping' | 'visualization';

/** One view decision shared by the inspector and live renderer. */
export function outputView(output: ShowOutput | undefined, workspace: OutputView, live = true): OutputView {
  if (!live) return 'visualization';
  return output?.view === 'mapping' || output?.view === 'visualization' ? output.view : workspace;
}

export function outputMappingLook(show: MapShow, output: ShowOutput | undefined) {
  return output?.mappingLook ?? (show.surfaceLook ?? DEFAULT_SURFACE_LOOK).external;
}
