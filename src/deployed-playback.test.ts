import { expect, it } from 'vitest';
import { deployedElapsedS } from './deployed-playback';
import { emptyShow } from './document';
import { showTime } from './playback';
const at = (day:number,hour:number,minute=0,second=0) => new Date(2026,9,day,hour,minute,second).getTime();
it('waits out closed hours and starts a fresh play-once Main at each daily window',()=>{
  const schedule={fromMinutes:18*60,toMinutes:23*60},boot=at(7,10),show=emptyShow();show.playback.mode='once';show.scenes[0].durationS=60;
  expect(deployedElapsedS(schedule,boot,at(7,17,59))).toBe(0);
  expect(showTime(show,deployedElapsedS(schedule,boot,at(7,18,0,5)))).toBe(5);
  expect(showTime(show,deployedElapsedS(schedule,boot,at(7,19)))).toBe(60);
  expect(showTime(show,deployedElapsedS(schedule,boot,at(8,18,0,3)))).toBe(3);
});
it('starts on boot within a window, preserves overnight timing and checks the opening day',()=>{
  const schedule={fromMinutes:22*60,toMinutes:2*60,days:[5]},boot=at(9,20);
  expect(deployedElapsedS(schedule,boot,at(10,0,30))).toBe(2.5*3600);
  expect(deployedElapsedS(schedule,at(10,0,29),at(10,0,30))).toBe(60);
  expect(deployedElapsedS(schedule,boot,at(10,22,30))).toBe(0);
  expect(deployedElapsedS(undefined,boot,boot+5000)).toBe(5);
});
