import {expect,test} from '@playwright/test';
import { createIOProject,signIn,openAppSettings} from './helpers';
for(const app of ['map','cad','sketch','animation','io']) test(`${app}: shared Part manager contents, library and reference controls`,async({page,baseURL},info)=>{
  await signIn(page,baseURL!);
  await page.request.post('/api/admin/apps',{headers:{Origin:baseURL!},data:{id:app,enabled:true}});
  const folder=await page.request.post('/api/library/create',{headers:{Origin:baseURL!},data:{app,kind:'folder',name:'Manager test folder'}});
  expect(folder.ok(),await folder.text()).toBeTruthy();
  await page.goto(`/${app}/index.html${app==='map'?'?new=show':app==='cad'?'?new=part':''}`);
  if(app==='cad')await page.getByRole('button',{name:'Create Part',exact:true}).click();
  if(app==='io')await createIOProject(page);
  const rail=page.getByRole('toolbar',{name:'Left sidebar tabs',exact:true});
  await rail.getByRole('button',{name:'Part manager',exact:true}).click();
  const manager=page.locator('.aui-file-manager');
  await expect(manager).toBeVisible();
  await expect(manager.getByRole('heading',{name:'Part manager',exact:true})).toBeVisible();
  await expect(manager.getByRole('button',{name:'Sort files',exact:true})).toBeVisible();
  await expect(manager.getByRole('button',{name:'Filter files by type',exact:true})).toBeVisible();
  await expect(manager.getByLabel('File library')).toBeEnabled();
  await manager.getByRole('button',{name:'Manager test folder Folder',exact:true}).click();
  await expect(manager.getByText('No documents here yet.')).toBeVisible();
  await manager.getByRole('navigation',{name:'Folder path'}).getByRole('button',{name:'My files',exact:true}).click();
  await expect(manager.getByRole('button',{name:'Manager test folder Folder',exact:true})).toBeVisible();
  await manager.getByLabel('File library').selectOption('workspace');
  await expect(manager.getByLabel('File library')).toBeEnabled();
  await manager.getByLabel('File library').selectOption('personal');
  await expect(manager.getByLabel('File library')).toBeEnabled();
  await manager.getByRole('searchbox',{name:'Search files'}).fill('unmatched name 8491');
  await expect(manager.getByText(/Nothing matches/)).toBeVisible();
  await manager.getByRole('button',{name:'Clear filters',exact:true}).click();
  await manager.getByRole('button',{name:'Compact file list',exact:true}).click();
  await expect(manager).toHaveAttribute('data-compact','true');
  await manager.getByRole('button',{name:'Compact file list',exact:true}).click();
  const docRows=manager.locator('.aui-file-manager-document .aui-file-row');
  if(['map','sketch','io'].includes(app)) {
    await expect(docRows.first()).toBeVisible();
    await docRows.first().click();
    await expect(manager.getByRole('complementary',{name:'Selected item preview'})).toBeVisible();
  }
  await expect(manager.getByRole('alert')).toHaveCount(0);
  if(app==='map'){
    await expect(rail.getByRole('button',{name:'Assets',exact:true})).toBeVisible();
    await page.screenshot({path:info.outputPath('part-manager-light.png'),animations:'disabled'});
    await openAppSettings(page);
    const settings=page.getByRole('dialog',{name:'Aether Map settings'});
    await settings.getByRole('button',{name:'Appearance & icons',exact:true}).click();
    await settings.getByRole('combobox',{name:'Interface theme'}).selectOption('aether-studio');
    await settings.getByRole('combobox',{name:'Color mode'}).selectOption('dark');
    await settings.getByRole('button',{name:/Close/}).click();
    await page.screenshot({path:info.outputPath('part-manager-dark.png'),animations:'disabled'});
  }
  if(app==='io')await expect(rail.getByRole('button',{name:'Components',exact:true})).toBeVisible();
});
