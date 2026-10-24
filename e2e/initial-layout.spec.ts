import {expect,test} from '@playwright/test';
import {signIn} from './helpers';

for (const width of [1600,1000]) for (const initial of ['default','saved','collapsed']) test(`refresh preserves ${initial} widths from the first frame at ${width}px`,async({page,baseURL})=>{
  await page.setViewportSize({width,height:900});
  await signIn(page,baseURL!);
  await page.addInitScript(()=>{
    const frames:Array<Record<string,number>>=[];
    (window as unknown as {layoutFrames:typeof frames}).layoutFrames=frames;
    function sample() {
      const cards=Array.from(document.querySelectorAll<HTMLElement>('.map-editor .aui-tabbed-sidebar'));
      if(cards.length) {
        const values:Record<string,number>={};
        for(const c of cards) values[c.getAttribute('aria-label')!]=c.getBoundingClientRect().width;
        frames.push(values);
      }
      if(frames.length<45)requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  await page.goto('/map/index.html?new=show');
  await page.getByRole('button',{name:/^Studio mode:/}).press('ArrowDown');
  await page.getByRole('menuitemradio',{name:'Floating',exact:true}).click();
  if(initial==='saved') await page.evaluate(()=>{
    localStorage.setItem('aether-map.mapping.sidebar-sizes',JSON.stringify({left:{width:300},right:{width:320}}));
    localStorage.setItem('aether-map.mapping.tray.width','560');
  });
  if(initial==='collapsed') {
    for(const card of await page.locator('.map-editor .aui-tabbed-sidebar').all()) {
      const active=card.locator('.aui-tabbed-sidebar-tabs button[aria-pressed="true"]');
      if(await active.count()) await active.click();
    }
  }
  await page.reload();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {layoutFrames:unknown[]}).layoutFrames.length)).toBe(45);
  const frames=await page.evaluate(()=>(window as unknown as {layoutFrames:Array<Record<string,number>>}).layoutFrames);

  for(const key of Object.keys(frames.at(-1)!)) {
    const values=frames.map(f=>f[key]).filter(v=>v!==undefined);
    expect(Math.max(...values)-Math.min(...values),key).toBeLessThan(2);
  }
});
