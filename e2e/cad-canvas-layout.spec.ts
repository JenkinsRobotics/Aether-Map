import { expect, test, type Locator } from '@playwright/test';
import { createIOProject, signIn } from './helpers';

async function settle(shell: Locator) {
  await shell.evaluate(async node => {
    await Promise.all(node.getAnimations({ subtree: true }).filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
  });
}

test('CAD canvas meets docked bars and fills behind floating chrome', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!);
  await page.goto('/cad/index.html?new=part');
  await page.getByRole('button', { name: 'Create Part', exact: true }).click();
  const shell = page.locator('.cad-studio-workspace .aui-shell');
  const viewport = page.getByRole('region', { name: '3D CAD viewport' });
  await expect(viewport).toBeVisible();
  await expect(shell).toHaveAttribute('data-content-presentation', 'canvas');
  for (const width of [1600, 1080]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const mode of ['Docked', 'Floating', 'Canvas']) {
      await page.getByRole('button', { name: /^Studio mode:/ }).press('ArrowDown');
      await page.getByRole('menuitemradio', { name: mode, exact: true }).click();
      await expect(shell).toHaveAttribute('data-layout', mode.toLowerCase());
      await settle(shell);
      const geometry = await shell.evaluate(node => {
        const rect = (selector: string) => {
          const b = node.querySelector(selector)!.getBoundingClientRect();
          return { x:b.x, y:b.y, right:b.right, bottom:b.bottom, width:b.width, height:b.height };
        };
        return { area:rect('.aui-shell-area'), main:rect('.aui-shell-main'), center:rect('.aui-shell-center'), viewport:rect('#viewport'), padding:getComputedStyle(node.querySelector('.aui-shell-main')!).padding };
      });
      expect(geometry.padding).toBe('0px');
      expect(geometry.viewport).toEqual(geometry.center);
      expect(geometry.center).toEqual(geometry.main);
      if (mode === 'Docked') {
        const sides = await shell.locator('.aui-shell-side').evaluateAll(nodes => nodes.map(n => { const b = n.getBoundingClientRect(); return { left:b.left, right:b.right }; }));
        expect(Math.abs(geometry.viewport.x - sides[0].right)).toBeLessThanOrEqual(1);
        expect(Math.abs(geometry.viewport.right - sides[1].left)).toBeLessThanOrEqual(1);
        expect(geometry.viewport.y).toBe(geometry.area.y);
        expect(geometry.viewport.bottom).toBe(geometry.area.bottom);
      } else {
        expect(geometry.viewport).toEqual(geometry.area);
      }
      if (mode === 'Floating') {
        const toolbar = (await shell.locator('.aui-shell-fltoolbar').boundingBox())!;
        const cube = (await page.locator('#view-cube').boundingBox())!;
        expect(cube.y).toBeGreaterThanOrEqual(toolbar.y + toolbar.height);
        const right = (await shell.locator('.aui-shell-fledge--right').boundingBox())!;
        expect(cube.x + cube.width).toBeLessThanOrEqual(right.x);
        const filter = (await page.getByLabel('Viewport selection tools').boundingBox())!;
        expect(filter.x + filter.width).toBeLessThanOrEqual(right.x);
      }
      await page.screenshot({ path: info.outputPath(`cad-${mode}-${width}.png`), animations:'disabled' });
    }
  }
});

test('shared showcase distinguishes framed documents from continuous canvases', async ({ page, baseURL }) => {
  await signIn(page, baseURL!);
  await page.request.post('/api/admin/apps', { headers:{Origin:baseURL!}, data:{id:'ui',enabled:true} });
  await page.goto('/ui/index.html#tab=widgets');
  const demo = page.getByRole('region', { name:'Full-height tabbed sidebar showcase' });
  await demo.scrollIntoViewIfNeeded();
  const main = demo.locator('.aui-shell-main').first();
  await expect(main).toHaveCSS('padding','0px');
  await expect(demo.locator('.aui-shell-content')).toHaveCount(3);
  await demo.getByRole('combobox',{name:'Workspace content presentation'}).selectOption('canvas');
  await expect(main).toHaveCSS('padding','0px');
  await expect(demo.locator('.aui-shell-content')).toHaveCount(0);
  await demo.getByRole('combobox',{name:'Workspace content presentation'}).selectOption('framed');
  await expect(demo.locator('.aui-shell-content')).toHaveCount(3);
});

for (const app of ['map', 'sketch', 'animation', 'io']) {
  test(`${app} inherits the full-width canvas and overlay default`, async ({ page, baseURL }, info) => {
    await signIn(page, baseURL!);
    await page.request.post('/api/admin/apps', {headers:{Origin:baseURL!},data:{id:app,enabled:true}});
    await page.goto(`/${app}/index.html${app === 'map' ? '?new=show' : ''}`);
    if (app === 'io') await createIOProject(page);
    const shell = page.locator('.aui-shell').first();
    await expect(shell).toHaveAttribute('data-content-presentation','canvas');
    await page.getByRole('button',{name:/^Studio mode:/}).press('ArrowDown');
    await page.getByRole('menuitemradio',{name:'Floating',exact:true}).click();
    await expect(shell).toHaveAttribute('data-layout','floating');
    await settle(shell);
    const sizes = await shell.evaluate(n => {
      const area=n.querySelector('.aui-shell-area')!.getBoundingClientRect();
      const center=n.querySelector('.aui-shell-center')!.getBoundingClientRect();
      return [Math.abs(area.x-center.x),Math.abs(area.y-center.y),Math.abs(area.width-center.width),Math.abs(area.height-center.height)];
    });
    for(const gap of sizes) expect(gap).toBeLessThanOrEqual(1);
    await page.screenshot({path:info.outputPath(`${app}-floating.png`),animations:'disabled'});
  });
}

test('Animation Studio demo keeps tables safe and its 3D canvas full size', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!);
  await page.request.post('/api/admin/apps', {headers:{Origin:baseURL!},data:{id:'ui',enabled:true}});
  await page.goto('/ui/index.html?demo=animation-studio');
  await page.getByRole('tab',{name:'3D Modeling',exact:true}).click();
  await page.getByRole('button',{name:/^Studio mode:/}).press('ArrowDown');
  await page.getByRole('menuitemradio',{name:'Floating',exact:true}).click();
  const shell=page.locator('.animation-studio .aui-shell');
  const modes=page.getByRole('radiogroup',{name:'Modeling center view'});
  await modes.getByRole('radio',{name:'Table',exact:true}).click();
  await settle(shell);
  const table=(await page.locator('.animation-rig-table').boundingBox())!;
  const toolbar=(await shell.locator('.aui-shell-fltoolbar').boundingBox())!;
  expect(table.y).toBeGreaterThanOrEqual(toolbar.y+toolbar.height);
  for(const side of ['left','right']) {
    const edge=(await shell.locator(`.aui-shell-fledge--${side}`).boundingBox())!;
    if(side==='left') expect(table.x).toBeGreaterThanOrEqual(edge.x+edge.width);
    else expect(table.x+table.width).toBeLessThanOrEqual(edge.x);
  }
  await page.screenshot({path:info.outputPath('animation-table-safe.png'),animations:'disabled'});
  await modes.getByRole('radio',{name:'3D',exact:true}).click();
  await settle(shell);
  const surface=(await page.locator('.animation-model-preview').boundingBox())!;
  const area=(await shell.locator('.aui-shell-area').boundingBox())!;
  expect(surface).toEqual(area);
  await page.screenshot({path:info.outputPath('animation-3d-full.png'),animations:'disabled'});
});
