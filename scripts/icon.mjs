import {mkdir,writeFile} from 'node:fs/promises';
// Original RH vector mark, rasterized directly into a multi-resolution Windows
// icon. No external graphics, fonts or conversion service are required.
const white=[[9,47],[16,16],[32,16],[38,21],[36,31],[29,35],[35,47],[25,47],[20,36],[18,47]];
const hole=[[22,23],[29,23],[29,28],[21,28]];
const green=[[37,16],[45,16],[42,28],[50,28],[53,16],[61,16],[54,47],[46,47],[49,36],[41,36],[38,47],[30,47]];
function inside(x,y,points){let c=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])c=!c}return c}
function color(x,y){
 const dx=Math.max(0,12-x,x-52),dy=Math.max(0,12-y,y-52);if(dx*dx+dy*dy>144)return[0,0,0,0];
 if(y>53&&y<54.5&&x>12&&x<51)return[112,147,130,255];
 if(inside(x,y,green))return[215,255,92,255];if(inside(x,y,white)&&!inside(x,y,hole))return[240,244,232,255];
 return[14+Math.round(y/12),26+Math.round(y/16),23+Math.round(y/16),255];
}
const sizes=[16,24,32,48,64,128,256],images=[];
for(const n of sizes){
 const pixels=Buffer.alloc(n*n*4),stride=Math.ceil(n/32)*4,mask=Buffer.alloc(stride*n);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const sum=[0,0,0,0];for(let sy=0;sy<4;sy++)for(let sx=0;sx<4;sx++){const c=color((x+(sx+.5)/4)*64/n,(y+(sy+.5)/4)*64/n);for(let k=0;k<4;k++)sum[k]+=c[k]}
  const i=((n-1-y)*n+x)*4;pixels[i]=Math.round(sum[2]/16);pixels[i+1]=Math.round(sum[1]/16);pixels[i+2]=Math.round(sum[0]/16);pixels[i+3]=Math.round(sum[3]/16);if(!pixels[i+3])mask[(n-1-y)*stride+(x>>3)]|=1<<(7-x%8);
 }
 const header=Buffer.alloc(40);header.writeUInt32LE(40);header.writeInt32LE(n,4);header.writeInt32LE(n*2,8);header.writeUInt16LE(1,12);header.writeUInt16LE(32,14);header.writeUInt32LE(pixels.length+mask.length,20);images.push(Buffer.concat([header,pixels,mask]));
}
const directory=Buffer.alloc(6+sizes.length*16);directory.writeUInt16LE(1,2);directory.writeUInt16LE(sizes.length,4);let offset=directory.length;
images.forEach((data,i)=>{const at=6+i*16;directory[at]=directory[at+1]=sizes[i]===256?0:sizes[i];directory.writeUInt16LE(1,at+4);directory.writeUInt16LE(32,at+6);directory.writeUInt32LE(data.length,at+8);directory.writeUInt32LE(offset,at+12);offset+=data.length});
await mkdir(new URL('../build/',import.meta.url),{recursive:true});await writeFile(new URL('../build/icon.ico',import.meta.url),Buffer.concat([directory,...images]));
