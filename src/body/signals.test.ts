import { expect, test } from 'vitest';
import { bodyLevels, bodySignals, DEFAULT_BODY_SETTINGS, readBodySettings, readBodySignals, smoothBodySignals, type BodyLandmark } from './signals';
export function pose():BodyLandmark[]{
 const points=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1}));
 points[11]={...points[11],x:.3,y:.2};points[12]={...points[12],x:.5,y:.2};
 points[23]={...points[23],x:.3,y:.6};points[24]={...points[24],x:.5,y:.6};
 points[15]={...points[15],x:.1,y:.1};points[16]={...points[16],x:.9,y:.4};
 points[0].y=.05;points[27].y=.9;points[28].y=.85;return points;
}
test('anatomical measurements, camera mirror, lean and visible body height have explicit normalized meanings',()=>{
 const points=pose(),settings={...DEFAULT_BODY_SETTINGS,mirror:false};
 const value=bodySignals(points,settings);expect(value).toMatchObject({x:.4,y:.6,leftHand:.9,rightHand:.6,spread:.8,lean:.5,presence:1});expect(value.size).toBeCloseTo(.85);
 const mirrored=bodySignals(points,{...settings,mirror:true});expect(mirrored.x).toBeCloseTo(.6);expect(mirrored.leftHand).toBe(.9);
 points[11].x+=.2;points[12].x+=.2;expect(bodySignals(points,settings).lean).toBeCloseTo(.75);expect(bodySignals(points,{...settings,mirror:true}).lean).toBeCloseTo(.25);
});
test('loss of a wrist removes only its signals; loss of torso clears everything, including presence',()=>{
 const points=pose();points[15].visibility=.1;const partial=bodySignals(points,DEFAULT_BODY_SETTINGS);
 expect(partial.leftHand).toBeUndefined();expect(partial.spread).toBeUndefined();expect(partial.rightHand).toBe(.6);
 points[23].visibility=.1;expect(bodySignals(points,DEFAULT_BODY_SETTINGS)).toEqual({});
 expect(bodySignals([],DEFAULT_BODY_SETTINGS)).toEqual({});points[23].visibility=1;points[12].x=NaN;expect(bodySignals(points,DEFAULT_BODY_SETTINGS)).toEqual({});
});
test('smoothing is frame-rate independent and never latches missing landmarks',()=>{
 const once=smoothBodySignals({x:0},{x:1},.2,.5);
 const twice=smoothBodySignals(smoothBodySignals({x:0},{x:1},.1,.5),{x:1},.1,.5);
 expect(once.x).toBeCloseTo(twice.x!);expect(smoothBodySignals({x:1,leftHand:1},{x:0,presence:1},.1,0)).toEqual({x:0,presence:1});
 expect(smoothBodySignals({x:1},{},.1,2)).toEqual({});
});
test('device preferences and remote values are bounded; body input cannot overwrite audio keys',()=>{
 expect(readBodySettings({smoothingS:99,confidence:-1,mirror:false})).toMatchObject({smoothingS:2,confidence:.1,mirror:false});
 expect(readBodySettings({smoothingS:NaN})).toEqual(DEFAULT_BODY_SETTINGS);
 expect(bodyLevels(readBodySignals({x:2,y:-1,size:NaN,leftHand:Infinity,level:1,beat:1}))).toEqual({'body:x':1,'body:y':0});
});
