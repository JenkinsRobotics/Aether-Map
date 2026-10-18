import { expect, test } from '@playwright/test';
import { createIOProject, openAppSettings, signIn } from './helpers';

test('left advisor preserves Map tools and moves from welcome to conversation', async({page,baseURL},info)=>{
  await signIn(page,baseURL!);
  let request: Record<string,unknown>|undefined;
  await page.route('**/api/agent/**', async route=>{
    const action=new URL(route.request().url()).pathname.split('/').pop();
    const data=route.request().postDataJSON();
    const body=action==='catalog'?{plugins:[{id:'fixture',name:'Test provider',enabled:true,runtimeReady:true,account:{connected:true}}]}:
      action==='models'?{id:'models',state:'running'}:
      action==='chat'?(request=data,{id:'response',state:'running'}):
      data?.id==='models'?{id:'models',state:'completed',models:[{id:'test-model',name:'Test model'}]}:
      {id:'response',state:'completed',text:'Test response: review surface alignment before export.'};
    await route.fulfill({json:body});
  });
  await page.goto('/map/index.html?new=show');
  const left=page.getByRole('toolbar',{name:'Left sidebar tabs',exact:true});
  const toggle=left.getByRole('button',{name:'AI advisor',exact:true});
  await toggle.click();
  const advisor=page.getByRole('region',{name:'Projection assistant'});
  await expect(page.getByRole('toolbar',{name:'Right sidebar tabs',exact:true}).getByRole('button',{name:/AI advisor|Aether Agent/})).toHaveCount(0);
  await expect(advisor.getByRole('heading',{name:'AI Advisor',exact:true})).toBeVisible();
  await expect(advisor.getByRole('heading',{name:'Sample questions'})).toBeVisible();
  await expect(advisor.getByRole('combobox',{name:'Agent model'})).toBeEnabled();
  await expect(advisor.getByRole('option',{name:'Test model'})).toHaveCount(1);
  await expect(advisor.getByRole('button',{name:'Add context',exact:true})).toBeVisible();
  await advisor.getByLabel('Agent options',{exact:true}).click();
  await expect(advisor.getByRole('button',{name:'Download creative brief'})).toBeVisible();
  await advisor.getByLabel('Agent options',{exact:true}).click();
  const input=advisor.getByRole('textbox',{name:'Ask Aether Agent'});
  await advisor.getByRole('button',{name:'Help me plan a projection for this scene.',exact:true}).click();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('Help me plan a projection for this scene.');
  expect(request).toBeUndefined();
  await page.screenshot({path:info.outputPath('advisor-welcome.png'),animations:'disabled'});
  await advisor.getByRole('button',{name:'Send',exact:true}).click();
  await expect(advisor.getByText('Test response: review surface alignment before export.',{exact:true})).toBeVisible();
  expect(request).toMatchObject({app:'map',provider:'fixture'});
  expect(JSON.parse(String(request?.context))).toHaveProperty('scene');
  await expect(advisor.getByText('Sample questions',{exact:true})).toHaveCount(0);
  await advisor.getByRole('button',{name:'Rate 4 of 5'}).click();
  await toggle.click();await toggle.click();
  await expect(advisor.getByRole('button',{name:'Rate 4 of 5'})).toHaveAttribute('aria-pressed','true');
  await advisor.getByLabel('Agent options',{exact:true}).click();
  const download=page.waitForEvent('download');
  await advisor.getByRole('button',{name:'Download creative brief'}).click();
  expect((await download).suggestedFilename()).toMatch(/creative-brief\.zip$/);
  const composer=await advisor.locator('.aui-agent-chat__bottom').boundingBox();
  const panel=await advisor.boundingBox();
  expect(composer!.y+composer!.height).toBeLessThanOrEqual(panel!.y+panel!.height+1);
  await openAppSettings(page);
  const settings=page.getByRole('dialog',{name:'Aether Map settings'});
  await settings.getByRole('button',{name:'Appearance & icons',exact:true}).click();
  await settings.getByRole('combobox',{name:'Interface theme'}).selectOption('aether-studio');
  await settings.getByRole('combobox',{name:'Color mode'}).selectOption('dark');
  await settings.getByRole('button',{name:/Close/}).click();
  await page.screenshot({path:info.outputPath('advisor-conversation-dark.png'),animations:'disabled'});
  await advisor.getByRole('button',{name:'New chat',exact:true}).click();
  await expect(advisor.getByRole('heading',{name:'Sample questions'})).toBeVisible();
  await expect(advisor.getByRole('group',{name:'Rate this response'})).toHaveCount(0);
  await expect(advisor.locator('[data-icon-missing]')).toHaveCount(0);
});

for(const app of ['cad','io','sketch','animation']) test(`${app}: the existing advisor lives only on the left`,async({page,baseURL})=>{
  await signIn(page,baseURL!);
  await page.request.post('/api/admin/apps',{headers:{Origin:baseURL!},data:{id:app,enabled:true}});
  await page.goto(`/${app}/index.html${app==='cad'?'?new=part':''}`);
  if(app==='cad')await page.getByRole('button',{name:'Create Part',exact:true}).click();
  if(app==='io')await createIOProject(page);
  await page.getByRole('toolbar',{name:'Left sidebar tabs',exact:true}).getByRole('button',{name:'AI advisor',exact:true}).click();
  await expect(page.getByRole('heading',{name:'AI Advisor',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Sample questions'})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Ask Aether Agent'})).toHaveCount(1);
  await expect(page.getByRole('toolbar',{name:'Right sidebar tabs',exact:true}).getByRole('button',{name:/AI advisor|Aether Agent/})).toHaveCount(0);
});
