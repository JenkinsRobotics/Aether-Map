// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { readShowTabs, reorderShowTabs, showTabLabel, showTabURL, storeShowTabs, tabKey, upsertShowTab } from './open-show-tabs';
const a={id:'a',name:'Wall.aethermap',branch:'Main'}, b={id:'b',name:'Box.aethermap',branch:'Main'};
afterEach(()=>sessionStorage.clear());
describe('open show navigation',()=>{
  it('updates renamed files in place and keeps branches distinct',()=>{
    const tabs=upsertShowTab([a,b],{...a,name:'Wall revised.aethermap'});
    expect(tabs.map(tab=>tab.name)).toEqual(['Wall revised.aethermap','Box.aethermap']);
    expect(upsertShowTab(tabs,{...a,branch:'Alternative'})).toHaveLength(3);
    expect(showTabURL({...a,id:'id & one',branch:'First / second'})).toBe('/map/index.html?document=id+%26+one&branch=First+%2F+second');
  });
  it('reorders without dropping a tab and ignores unknown drag IDs',()=>{
    expect(reorderShowTabs([a,b],tabKey(a),tabKey(b))).toEqual([b,a]);
    expect(reorderShowTabs([a,b],'missing',tabKey(b))).toEqual([a,b]);
  });
  it('scopes session metadata by account and tolerates malformed storage',()=>{
    storeShowTabs('one',[a,b,a]);expect(readShowTabs('one')).toEqual([a,b]);expect(readShowTabs('two')).toEqual([]);
    sessionStorage.setItem('aether-map.open-files.v1:one','{bad');expect(readShowTabs('one')).toEqual([]);
    sessionStorage.setItem('aether-map.open-files.v1:one',JSON.stringify([null,{id:4},a]));expect(readShowTabs('one')).toEqual([a]);
  });
});

it('shows a mutable label while retaining permanent navigation identity',()=>{
  const branch='branch-'+'a'.repeat(64), original={id:'doc',name:'Show.aethermap',branch,branchLabel:'Experiment'};
  const renamed={...original,branchLabel:'Renamed'};
  expect(tabKey(original)).toBe(tabKey(renamed));
  expect(showTabURL(original)).toBe(showTabURL(renamed));
  expect(showTabLabel(renamed)).toBe('Show · Renamed');
  expect(showTabLabel({...original,branchLabel:undefined})).toBe('Show · Workspace');
  expect(upsertShowTab([original],renamed)).toEqual([renamed]);
});
