import {updates} from './updates';
import { ApplicationHome } from '@aether/session/home';
import type { AppHomeDefinition } from '@aether/session/home/types';
import { createDocument } from '../create-document';

export const homeDefinition: AppHomeDefinition = {updates,
    brand: "Aether Map",
    appIcon: "map",
    appUrl: "./index.html",
    accept: ".aethermap",
    uploadPattern: /\.aethermap$/i,
    uploadHint: "Import an .aethermap show.",
    heroLead: "Create a show, pick up recent work, or bring an existing mapping into your library.",
    emptyHint: "Create a Show to get started.",
    fallbackIcon: "file-show",
    types: [
      { id: "show", label: "Shows", icon: "file-show", test: /\.aethermap$/ },
    ],
    menu: [["folder","Folder","file-folder"],["show","Show","file-show"],["import","Import file…","import"]],
    start: [
      { kind: "show", title: "Show", tagline: "Map projections onto physical geometry", icon: "file-show", action: "new-doc" },
      { kind: "surface", title: "Surface", tagline: "Warp a quad onto a real shape", icon: "layers", tooltip: "Surfaces are authored inside an open show." },
      { kind: "device", title: "Output device", tagline: "Set up and manage your players", icon: "hardware", action:"navigate", href:"./index.html?devices", requiresStudio:true },
    ],
  navigation:[{id:"players",label:"Players",icon:"hardware",href:"./index.html?devices",requiresStudio:true}],create:async(_kind,name,{storage,destination})=>storage.createFile(await createDocument(name),destination),
};
export function Home(){return <ApplicationHome definition={homeDefinition}/>;}
