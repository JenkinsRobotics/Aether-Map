import type {ApplicationUpdate} from '@aether/ui';
import {AppUpdateArtwork} from '@aether/session/home/artwork';
const features = [
  {id:'surfaces',title:'Make every surface a canvas',description:'Position and warp projection surfaces to fit the physical shapes in your show.',status:'Available',scene:'projection',color:'#bbb4e3'},
  {id:'effects',title:'Shape your visual look',description:'Layer source effects such as blur, rotation and color cycling, with controls saved in your show.',status:'Available',scene:'effects',color:'#edc79d'},
  {id:'more-effects',title:'More ways to transform light',description:'Kaleidoscope, fisheye and vintage effects are planned additions to the visual effects collection.',status:'Planned',scene:'effects',color:'#9ebfcf'},
 ];
export const updates:ApplicationUpdate[] = features.map(({scene,...item})=>({...item,status:item.status as ApplicationUpdate['status'],artwork:<AppUpdateArtwork scene={scene as Parameters<typeof AppUpdateArtwork>[0]['scene']}/>}));
