// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { VisualGallery } from './VisualGallery';
import { GALLERY_VISUALS, RECENT_VISUALS_KEY } from '../features/visual-gallery';
vi.mock('../features/ShaderMedia',()=>({ShaderMedia:()=> <div data-testid="live-preview"/>}));
vi.mock('../features/ShaderThumbnail',()=>({ShaderThumbnail:()=> <span/>}));
const loadLoop=vi.hoisted(()=>vi.fn());
vi.mock('../features/bundled-loops',async original=>({...await original<object>(),loadBundledLoop:loadLoop}));
vi.mock('../features/LoopPreview',()=>({LoopPreview:({playing}:{playing:boolean})=><div data-testid="video-preview" data-playing={playing}/>}));
afterEach(()=>{cleanup();localStorage.clear();loadLoop.mockReset();});
test('browsing and filtering do not change the show; adding uses the selected editable source',()=>{
 const onChoose=vi.fn(),onClose=vi.fn();
 render(<VisualGallery onChoose={onChoose} onClose={onClose}/>);
 fireEvent.click(screen.getByRole('button',{name:'Eyes'}));
 fireEvent.click(screen.getByRole('button',{name:'Preview Amber eye · Watchful Eye'}));
 expect(onChoose).not.toHaveBeenCalled();
 expect(within(screen.getByRole('complementary',{name:'Selected visual'})).getByRole('heading').textContent).toBe('Amber eye · Watchful Eye');
 fireEvent.click(screen.getByRole('button',{name:'Add to Media Pool'}));
 const chosen=onChoose.mock.calls[0][0], original=GALLERY_VISUALS.find(v=>v.id===chosen.id)!;
 expect(chosen.shader).toEqual(original.shader); expect(chosen.shader).not.toBe(original.shader);
 chosen.shader.colors[0]='#abcdef';expect(original.shader.colors[0]).not.toBe('#abcdef');
 expect(localStorage.getItem(RECENT_VISUALS_KEY)).toContain(chosen.id);expect(onClose).toHaveBeenCalledOnce();
});
test('recent items reopen and an empty search can be cleared',()=>{
 localStorage.setItem(RECENT_VISUALS_KEY,JSON.stringify(['synthwave:0']));
 render(<VisualGallery onChoose={vi.fn()} onClose={vi.fn()}/>);
 expect(screen.getByRole('region',{name:'Recent visuals'})).toBeTruthy();
 fireEvent.change(screen.getByRole('searchbox',{name:'Search visuals'}),{target:{value:'nothing matching'}});
 expect(screen.getByText('No matching visuals')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Show all visuals'}));
 expect(screen.queryByText('No matching visuals')).toBeNull();
});
test('source actions preserve the existing import and generator workflows',()=>{
 const onClose=vi.fn(),onCreate=vi.fn(),onImport=vi.fn();
 render(<VisualGallery onChoose={vi.fn()} onClose={onClose} onCreate={onCreate} onImport={onImport}/>);
 fireEvent.click(screen.getByRole('button',{name:'Solid color'}));expect(onCreate).toHaveBeenCalledWith('colour');
 fireEvent.click(screen.getByRole('button',{name:'Import image or video'}));expect(onImport).toHaveBeenCalledOnce();
 expect(onClose).toHaveBeenCalledTimes(2);
});

test('video loops have real posters, a controllable preview and an awaited ordinary import',async()=>{
 const file=new File(['video'],'Prismatic Flow.mp4',{type:'video/mp4'});loadLoop.mockResolvedValue(file);
 let finish!:(success:boolean)=>void;
 const onChooseLoop=vi.fn(()=>new Promise<boolean>(resolve=>{finish=resolve;})),onClose=vi.fn(),onChoose=vi.fn();
 render(<VisualGallery onChoose={onChoose} onClose={onClose} onChooseLoop={onChooseLoop}/>);
 fireEvent.click(screen.getByRole('button',{name:'Video loops'}));
 const card=screen.getByRole('button',{name:'Preview Prismatic Flow'});
 expect(card.querySelector('img')!.src).toContain('prismatic-flow.jpg');fireEvent.click(card);
 expect(screen.getByTestId('video-preview').getAttribute('data-playing')).toBe('true');
 fireEvent.click(screen.getByRole('button',{name:'Pause preview'}));expect(screen.getByTestId('video-preview').getAttribute('data-playing')).toBe('false');
 expect(onChooseLoop).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Add to Media Pool'}));
 await waitFor(()=>expect(onChooseLoop).toHaveBeenCalledWith(file,expect.objectContaining({id:'prismatic-flow'})));
 expect((screen.getByRole('button',{name:'Importing video…'}) as HTMLButtonElement).disabled).toBe(true);
 expect(onClose).not.toHaveBeenCalled();finish(true);
 await waitFor(()=>expect(onClose).toHaveBeenCalledOnce());
 expect(onChoose).not.toHaveBeenCalled();expect(localStorage.getItem(RECENT_VISUALS_KEY)).toContain('loop:prismatic-flow');
});
test('failed loop imports remain visible and retryable without recording a success',async()=>{
 const onClose=vi.fn(),onChooseLoop=vi.fn().mockResolvedValue(false);loadLoop.mockRejectedValueOnce(Error('Download interrupted'));
 render(<VisualGallery onChoose={vi.fn()} onClose={onClose} onChooseLoop={onChooseLoop}/>);
 fireEvent.click(screen.getByRole('button',{name:'Video loops'}));fireEvent.click(screen.getByRole('button',{name:'Preview Orbital Lights'}));
 fireEvent.click(screen.getByRole('button',{name:'Add to Media Pool'}));
 await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('Download interrupted'));
 expect(onChooseLoop).not.toHaveBeenCalled();expect(onClose).not.toHaveBeenCalled();
 loadLoop.mockResolvedValue(new File(['video'],'test.mp4',{type:'video/mp4'}));
 fireEvent.click(screen.getByRole('button',{name:'Add to Media Pool'}));
 await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('could not be imported'));
 expect(localStorage.getItem(RECENT_VISUALS_KEY)).toBeNull();expect(onClose).not.toHaveBeenCalled();
});
test('shader-only pickers omit videos, including saved recent loop entries',()=>{
 localStorage.setItem(RECENT_VISUALS_KEY,JSON.stringify(['loop:prismatic-flow']));
 render(<VisualGallery onChoose={vi.fn()} onClose={vi.fn()}/>);
 expect(screen.queryByRole('button',{name:'Video loops'})).toBeNull();expect(screen.queryByRole('region',{name:'Recent visuals'})).toBeNull();
});
