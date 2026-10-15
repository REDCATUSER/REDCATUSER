import {readFile,writeFile,mkdir} from 'node:fs/promises';
const html=await readFile(new URL('../src/index.html',import.meta.url),'utf8');
const css=await readFile(new URL('../src/style.css',import.meta.url),'utf8');
const js=await readFile(new URL('../src/game.js',import.meta.url),'utf8');
const license=await readFile(new URL('../THIRD_PARTY_NOTICES.txt',import.meta.url),'utf8');
const output=html.replace('<link rel="stylesheet" href="style.css">',()=>`<style>${css}</style>`).replace('<script src="game.js"></script>',()=>`<script>${js.replace(/<\/script/gi,'<\\/script')}</script>`);
await mkdir(new URL('../dist/',import.meta.url),{recursive:true});
await writeFile(new URL('../dist/Rally-Horizon-3D.html',import.meta.url),output+'\n<!--\n'+license.replace(/-->/g,'-- >')+'\n-->\n');
