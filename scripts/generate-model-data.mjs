// Reproduce the embedded original model assets from their GPL source files.
import {readFile,writeFile} from 'node:fs/promises';
const base=new URL('../src/models/source/',import.meta.url),models={};
for(const id of ['evo','fox','cordo']){const dir=new URL(id+'/',base),obj=await readFile(new URL(id+'_wrc.obj',dir),'utf8'),wheel=await readFile(new URL(id+'_wrc_wheel.obj',dir),'utf8'),png=await readFile(new URL(id+'_wrc.png',dir));models[id]={obj,wheel,map:'data:image/png;base64,'+png.toString('base64')}}
await writeFile(new URL('../src/models/vehicles-data.js',import.meta.url),'// Trigger Rally model sources, GPL-2.0-or-later; see source/AUTHORS.txt.\nexport const VEHICLE_ASSETS='+JSON.stringify(models)+';\n');
