import { expect, test } from '@playwright/test';
import { createIOProject, signIn } from './helpers';
const standard = [
  ['Features and parts','features-parts'], ['Version control','version-control'],
  ['Create version','version-create'], ['Comments','comment'], ['Document notes','notes'],
  ['Reminders','stopwatch'], ['AI advisor','advisor'], ['Action items','tasks'], ['Part manager','part-manager'],
];
for(const app of ['cad','map','io','sketch','animation']) {
  test(`${app} shares the standard document rail and exclusive panels`,async({page,baseURL},info)=>{
    await signIn(page,baseURL!);
    await page.request.post('/api/admin/apps',{headers:{Origin:baseURL!},data:{id:app,enabled:true}});
    await page.goto(`/${app}/index.html${app==='map'?'?new=show':app==='cad'?'?new=part':''}`);
    if(app==='cad') await page.getByRole('button',{name:'Create Part',exact:true}).click();
    if(app==='io') await createIOProject(page);
    const card=page.getByRole('complementary',{name:'Left sidebar',exact:true}).first();
    const rail=card.getByRole('toolbar',{name:'Left sidebar tabs',exact:true});
    await expect(rail).toBeVisible();
    const labels=await rail.getByRole('button').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')));
    expect(labels.filter(label=>standard.some(([title])=>title===label))).toEqual(standard.map(([title])=>title));
    expect(labels.at(-1)).toBe('Part manager');
    for(const [name,icon] of standard) {
      const button=rail.getByRole('button',{name,exact:true});
      await expect(button.locator('svg')).toHaveAttribute('data-icon',icon);
      await expect(button.locator('[data-icon-missing]')).toHaveCount(0);
      if(name==='Create version') {
        await button.click();
        const dialog=page.getByRole('dialog',{name:/Create version from/});
        await expect(dialog).toBeVisible();
        await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
        continue;
      }
      if(await button.getAttribute('aria-pressed')!=='true') await button.click();
      await expect(button).toHaveAttribute('aria-pressed','true');
      await expect(rail.locator('button[aria-pressed=true]')).toHaveCount(1);
      await expect(card).toHaveAttribute('data-open','true');
    }
    if(['map','io'].includes(app)) {
      const right=page.getByRole('toolbar',{name:'Right sidebar tabs',exact:true});
      await expect(right.getByRole('button',{name:/Agent|advisor/i})).toHaveCount(0);
      await rail.getByRole('button',{name:'AI advisor',exact:true}).click();
      await expect(card.getByRole('textbox').first()).toBeVisible();
    }
    const features=rail.getByRole('button',{name:'Features and parts',exact:true});
    await features.click();
    await expect(features).toHaveAttribute('aria-pressed','true');
    await features.click();await expect(card).toHaveAttribute('data-open','false');
    await features.click();await expect(card).toHaveAttribute('data-open','true');
    await page.screenshot({path:info.outputPath(`${app}-standard-rail.png`),animations:'disabled'});
  });
}
