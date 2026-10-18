import { expect, test, type Page } from "@playwright/test";
import { createIOProject, openAppSettings, signIn } from "./helpers";
async function panel(page: Page, name: string) {
  const rail = page.getByRole("toolbar", {
    name: "Left sidebar tabs",
    exact: true,
  });
  const button = rail.getByRole("button", { name, exact: true });
  if ((await button.getAttribute("aria-pressed")) !== "true")
    await button.click();
}
for (const app of ["map", "io", "sketch", "cad", "animation"])
  test(`${app}: real document history and collaboration survive refresh`, async ({
    page,
    baseURL,
  }, info) => {
    await signIn(page, baseURL!);
    await page.request.post("/api/admin/apps", {
      headers: { Origin: baseURL! },
      data: { id: app, enabled: true },
    });
    await page.goto(
      `/${app}/index.html${app === "map" ? "?new=show" : app === "cad" ? "?new=part" : ""}`,
    );
    if (app === "cad")
      await page
        .getByRole("button", { name: "Create Part", exact: true })
        .click();
    if (app === "io")
      await createIOProject(page);
    await expect(
      page.getByRole("toolbar", { name: "Left sidebar tabs", exact: true }),
    ).toBeVisible();
    await panel(page, "Version control");
    const history = page.getByRole("region", {
      name: "Versions and history",
      exact: true,
    });
    await expect(
      history.getByRole("button", { name: "Workspace Main", exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await history.getByRole("button", {name:"Create version",exact:true}).click();
    await page.getByRole("dialog")
      .getByLabel("Name", { exact: true })
      .fill("Prototype review");
    await page.getByRole("dialog").getByRole("group", {name:"version action"})
      .getByRole("button", { name: "Create version", exact: true })
      .click();
    await expect(
      history.getByText("Prototype review", { exact: true }),
    ).toBeVisible();
    await panel(page, "Comments");
    await page
      .getByLabel("Comments text")
      .fill("Check the mounting dimensions");
    await page
      .getByRole("button", { name: "Add", exact: true })
      .click();
    await expect(
      page.getByText("Check the mounting dimensions", { exact: true }),
    ).toBeVisible();
    await panel(page, "Action items");
    await page.getByRole("button", {name:"Create action item",exact:true}).click();
    await page.getByLabel("Action items text").fill("Approve prototype");
    await page
      .getByRole("dialog", { name: "Create action item", exact: true })
      .getByLabel("Due date", { exact: true })
      .fill("2026-10-20");
    await page.getByRole("button", { name: "Add task", exact: true }).click();
    await expect(
      page.getByRole("combobox", { name: "Status for Approve prototype" }),
    ).toBeVisible();
    await panel(page, "Document notes");
    await page.getByRole("button", { name: "Edit document notes", exact: true }).click();
    await page
      .getByLabel("Document notes text")
      .fill("Manufacturing review notes");
    await page.getByRole("button", { name: "Save notes", exact: true }).click();
    await expect(page.getByText("Manufacturing review notes", {exact:true})).toBeVisible();
    await expect(page.getByLabel("Document notes text")).toHaveCount(0);
    await expect(page).toHaveURL(/document=/);
    const id = new URL(page.url()).searchParams.get("document");
    const call = async (action: string, data = {}) => {
      const response = await page.request.post(`/api/library/${action}`, {
        headers: { Origin: baseURL! },
        data: { app, id, ...data },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      return response.json();
    };
    const saved = await call("collaboration");
    expect(saved.tasks[0].text).toBe("Approve prototype");
    expect(saved.comments[0].text).toBe("Check the mounting dimensions");
    const revisions = await call("history");
    expect(revisions.versions[0].name).toBe("Prototype review");
    await page.reload();
    await panel(page, "Document notes");
    await expect(page.getByText("Manufacturing review notes", {exact:true})).toBeVisible();
    await expect(page.getByLabel("Document notes text")).toHaveCount(0);
    await panel(page, "Comments");
    await expect(
      page.getByText("Check the mounting dimensions", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`${app}-comments.png`),
      animations: "disabled",
    });
  });
test("Map branch saves, compare and restore preserve both histories", async ({
  page,
  baseURL,
}) => {
  await signIn(page, baseURL!);
  await page.goto("/map/index.html?new=show");
  await panel(page, "Version control");
  const history = page.getByRole("region", {
    name: "Versions and history",
    exact: true,
  });
  await expect(
    history.getByRole("button", { name: "Workspace Main", exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await history.getByRole("button", {name:"Create branch",exact:true}).click();
  await page.getByRole("dialog",{name:"Create branch from Main"}).getByLabel("Name",{exact:true}).fill("Experiment");
  await page.getByRole("dialog",{name:"Create branch from Main"})
    .getByRole("button", { name: "Create branch", exact: true })
    .click();
  await history.getByRole("button", {name:"Workspace Experiment",exact:true}).dblclick();
  await expect(page).toHaveURL(/branch=Experiment/);
  await panel(page, "Version control");
  await expect(
    history.getByRole("button", {name:"Workspace Experiment",exact:true}),
  ).toBeVisible();
  const id = new URL(page.url()).searchParams.get("document");
  const call = async (action: string, data = {}) => {
    const response = await page.request.post(`/api/library/${action}`, {
      headers: { Origin: baseURL! },
      data: { app: "map", id, ...data },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const original = await call("read", { branch: "Experiment" });
  const show = JSON.parse(
    Buffer.from(original.data_base64, "base64").toString(),
  );
  show.name = "Experiment scene";
  const changed = await call("save", {
    branch: "Experiment",
    expected_revision: original.revision,
    data_base64: Buffer.from(JSON.stringify(show)).toString("base64"),
  });
  expect((await call("read")).revision).toBe(1);
  const comparison = await call("compare", { from: 1, to: changed.revision });
  expect(comparison.same_content).toBe(false);
  expect(comparison.content_diff.text).toContain("Experiment scene");
  await page.reload();
  await panel(page, "Version control");
  await page
    .getByRole("button", { name: "Document Start", exact: true })
    .click();
  page.once("dialog", (d) => d.accept());
  await history.getByRole("button",{name:"More history actions"}).click();
  await page.getByRole("menuitem",{name:"Restore selected entry",exact:true}).click();
  await expect
    .poll(async () => (await call("read", { branch: "Experiment" })).revision)
    .toBeGreaterThan(changed.revision);
  expect((await call("read", { branch: "Experiment" })).data_base64).toBe(
    original.data_base64,
  );
  expect((await call("history")).revisions.length).toBeGreaterThan(2);
});

test("IO switching documents keeps each saved circuit isolated", async ({
  page,
  baseURL,
}) => {
  await signIn(page, baseURL!);
  await page.request.post("/api/admin/apps", {
    headers: { Origin: baseURL! },
    data: { id: "io", enabled: true },
  });
  await page.goto("/io/index.html");
  await createIOProject(page);
  await expect(page).toHaveURL(/document=/);
  const first = new URL(page.url()).searchParams.get("document");
  const read = async (id: string | null) => {
    const r = await page.request.post("/api/library/read", {
      headers: { Origin: baseURL! },
      data: { app: "io", id },
    });
    expect(r.ok()).toBeTruthy();
    return r.json();
  };
  // Home flushes current edits before allowing a different document to mount.
  await page.getByRole("link", { name: "Aether IO home" }).click();
  await createIOProject(page, 'Blank circuit');
  await expect
    .poll(() => new URL(page.url()).searchParams.get("document"))
    .not.toBe(first);
  await expect(page).toHaveURL(/document=/);
  const second = new URL(page.url()).searchParams.get("document");
  const a = JSON.parse(
    Buffer.from((await read(first)).data_base64, "base64").toString(),
  );
  const b = JSON.parse(
    Buffer.from((await read(second)).data_base64, "base64").toString(),
  );
  expect(a.parts.length).toBeGreaterThan(0);
  expect(b.parts.length).toBe(0);
  expect(a.id).not.toBe(b.id);
  await page.reload();
  await expect(
    page.getByText("0 parts · 0 connections", { exact: false }).first(),
  ).toBeVisible();
});

test("Sketch save-copy recovers conflicting edits without overwriting the server", async ({
  page,
  baseURL,
}) => {
  await signIn(page, baseURL!);
  await page.request.post("/api/admin/apps", {
    headers: { Origin: baseURL! },
    data: { id: "sketch", enabled: true },
  });
  await page.goto("/sketch/index.html");
  await expect(page).toHaveURL(/document=/);
  const id = new URL(page.url()).searchParams.get("document");
  const call = async (action: string, data = {}) => {
    const r = await page.request.post(`/api/library/${action}`, {
      headers: { Origin: baseURL! },
      data: { app: "sketch", id, ...data },
    });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  };
  const original = await call("read"),
    doc = JSON.parse(Buffer.from(original.data_base64, "base64").toString());
  doc.widthPx = 777;
  const newer = await call("save", {
    expected_revision: original.revision,
    data_base64: Buffer.from(JSON.stringify(doc)).toString("base64"),
  });
  // The current editor still holds its original drawing; copying it must leave the newer file untouched.
  await panel(page, "Version control");
  await page
    .getByRole("region", { name: "Versions and history", exact: true })
    .getByRole("button", { name: "Save current work as a copy" })
    .click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("document"))
    .not.toBe(id);
  expect((await call("read")).revision).toBe(newer.revision);
  expect((await call("read")).data_base64).toBe(
    newer.data_base64 ?? Buffer.from(JSON.stringify(doc)).toString("base64"),
  );
});

test('autosaves stay in recovery while only explicit versions enter the graph',async({page,baseURL},info)=>{
  await signIn(page,baseURL!);
  await page.goto('/map/index.html?new=show');
  await expect(page).toHaveURL(/document=/);
  const id=new URL(page.url()).searchParams.get('document');
  const call=async(action:string,data={})=>{
    const response=await page.request.post(`/api/library/${action}`,{headers:{Origin:baseURL!},data:{app:'map',id,...data}});
    expect(response.ok(),await response.text()).toBeTruthy();return response.json();
  };
  let file=await call('read');
  const contents=JSON.parse(Buffer.from(file.data_base64,'base64').toString());
  for(let i=0;i<25;i++)file=await call('save',{expected_revision:file.revision,data_base64:Buffer.from(JSON.stringify({...contents,name:`Save ${i}`})).toString('base64')});
  await page.reload();await panel(page,'Version control');
  const history=page.getByRole('region',{name:'Versions and history',exact:true});
  const graph=history.getByRole('list',{name:'Version graph'});
  await expect(graph.locator('.aui-version-row')).toHaveCount(2);
  expect((await call('history')).versions).toHaveLength(0);
  await expect(history.getByLabel('Name',{exact:true})).toHaveCount(0);
  await history.getByRole('button',{name:'Create version',exact:true}).click();
  await page.getByRole('dialog').getByLabel('Name',{exact:true}).fill('Approved layout');
  await page.getByRole('dialog').getByRole('group',{name:'version action'}).getByRole('button',{name:'Create version',exact:true}).click();
  await expect(graph.getByRole('button',{name:'Version Approved layout'})).toBeVisible();
  await expect(graph.locator('.aui-version-row')).toHaveCount(3);
  file=await call('read');
  for(let i=25;i<45;i++)file=await call('save',{expected_revision:file.revision,data_base64:Buffer.from(JSON.stringify({...contents,name:`Save ${i}`})).toString('base64')});
  await page.reload();await panel(page,'Version control');
  await expect(graph.locator('.aui-version-row')).toHaveCount(3);
  expect((await call('history')).versions).toHaveLength(1);
  await expect(history).not.toContainText('Revision 46');
  await expect(history).not.toContainText('undefined');
  await page.screenshot({path:info.outputPath('explicit-version-graph.png')});
  await history.getByRole('button',{name:'More history actions'}).click();
  await page.getByRole('menuitem',{name:'Automatic saves (recovery)'}).click();
  await expect(history.getByRole('list',{name:'Automatic saves'}).getByRole('listitem')).toHaveCount(46);
  await history.getByRole('button',{name:'Back to versions'}).click();
  await expect(graph.locator('.aui-version-row')).toHaveCount(3);
});

test('Create version dialog preserves the sidebar and creates versions or branches',async({page,baseURL},info)=>{
  await signIn(page,baseURL!);
  await page.goto('/map/index.html?new=show');
  await panel(page,'Version control');
  const sidebar=page.getByRole('complementary',{name:'Left sidebar',exact:true}).first();
  const historyView=page.getByRole('region',{name:'Versions and history',exact:true});
  await expect(historyView.getByRole('button',{name:'Workspace Main',exact:true})).toBeVisible();
  const before=await sidebar.boundingBox();
  await historyView.getByRole('button',{name:'Create version',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Create version from Main'});
  await expect(dialog).toBeVisible();
  expect(await sidebar.boundingBox()).toEqual(before);
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  await panel(page,'Create version');
  await expect(dialog).toBeVisible();
  expect(await sidebar.boundingBox()).toEqual(before);
  await expect(sidebar.getByRole('button',{name:'Version control',exact:true})).toHaveAttribute('aria-pressed','true');
  const form=page.getByRole('region',{name:'Create version',exact:true});
  await expect(form.getByRole('button')).toHaveCount(3);
  await expect(form.getByRole('button',{name:/Refresh|copy/i})).toHaveCount(0);
  await form.getByLabel('Name',{exact:true}).fill('Lighting experiment');
  await form.getByLabel('Description',{exact:true}).fill('Test the new lighting sequence');
  await page.screenshot({path:info.outputPath('create-version-form.png')});
  await form.getByRole('button',{name:'Create branch',exact:true}).click();
  await expect(dialog).toBeHidden();
  await expect(historyView.getByRole('button',{name:'Workspace Lighting experiment',exact:true})).toBeVisible();
  expect(await sidebar.boundingBox()).toEqual(before);
  const id=new URL(page.url()).searchParams.get('document');
  const history=async()=>{
    const response=await page.request.post('/api/library/history',{headers:{Origin:baseURL!},data:{app:'map',id}});
    expect(response.ok()).toBeTruthy();return response.json();
  };
  const branched=await history();
  expect(branched.versions).toHaveLength(0);
  expect(branched.branches.find((b:{name:string})=>b.name==='Lighting experiment').message).toBe('Test the new lighting sequence');
  await panel(page,'Create version');
  await form.getByLabel('Name',{exact:true}).fill('Ready for review');
  await form.getByLabel('Description',{exact:true}).fill('Reviewed layout');
  await form.getByRole('button',{name:'Create version',exact:true}).click();
  await expect(dialog).toBeHidden();
  await expect(historyView.getByRole('button',{name:'Version Ready for review',exact:true})).toBeVisible();
  expect((await history()).versions[0]).toMatchObject({name:'Ready for review',message:'Reviewed layout'});
});

test('History controls filter branches and checkpoints, expand changes and manage releases', async({page,baseURL},info)=>{
  await signIn(page,baseURL!);
  await page.goto('/map/index.html?new=show');
  await panel(page,'Version control');
  const history=page.getByRole('region',{name:'Versions and history',exact:true});
  await expect(history.getByRole('button',{name:'Workspace Main',exact:true})).toBeVisible();
  const id=new URL(page.url()).searchParams.get('document');
  const call=async(action:string,data:Record<string,unknown>={})=>{
    const response=await page.request.post(`/api/library/${action}`,{headers:{Origin:baseURL!},data:{app:'map',id,...data}});
    expect(response.ok(),await response.text()).toBeTruthy();return response.json();
  };
  const original=await call('read');
  const head=original.revision;
  await call('version',{name:'V1',expected_revision:head});
  await call('branch_create',{name:'Experiment',expected_revision:head});
  const show=JSON.parse(Buffer.from(original.data_base64,'base64').toString());show.name='Alternative show';
  const saved=await call('save',{branch:'Experiment',expected_revision:head,data_base64:Buffer.from(JSON.stringify(show)).toString('base64')});
  await call('version',{name:'Trial',branch:'Experiment',expected_revision:saved.revision});
  await call('merge',{source:'Experiment',expected_revision:head});
  await page.reload();await panel(page,'Version control');
  await expect(history.locator('[data-origin="automatic"]')).toHaveCount(1);
  await history.getByRole('button',{name:'Hide automatic versions'}).click();
  await expect(history.locator('[data-origin="automatic"]')).toHaveCount(0);
  await history.getByRole('button',{name:'Show automatic versions'}).click();
  await history.getByRole('button',{name:'Filter branches'}).click();
  await expect(page.getByRole('menuitemradio')).toHaveCount(4);
  await page.getByRole('menuitemradio',{name:'Show current branch',exact:true}).click();
  await expect(history.getByRole('button',{name:'Workspace Experiment',exact:true})).toHaveCount(0);
  await history.getByRole('button',{name:'Filter branches'}).click();
  await page.getByRole('menuitemradio',{name:'Show all branches',exact:true}).click();
  await expect(history.getByRole('button',{name:'Workspace Experiment',exact:true})).toBeVisible();
  await history.getByRole('button',{name:'Show changes for Trial',exact:true}).click();
  await expect(history.getByRole('list',{name:'Changes for Trial'}).getByRole('listitem')).toHaveCount(1);
  await history.getByRole('button',{name:'Hide merge lines'}).click();
  await history.getByRole('button',{name:'Show merge lines'}).click();
  await history.getByRole('button',{name:'Version V1',exact:true}).click();
  const more=async()=>{await history.getByRole('button',{name:'More history actions'}).click();};
  await more();
  const menu=page.getByRole('menu',{name:'History actions'});
  await expect(menu.locator('[data-icon-missing]')).toHaveCount(0);
  expect(await menu.getByRole('menuitem').count()).toBe(await menu.locator('[role="menuitem"] svg').count());
  await expect(menu.getByRole('menuitem',{name:'Compare entries'})).toBeVisible();
  await menu.getByRole('menuitem',{name:'Create release candidate'}).click();
  await expect(history.locator('[data-status="candidate"]')).toHaveCount(1);
  await more();await menu.getByRole('menuitem',{name:'Approve release'}).click();
  await expect(history.locator('[data-status="released"]')).toHaveCount(1);
  await more();page.once('dialog',dialog=>dialog.accept('Superseded by new wiring'));
  await menu.getByRole('menuitem',{name:'Obsolete release'}).click();
  await expect(history.locator('[data-status="obsolete"]')).toHaveCount(1);
  const v1=(await call('history')).versions.find((version:{name:string})=>version.name==='V1');
  expect(v1).toMatchObject({status:'obsolete',status_note:'Superseded by new wiring'});
  await expect(history.locator('.aui-version-legend > div')).toHaveCount(7);
  await page.screenshot({path:info.outputPath('history-controls.png'),animations:'disabled'});
  await page.reload();await panel(page,'Version control');
  await expect(history.locator('[data-status="obsolete"]')).toHaveCount(1);
});

test('Comments mirror the compact reference and persist replies, tags, images and resolution', async({page,baseURL},info)=>{
  await signIn(page,baseURL!);await page.goto('/map/index.html?new=show');
  await panel(page,'Comments');
  const comments=page.getByRole('region',{name:'Comments',exact:true});
  const composer=comments.getByRole('form',{name:'Comment composer'});
  await expect(comments.getByRole('button',{name:'Refresh'})).toHaveCount(0);
  await expect(comments.getByLabel('Comments filter')).toHaveValue('all');
  await composer.getByLabel('Comments text').fill('Review the wiring here');
  await composer.getByRole('button',{name:'Tag a saved state'}).click();
  const tags=page.getByRole('dialog',{name:'Tag a saved state'});
  await tags.getByLabel('Saved-state tag').selectOption({index:1});
  await tags.getByRole('button',{name:'Done',exact:true}).click();
  const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;canvas.getContext('2d')!.fillRect(2,2,28,28);return canvas.toDataURL('image/png').split(',')[1];});
  await composer.getByLabel('Comment image file').setInputFiles({name:'Wiring.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await expect(composer.getByRole('img',{name:'Wiring.png'})).toBeVisible();
  await composer.getByRole('button',{name:'Add',exact:true}).click();
  const thread=comments.getByRole('article').filter({hasText:'Review the wiring here'});
  await expect(thread).toBeVisible();
  await expect(thread.getByRole('img',{name:'Wiring.png'})).toBeVisible();
  await thread.getByRole('button',{name:'Reply',exact:true}).click();
  await composer.getByLabel('Comments text').fill('Checked and ready');
  await composer.getByRole('button',{name:'Reply',exact:true}).click();
  await expect(comments.getByText('Checked and ready', {exact:true})).toBeVisible();
  await composer.getByLabel('Comments text').fill('Cancel this draft');
  await composer.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(composer.getByLabel('Comments text')).toHaveValue('');
  await comments.getByRole('button',{name:'Pause live comment updates'}).click();
  await page.screenshot({path:info.outputPath('comments-reference.png'),animations:'disabled'});
  await thread.getByRole('checkbox',{name:'Resolve discussion'}).click();
  await expect(thread.getByRole('checkbox',{name:'Reopen discussion'})).toBeChecked();
  await comments.getByLabel('Comments filter').selectOption('open');
  await expect(comments.getByText('Review the wiring here',{exact:true})).toHaveCount(0);
  await comments.getByLabel('Comments filter').selectOption('resolved');
  await expect(thread).toBeVisible();
  await expect(comments.locator('[data-icon-missing]')).toHaveCount(0);
  await page.reload();await panel(page,'Comments');
  await expect(comments.getByRole('button',{name:'Follow live comment updates'})).toHaveAttribute('aria-pressed','false');
  await expect(thread.getByRole('checkbox',{name:'Reopen discussion'})).toBeChecked();
  await expect(thread.getByRole('img',{name:'Wiring.png'})).toBeVisible();
  await expect(comments.getByText('Checked and ready',{exact:true})).toBeVisible();
  await openAppSettings(page);
  const settings=page.getByRole('dialog',{name:'Aether Map settings'});
  await settings.getByRole('button',{name:'Appearance & icons',exact:true}).click();
  await settings.getByRole('combobox',{name:'Interface theme'}).selectOption('aether-studio');
  await settings.getByRole('combobox',{name:'Color mode'}).selectOption('dark');
  await settings.getByRole('button',{name:/Close/}).click();
  await expect(page.locator('html')).toHaveAttribute('data-appearance','dark');
  await page.screenshot({path:info.outputPath('comments-dark.png'),animations:'disabled'});
});

test('Document notes use a plain reading view and explicit edit/save/cancel', async({page,baseURL},info)=>{
  await signIn(page,baseURL!);
  await page.goto('/map/index.html?new=show');
  await panel(page,'Document notes');
  const notes=page.getByRole('region',{name:'Document notes',exact:true});
  await expect(notes.getByRole('textbox')).toHaveCount(0);
  const bounds=await notes.boundingBox();
  await notes.getByRole('button',{name:'Edit document notes'}).click();
  const editor=notes.getByRole('textbox',{name:'Document notes text'});
  await expect(editor).toBeFocused();
  await editor.fill('this is a description of the file\nSecond paragraph.');
  await notes.getByRole('button',{name:'Save notes'}).click();
  await expect(editor).toHaveCount(0);
  await expect(notes.getByText('this is a description of the file\nSecond paragraph.',{exact:true})).toBeVisible();
  expect((await notes.boundingBox())?.width).toBe(bounds?.width);
  await notes.getByRole('button',{name:'Edit document notes'}).click();
  await editor.fill('Unsaved draft');
  await notes.getByRole('button',{name:'Refresh document notes'}).click();
  await expect(editor).toHaveValue('Unsaved draft');
  await editor.press('Escape');
  await expect(editor).toHaveCount(0);
  await expect(notes.getByRole('button',{name:'Edit document notes'})).toBeFocused();
  await expect(notes.getByText('Unsaved draft')).toHaveCount(0);
  await page.reload();await panel(page,'Document notes');
  await expect(notes.getByText('this is a description of the file\nSecond paragraph.',{exact:true})).toBeVisible();
  await expect(notes.locator('[data-icon-missing]')).toHaveCount(0);
  await page.screenshot({path:info.outputPath('notes-light.png'),animations:'disabled'});
  await openAppSettings(page);
  const settings=page.getByRole('dialog',{name:'Aether Map settings'});
  await settings.getByRole('button',{name:'Appearance & icons',exact:true}).click();
  await settings.getByRole('combobox',{name:'Interface theme'}).selectOption('aether-studio');
  await settings.getByRole('combobox',{name:'Color mode'}).selectOption('dark');
  await settings.getByRole('button',{name:/Close/}).click();
  await expect(page.locator('html')).toHaveAttribute('data-appearance','dark');
  await page.screenshot({path:info.outputPath('notes-dark.png'),animations:'disabled'});
});
