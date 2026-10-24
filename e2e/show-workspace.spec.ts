import { expect, test } from '@playwright/test';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { emptyShow, newSurface } from '../src/document';
import { contentClip } from '../src/surface-assets';
import { players, rightTab, signIn, solidPng, switchWorkspace } from './helpers';
const run=promisify(execFile);

test('Show routes, pairs, deploys and stops a local headless player, with exports and saved rules',async({page,context,baseURL},info)=>{
  test.setTimeout(180000);await page.setViewportSize({width:1800,height:1100});await signIn(page,baseURL!);
  const post=async(path:string,data:object)=>{const r=await page.request.post(path,{headers:{Origin:baseURL!},data});expect(r.ok()).toBe(true);return r.json();};
  const show=emptyShow(),surface=newSurface(show.output,0),file='show-workspace.png';
  const upload=await page.request.put(`/api/map/media/${file}`,{headers:{Origin:baseURL!},data:solidPng(320,180,[30,180,210])});expect(upload.ok()).toBe(true);
  show.media=[{id:'image',file,name:'Wall',kind:'image',width:320,height:180,bytes:500}];
  surface.clips=[contentClip({mediaId:'image',rect:[0,0,320,180]},show.media,0,'wall')];surface.sequence=true;show.scenes[0].surfaces=[surface];
  const saved=await post('/api/library/create',{app:'map',scope:'personal',name:'Evening show.aethermap',data_base64:Buffer.from(JSON.stringify(show)).toString('base64')});
  await page.goto(`/map/index.html?document=${saved.id}`);await switchWorkspace(page,'Show');
  const workspace=page.getByRole('region',{name:'Show workspace',exact:true});
  await expect(workspace.getByLabel('Show output preview').locator('.map-surface img')).toBeVisible();
  await expect(page.locator('.map-composition-timeline')).toHaveCount(0);
  // How the show plays is the Program tab's; players are managed from the Players section.
  await rightTab(page,'Program');
  await page.getByRole('combobox',{name:'Show playback'}).selectOption('loop');
  await page.getByRole('textbox',{name:'Show length'}).fill('45');await page.getByRole('textbox',{name:'Show length'}).press('Tab');
  let devices=await players(page);
  await devices.getByRole('button',{name:'Set up a new one'}).click();
  const setup=page.getByRole('dialog',{name:'Set up a new device'});
  const downloadPromise=page.waitForEvent('download');await setup.getByRole('button',{name:'Download projector installer'}).click();
  const download=await downloadPromise;expect(download.suggestedFilename()).toContain('aether-projector-setup');
  await setup.getByRole('button',{name:'Done',exact:true}).click();
  const deviceID=`pi-show-${Date.now()}`,secret=`private-pi-show-secret-${Date.now()}`;
  const announcement=await post('/api/map/devices/announce',{device_id:deviceID,name:'Porch Pi',pairing_secret:secret});
  await devices.getByRole('button',{name:'Pair a device'}).click();
  await page.getByPlaceholder('000000').fill(announcement.code);await page.getByRole('button',{name:'Pair',exact:true}).click();
  const playerCard=page.locator('.map-device').filter({hasText:'Porch Pi'});
  await expect(playerCard.getByRole('button',{name:'Deploy this show',exact:true})).toBeDisabled();
  await devices.getByRole('button',{name:'Done',exact:true}).click();
  // Outputs and their routing are Mapping's.
  await switchWorkspace(page,'Mapping');
  await page.getByRole('tree',{name:'Outputs'}).getByRole('treeitem',{name:/Output 1/}).first().click();
  await rightTab(page,'Properties');
  const properties=page.getByRole('region',{name:'Selection properties'});
  await properties.getByRole('radio',{name:'Edge device',exact:true}).click();
  await properties.getByRole('combobox',{name:'Edge device for this output'}).selectOption(deviceID);
  await properties.getByRole('radio',{name:'On a schedule',exact:true}).click();
  await properties.getByRole('textbox',{name:'Starts',exact:true}).fill('18:00');await properties.getByRole('textbox',{name:'Ends',exact:true}).fill('23:00');
  // Exercise schedule persistence without depending on the test machine's current hour.
  // Autosave: poll the saved file rather than a status label.
  const savedSchedule=async()=>JSON.parse(Buffer.from((await post('/api/library/read',{app:'map',id:saved.id})).data_base64,'base64').toString()).outputs[0].schedule;
  await expect.poll(savedSchedule,{timeout:15000}).toEqual({fromMinutes:1080,toMinutes:1380});
  await properties.getByRole('radio',{name:'Always on',exact:true}).click();
  await expect.poll(savedSchedule,{timeout:15000}).toBeUndefined();
  await switchWorkspace(page,'Show');
  await page.screenshot({path:info.outputPath('show-workspace.png')});
  devices=await players(page);
  await playerCard.getByRole('button',{name:'Deploy this show',exact:true}).click();
  await expect(playerCard.getByRole('button',{name:'Assigned',exact:true})).toBeVisible();
  const paired=await post('/api/map/devices/announce',{device_id:deviceID,name:'Porch Pi',pairing_secret:secret});
  const root=await mkdtemp(join(tmpdir(),'aether-show-workspace-')),showDir=join(root,'show'),config=join(root,'config.json');await mkdir(showDir);
  await writeFile(config,JSON.stringify({server_url:baseURL,name:"Porch Pi",device_id:deviceID,token:paired.token,pairing_secret:secret,show_dir:showDir,port:0}),{mode:0o600});
  const python=resolve('../AetherStudio/.venv/bin/python'),player=resolve('player/aether_player.py');
  // A stuck pull fails with the player's own log rather than the test timeout.
  const pull=()=>run(python,[player,'--config',config,'--once'],{timeout:90000}).catch((e:{stderr?:string;stdout?:string})=>{throw new Error(`player pull failed: ${e.stderr??''}${e.stdout??''}`);});
  const firstPull=await pull();expect(firstPull.stderr).toContain('deployed');
  // The player deploys into a release directory behind a `.current` link.
  const release=join(showDir,'.current');
  const deployed=JSON.parse(await readFile(join(release,'layout.json'),'utf8'));
  expect(deployed.playback.mode).toBe('loop');expect(deployed.shows[0].durationS).toBe(45);expect(deployed.outputs[0].deviceId).toBe(deviceID);
  expect((await readFile(join(release,'media',file))).length).toBeGreaterThan(0);
  const server=spawn(python,['-u','e2e/serve-player.py',config],{stdio:['ignore','pipe','pipe']});
  try {
    const port=await new Promise<number>((done,fail)=>{const timeout=setTimeout(()=>fail(new Error('player did not start')),10000);server.once('error',fail);server.stdout.once('data',data=>{clearTimeout(timeout);done(Number(String(data).trim()));});});
    const screen=await context.newPage();await screen.goto(`http://127.0.0.1:${port}/`);
    await expect(screen.frameLocator('#saved-show').locator('.map-surface img')).toBeVisible();
    await screen.route('**/*',route=>new URL(route.request().url()).port===String(port)?route.continue():route.abort());
    await screen.reload();await expect(screen.frameLocator('#saved-show').locator('.map-surface img')).toBeVisible();
    // Only capture selection is faked: real Chromium peers, authenticated host
    // signalling and the Python kiosk receiver transport these changing frames.
    await page.evaluate(() => {
      Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: async () => {
        const canvas = document.createElement('canvas'); canvas.width=320; canvas.height=180;
        const ctx=canvas.getContext('2d')!;
        let frame=0; setInterval(()=>{ctx.fillStyle=frame++%2?'#22cc88':'#3366cc';ctx.fillRect(0,0,320,180);},33);
        return canvas.captureStream(30);
      }});
    });
    await playerCard.getByRole('button',{name:'Mirror live',exact:true}).click();
    await expect(playerCard.getByRole('status')).toContainText('Mirroring',{timeout:30000});
    await expect.poll(()=>screen.locator('video').evaluate((v:HTMLVideoElement)=>v.videoWidth),{timeout:15000}).toBe(320);
    await expect(screen.locator('video')).toBeVisible();
    await expect(screen.frameLocator('#saved-show').locator('.map-surface')).toHaveCount(0);
    await page.screenshot({path:info.outputPath('live-mirroring.png')});
    await playerCard.getByRole('button',{name:'Stop mirroring',exact:true}).click();
    await expect(screen.locator('video')).toBeHidden();
    await expect(screen.frameLocator('#saved-show').locator('.map-surface img')).toBeVisible();
    // Abrupt sender navigation has no React cleanup or explicit stop request.
    await playerCard.getByRole('button',{name:'Mirror live',exact:true}).click();
    await expect(playerCard.getByRole('status')).toContainText('Mirroring',{timeout:30000});
    await expect(screen.locator('video')).toBeVisible();
    await page.reload(); await switchWorkspace(page,'Show');
    await expect(screen.locator('video')).toBeHidden({timeout:30000});
    devices=await players(page);
    await expect(screen.frameLocator('#saved-show').locator('.map-surface img')).toBeVisible();
    const stillAssigned=await post('/api/map/devices/list',{});
    expect(stillAssigned.devices.find((d:{id:string})=>d.id===deviceID).document).toBe(saved.id);
    await devices.getByRole('button',{name:'Done',exact:true}).click();
    await rightTab(page,'Export');
    const bundlePromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export project',exact:true}).click();
    expect((await bundlePromise).suggestedFilename()).toMatch(/\.zip$/);
    devices=await players(page);await playerCard.getByRole('button',{name:'Stop',exact:true}).click();
    await expect(playerCard.getByRole('button',{name:'Deploy this show',exact:true})).toBeEnabled();
    await pull();await expect(screen.frameLocator('#saved-show').locator('.map-surface')).toHaveCount(0);await screen.close();
    await page.reload();await switchWorkspace(page,'Show');await rightTab(page,'Program');await expect(page.getByRole('combobox',{name:'Show playback'})).toHaveValue('loop');
    await expect(page.getByRole('textbox',{name:'Show length'})).toHaveValue('45');
  } finally {if(server.exitCode===null&&server.signalCode===null){const exited=once(server,'exit');server.kill('SIGTERM');await exited;}}
});
