import { combineSurfaces } from './regions';
self.onmessage=event=>{try{const {show,ids,operation,tolerance}=event.data;self.postMessage({result:combineSurfaces(show,ids,operation,tolerance)});}catch(error){self.postMessage({error:(error as Error).message});}};
