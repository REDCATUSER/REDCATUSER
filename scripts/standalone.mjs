import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
const html=await readFile(new URL('../src/index.html',import.meta.url),'utf8');
const css=await readFile(new URL('../src/style.css',import.meta.url),'utf8');
const js=await readFile(new URL('../src/game.js',import.meta.url),'utf8');
const license=await readFile(new URL('../THIRD_PARTY_NOTICES.txt',import.meta.url),'utf8');
const sourceDir=new URL('../src/audio/english-source/',import.meta.url);
const clips=Object.fromEntries(await Promise.all((await readdir(sourceDir)).filter(name=>name.endsWith('.wav')).map(async name=>[name,'data:audio/wav;base64,'+(await readFile(new URL(name,sourceDir))).toString('base64')])));
const recordingSources=JSON.stringify({author:'Andrei Bondor / Trigger Rally',license:'GPL-2.0-or-later',description:'Unmodified source WAV recordings for the English AB sound assets.',clips});
async function sourceFiles(directory,prefix=''){const result={};for(const entry of await readdir(directory,{withFileTypes:true})){const url=new URL(entry.name+(entry.isDirectory()?'/':''),directory),name=prefix+entry.name;if(entry.isDirectory())Object.assign(result,await sourceFiles(url,name+'/'));else result[name]=(await readFile(url)).toString('base64')}return result}
const modelSources=JSON.stringify({license:'GPL-2.0-or-later',description:'Unmodified Trigger Rally OBJ/MTL/PNG sources, vehicle definitions, authors and GPL text; file values are base64.',files:await sourceFiles(new URL('../src/models/source/',import.meta.url))});
const output=html.replace('<link rel="stylesheet" href="style.css">',()=>`<style>${css}</style>`).replace('<script src="game.js"></script>',()=>`<script id="recordingSources" type="application/json">${recordingSources}</script><script id="modelSources" type="application/json">${modelSources}</script><script>${js.replace(/<\/script/gi,'<\\/script')}</script>`);
await mkdir(new URL('../dist/',import.meta.url),{recursive:true});
await writeFile(new URL('../dist/Rally-Horizon-3D.html',import.meta.url),output+'\n<!--\n'+license.replace(/-->/g,'-- >')+'\n-->\n');
