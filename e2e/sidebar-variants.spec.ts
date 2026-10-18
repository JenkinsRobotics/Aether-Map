import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('showcase has separate equivalent primary and secondary sidebar specimens', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!);
  expect((await page.request.post('/api/admin/apps', {headers:{Origin:baseURL!}, data:{id:'ui',enabled:true}})).ok()).toBe(true);
  await page.goto('/ui/index.html#tab=widgets');
  for (const [name, attachment] of [['Combined Card — Primary','attached'],['Detached Tray — Secondary','detached']]) {
    const specimen = page.getByRole('region',{name,exact:true});
    await specimen.scrollIntoViewIfNeeded();
    const card = specimen.getByRole('complementary',{name:'Right sidebar'});
    await expect(card).toHaveAttribute('data-attachment',attachment);
    const draft = card.getByRole('textbox',{name:'Location X',exact:true});
    await draft.fill('42'); await draft.press('Enter');
    for (const placement of ['tabs-top','tabs-bottom','rail']) {
      await specimen.getByRole('combobox',{name:'Specimen tab placement'}).selectOption(placement);
      await expect(card).toHaveAttribute('data-attachment',attachment);
      const tabs = card.getByRole('toolbar');
      await expect(tabs.getByRole('button')).toHaveCount(4);
      await tabs.getByRole('button',{name:'Structure',exact:true}).click();
      await expect(card.getByRole('checkbox',{name:'Body 01',exact:true})).toBeVisible();
      await tabs.getByRole('button',{name:'Properties',exact:true}).click();
      await expect(draft).toHaveValue('42');
    }
    await specimen.getByRole('combobox',{name:'Specimen layout'}).selectOption('docked');
    await expect(draft).toHaveValue('42');
    await specimen.screenshot({path:info.outputPath(`${attachment}-specimen.png`),animations:'disabled'});
  }
});
