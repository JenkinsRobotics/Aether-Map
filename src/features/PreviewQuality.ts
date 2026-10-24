import { createContext } from 'react';
/** Editor-only sampling policy. Device output retains its own rendering budget. */
export const PreviewQuality = createContext({scale:1,maxPixelCount:1920*1080});
