import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('docked combined sidebars meet window edges and draw an internal divider in every orientation', async ({page,baseURL}, info) => {
  await signIn(page,baseURL!);
  expect((await page.request.post('/api/admin/apps',{headers:{Origin:baseURL!},data:{id:'ui',enabled:true}})).ok()).toBe(true);
  await page.goto('/ui/index.html#tab=widgets');
  const demo = page.getByRole('region',{name:'Full-height tabbed sidebar showcase'});
  await demo.scrollIntoViewIfNeeded();
  await demo.getByRole('combobox',{name:'Sidebar attachment preview'}).selectOption('attached');
  await demo.getByRole('combobox',{name:'Tabbed sidebar layout'}).selectOption('docked');
  for (const side of ['left','right']) {
    await demo.getByRole('combobox',{name:'Tabbed sidebar side'}).selectOption(side);
    for (const position of ['Top','Bottom','Side']) {
      const preview = demo.getByRole('region',{name:`${position} tabs preview`});
      const card = preview.locator('.aui-tabbed-sidebar');
      await expect(card).toHaveCSS('border-radius','0px');
      await expect(card).toHaveCSS('box-shadow','none');
      await expect(card).toHaveCSS('border-top-width','0px');
      const geometry = await card.evaluate((node,side) => {
        const card = node.getBoundingClientRect(), area = node.closest('.aui-shell-area')!.getBoundingClientRect();
        const tray = node.querySelector('.aui-tabbed-sidebar-tabs')!;
        const line = getComputedStyle(tray,'::after');
        return { gap: side==='left' ? card.left-area.left : area.right-card.right, top:card.top-area.top,bottom:area.bottom-card.bottom,lineWidth:line.width,lineHeight:line.height,lineColor:line.backgroundColor, orientation:node.getAttribute('data-orientation') };
      },side);
      expect(geometry.gap).toBeLessThanOrEqual(1);
      expect(geometry.top).toBeCloseTo(0,0);
      expect(geometry.bottom).toBeCloseTo(0,0);
      expect(geometry.orientation==='vertical' ? geometry.lineWidth : geometry.lineHeight).toBe('1px');
      expect(geometry.lineColor).not.toBe('rgba(0, 0, 0, 0)');
      const tab = card.getByRole('toolbar').getByRole('button',{name:'Properties',exact:true});
      const before = (await tab.boundingBox())!;
        const openCard = (await card.boundingBox())!;
      await tab.click();
      await expect(card).toHaveAttribute('data-expanded','false');
      const after = (await tab.boundingBox())!;
      expect(after.x).toBeCloseTo(before.x,0);
      if (position === 'Side') expect(after.y).toBeCloseTo(before.y,0);
      else {
        const collapsedCard = (await card.boundingBox())!;
        expect(collapsedCard.y + collapsedCard.height).toBeCloseTo(openCard.y + openCard.height,0);
        expect(collapsedCard.height).toBeLessThan(60);
      }
      await tab.click();
    }
  }
  await demo.screenshot({path:info.outputPath('docked-dividers.png'),animations:'disabled'});
  await demo.getByRole('combobox',{name:'Tabbed sidebar layout'}).selectOption('floating');
  for(const card of await demo.locator('.aui-tabbed-sidebar').all()) {
    await expect(card).toHaveCSS('border-radius','9px');
    await expect(card).not.toHaveCSS('box-shadow','none');
  }
});
