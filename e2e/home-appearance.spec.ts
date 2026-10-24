import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

for (const app of ['map','io']) {
  test(`${app} home keeps appearance in its settings gear`, async ({page,baseURL},info) => {
    await signIn(page,baseURL!);
    if(app==='io') await page.request.post('/api/admin/apps',{headers:{Origin:baseURL!},data:{id:app,enabled:true}});
    await page.goto(`/${app}/`);
    const header=page.locator('.aui-application-home-header');
    await expect(header).toBeVisible();
    await expect(header.getByRole('button',{name:/Interface theme:|appearance:/i})).toHaveCount(0);
    const gear=header.getByRole('button',{name:'Settings',exact:true});
    await gear.click();
    await page.getByRole('menuitemradio',{name:'Dark',exact:true}).click();
    await expect(page.locator('html')).toHaveAttribute('data-appearance','dark');
    await gear.click();
    await page.getByRole('menuitem',{name:'Settings',exact:true}).click();
    const settings=page.getByRole('dialog',{name:`Aether ${app==='map'?'Map':'IO'} settings`});
    await expect(settings).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    const theme=settings.getByRole('combobox',{name:'Interface theme',exact:true});
    const next=await theme.locator('option').evaluateAll(options=>options.map(o=>(o as HTMLOptionElement).value)[1]);
    await theme.selectOption(next);
    await settings.getByRole('combobox',{name:'Color mode',exact:true}).selectOption('light');
    await expect(settings.getByRole('combobox',{name:'Viewport theme',exact:true})).toBeVisible();
    await expect(settings.getByRole('combobox',{name:'Tool icon pack',exact:true})).toBeVisible();
    await settings.getByRole('button',{name:/Close/}).click();
    await page.reload();
    await gear.click();
    await expect(page.getByRole('menuitemradio',{name:'Light',exact:true})).toHaveAttribute('aria-checked','true');
    await page.getByRole('menuitem',{name:'Settings',exact:true}).click();
    await expect(theme).toHaveValue(next);
    await settings.getByRole('button',{name:/Close/}).click();
    await page.screenshot({path:info.outputPath(`${app}-clean-home-header.png`),animations:'disabled'});
  });
}
