// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SaveGuard } from './SaveGuard';
afterEach(cleanup);
const actions=()=>({onRecover:vi.fn(),onKeepSaved:vi.fn(),onSignIn:vi.fn(),onRetry:vi.fn(),onCopy:vi.fn(),onDownload:vi.fn()});
it('makes an expired sign-in visible outside the file sidebar and provides recovery actions',()=>{
 const callbacks=actions();render(<SaveGuard {...callbacks} recoveries={[]} state={{phase:'conflict',durable:true,status:401,backedUp:true}}/>);
 expect(screen.getByRole('region',{name:'Save needs attention'})).toBeTruthy();
 expect(screen.getByText(/have not been saved to Studio/)).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Sign in to save'}));expect(callbacks.onSignIn).toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Download unsaved copy'}));expect(callbacks.onDownload).toHaveBeenCalled();
});
it('requires an explicit choice for a persistent draft and keeps the saved show accessible',()=>{
 const callbacks=actions();render(<SaveGuard {...callbacks} state={{phase:'saved',durable:true}} recoveries={[{id:'draft',updated:1,revision:4}]}/>);
 expect(screen.getByRole('dialog',{name:'Unsaved changes found'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Recover changes'}));expect(callbacks.onRecover).toHaveBeenCalledWith('draft');
 fireEvent.click(screen.getByRole('button',{name:'Keep saved version'}));expect(callbacks.onKeepSaved).toHaveBeenCalled();
});
