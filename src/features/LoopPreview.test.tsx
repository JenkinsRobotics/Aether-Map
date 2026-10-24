// @vitest-environment jsdom
import { afterEach,expect,test,vi } from 'vitest';
import { cleanup,render,screen,waitFor } from '@testing-library/react';
import { LoopPreview } from './LoopPreview';
import { BUNDLED_LOOPS } from './bundled-loops';
afterEach(()=>{cleanup();vi.restoreAllMocks();});
test('preview uses the actual video, honors pause and stops on unmount',async()=>{
 const play=vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();
 const pause=vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
 const view=render(<LoopPreview loop={BUNDLED_LOOPS[0]} playing/>);
 const video=screen.getByLabelText('Prismatic Flow video preview') as HTMLVideoElement;
 expect(video.src).toContain('prismatic-flow.mp4');expect(video.poster).toContain('prismatic-flow.jpg');expect(video.loop).toBe(true);expect(video.muted).toBe(true);
 await waitFor(()=>expect(play).toHaveBeenCalledOnce());view.rerender(<LoopPreview loop={BUNDLED_LOOPS[0]} playing={false}/>);
 expect(pause).toHaveBeenCalled();const calls=pause.mock.calls.length;view.unmount();expect(pause.mock.calls.length).toBeGreaterThan(calls);
});
test('a late rejected play request cannot overwrite the state after pausing',async()=>{
 let reject!:(error:Error)=>void;vi.spyOn(HTMLMediaElement.prototype,'play').mockReturnValue(new Promise((_,fail)=>{reject=fail;}));
 vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
 const view=render(<LoopPreview loop={BUNDLED_LOOPS[0]} playing/>);
 view.rerender(<LoopPreview loop={BUNDLED_LOOPS[0]} playing={false}/>);reject(Error('Interrupted by pause'));await Promise.resolve();
 expect(screen.queryByRole('status')).toBeNull();
});
