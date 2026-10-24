// @vitest-environment jsdom
import { cleanup,fireEvent,render,screen,within } from '@testing-library/react';
import { afterEach,beforeEach,expect,test,vi } from 'vitest';
import App from './App';
import { installPointerEvents } from './test-pointer';
vi.mock('./features/ShaderMedia',()=>({ShaderMedia:()=> <span/>}));
vi.mock('./features/ShaderThumbnail',()=>({ShaderThumbnail:()=> <span/>}));
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();localStorage.clear();});
beforeEach(()=>{
 localStorage.clear();installPointerEvents();
 vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});
 vi.stubGlobal('BroadcastChannel',class{onmessage=null;postMessage(){}close(){}});
 window.matchMedia??=(()=>({matches:false,addEventListener(){},removeEventListener(){}})) as unknown as typeof window.matchMedia;
});
const colors=()=>[...document.querySelectorAll<HTMLElement>('[data-vector-fill="solid"]')].map(node=>node.style.background);
const undo=()=>{fireEvent.click(screen.getAllByRole('button',{name:'Document controls'})[0]);fireEvent.click(screen.getAllByRole('menuitem',{name:/^Undo/})[0]);};
test('actual app shares full presets across Simple, Advanced and Performance with separate rapid Undo steps',()=>{
 render(<App/>);fireEvent.click(screen.getByRole('button',{name:/Workspace:/}));fireEvent.click(screen.getByRole('menuitemradio',{name:'Scene'}));
 fireEvent.click(screen.getByRole('button',{name:'Browse visual gallery'}));fireEvent.click(screen.getByRole('button',{name:'Solid color'}));
 const original=colors();expect(original.length).toBeGreaterThan(0);
 fireEvent.click(screen.getByRole('button',{name:'Store preset A'}));fireEvent.click(screen.getByRole('button',{name:'Random'}));const randomized=colors();expect(randomized).not.toEqual(original);
 fireEvent.click(screen.getByRole('button',{name:'Recall preset A'}));expect(colors()).toEqual(original);
 undo();expect(colors()).toEqual(randomized);
 undo();expect(colors()).toEqual(original);expect(screen.getByRole('button',{name:'Recall preset A'}).matches(':disabled')).toBe(false);
 fireEvent.click(screen.getByRole('button',{name:'Advanced editor'}));
 fireEvent.click(screen.getByRole('button',{name:'Random'}));const advanced=colors();fireEvent.click(screen.getByRole('button',{name:'Recall preset A'}));
 undo();expect(colors()).toEqual(advanced);
 fireEvent.click(screen.getByRole('button',{name:'Performance'}));const performance=screen.getByRole('dialog',{name:'Performance'});
 expect(within(performance).getAllByRole('button',{name:'Recall preset A'})).toHaveLength(1);
 fireEvent.click(within(performance).getByRole('button',{name:'Recall preset A'}));expect(colors().every(color=>original.includes(color))).toBe(true);
 fireEvent.click(within(performance).getByRole('button',{name:'Undo'}));expect(colors().every(color=>advanced.includes(color))).toBe(true);
 fireEvent.click(within(performance).getByRole('button',{name:'Close'}));fireEvent.click(screen.getByRole('button',{name:'Switch to simple editor'}));
 expect(screen.getByRole('button',{name:'Recall preset A'}).matches(':disabled')).toBe(false);
},15000);
