import { test, expect, type Locator } from '@playwright/test';
import { openOutput, signIn, switchWorkspace, openBottomDock } from './helpers';

async function pixels(canvas: Locator) {
  return canvas.evaluate(node => {
    const canvas = node as HTMLCanvasElement, gl = canvas.getContext('webgl')!;
    const at = (x: number, y: number) => {
      const rgba = new Uint8Array(4); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba); return [...rgba];
    };
    return { background: at(5,5), foreground: at(Math.floor(canvas.width/2), Math.floor(canvas.height/2)) };
  });
}

test('online video imports into the pool, keys green in editor/output and survives save/reopen', async ({ page, baseURL }, info) => {
  await signIn(page, baseURL!);
  await page.goto('/map/index.html?new=show');
  const encoded = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
    const ctx = canvas.getContext('2d')!;
    const draw = () => { ctx.fillStyle='#00ff00'; ctx.fillRect(0,0,320,180); ctx.fillStyle='#ff0000'; ctx.fillRect(100,50,120,80); };
    draw(); const stream = canvas.captureStream(10); const recorder = new MediaRecorder(stream, { mimeType:'video/webm' });
    const chunks: Blob[] = [];
    const completed = new Promise<Blob>(resolve => { recorder.ondataavailable = e => chunks.push(e.data); recorder.onstop = () => resolve(new Blob(chunks, { type:'video/webm' })); });
    recorder.start(); const interval = setInterval(draw, 100);
    await new Promise(resolve => setTimeout(resolve, 1300)); recorder.stop(); clearInterval(interval);
    const blob = await completed; stream.getTracks().forEach(t => t.stop());
    return await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(blob); });
  });
  const bytes = Buffer.from(encoded,'base64');
  await page.route('https://cdn.pixabay.com/video/fixture.webm', route => route.fulfill({ body:bytes, contentType:'video/webm', headers:{ 'access-control-allow-origin':'*' } }));
  await page.route('**/api/map/assets/search?**', route => route.fulfill({ json:{ totalHits:1, hits:[{
    id:133142, pageURL:'https://pixabay.com/videos/skull-skeleton-halloween-scary-133142/', user:'Fixture Artist', tags:'Green screen fixture', duration:1.3,
    videos:{ medium:{ url:'https://cdn.pixabay.com/video/fixture.webm', width:320,height:180,size:bytes.length } },
  }] } }));
  await switchWorkspace(page,'Visualization'); await openBottomDock(page,'Timeline');
  const pool = page.getByRole('region',{name:'Media Pool',exact:true});
  await pool.getByRole('tab',{name:'Online Library'}).click();
  await page.getByRole('searchbox',{name:'Search Pixabay or paste a link'}).fill('https://pixabay.com/videos/skull-skeleton-halloween-scary-133142/');
  await page.context().route('https://pixabay.com/**', route => route.fulfill({ contentType:'text/html', body:'<title>Pixabay website fixture</title>' }));
  const popupPromise = page.waitForEvent('popup');
  await pool.getByRole('button',{name:'Browse Pixabay'}).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL('https://pixabay.com/videos/skull-skeleton-halloween-scary-133142/');
  await popup.close();
  const chooserPromise = page.waitForEvent('filechooser');
  await pool.getByRole('button',{name:'Import downloaded file…'}).click();
  await (await chooserPromise).setFiles([]);
  await pool.getByRole('button',{name:'Search',exact:true}).click();
  await pool.getByRole('button',{name:'Preview Green screen fixture by Fixture Artist'}).click();
  await expect(page.getByRole('dialog').locator('video')).toBeVisible();
  await page.screenshot({path:info.outputPath('online-video-preview.png')});
  await page.getByRole('button',{name:'Import into project'}).click();
  await expect(page.getByText(/Imported Green screen fixture/)).toBeVisible();
  await pool.getByRole('tab',{name:'Media Pool',exact:true}).click();
  await pool.getByRole('button',{name:'Green-screen-fixture.webm',exact:true}).click();
  await page.getByRole('checkbox',{name:'Remove background color'}).check();
  await pool.getByRole('button',{name:'Append to track',exact:true}).click();
  const editor = page.locator('.map-chroma-media').first();
  await expect(editor).toBeVisible();
  await expect.poll(async () => (await pixels(editor)).foreground[0]).toBeGreaterThan(220);
  const keyed = await pixels(editor); expect(keyed.background[3]).toBe(0); expect(keyed.foreground[3]).toBe(255);
  await page.getByRole('checkbox',{name:'Remove background color'}).uncheck();
  await expect(page.locator('.map-chroma-media')).toHaveCount(0);
  await page.getByRole('checkbox',{name:'Remove background color'}).check();
  await expect.poll(async () => (await pixels(editor)).foreground[0]).toBeGreaterThan(220);
  await page.screenshot({path:info.outputPath('green-screen-properties.png')});
  const output = await openOutput(page);
  const projected = output.locator('.map-chroma-media').first();
  await expect(projected).toBeVisible();
  await expect.poll(async () => (await pixels(projected)).foreground[0]).toBeGreaterThan(220);
  expect((await pixels(projected)).background[3]).toBe(0);
  await expect(page.getByRole('tablist', {name:'Open shows'}).getByRole('tab', {selected:true}).getByRole('status')).toHaveText('Saved');
  const id = new URL(page.url()).searchParams.get('document')!;
  const saved = await page.request.post('/api/library/read', { headers:{ Origin:baseURL! }, data:{ app:'map', id } });
  expect(saved.ok()).toBe(true);
  const body = await saved.json();
  const document = JSON.parse(Buffer.from(body.data_base64,'base64').toString());
  expect(document.media[0].credit.provider).toBe('Pixabay');
  expect(document.media[0].bytes).toBe(bytes.length);
  expect(document.media[0].file).not.toContain('http');
  await page.screenshot({path:info.outputPath('online-green-screen.png')});
  await output.close(); await page.reload();
  await switchWorkspace(page,'Visualization'); await openBottomDock(page,'Timeline');
  await expect(page.locator('.map-chroma-media').first()).toBeVisible();
  await expect.poll(async () => (await pixels(page.locator('.map-chroma-media').first())).foreground[0]).toBeGreaterThan(220);
  expect((await pixels(page.locator('.map-chroma-media').first())).background[3]).toBe(0);
});
