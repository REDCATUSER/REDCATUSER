import * as T from 'three';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {VEHICLE_ASSETS} from '../src/models/vehicles-data.js';
const loader=new OBJLoader();
const selections={club:'evo',escort:'cordo',delta:'fox'};
export const assetFor=id=>selections[id];
export function assetBody(id,{length,width,roof},onChange){
 const source=VEHICLE_ASSETS[selections[id]],object=loader.parse(source.obj),bounds=new T.Box3().setFromObject(object),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
 const material=new T.MeshStandardMaterial({roughness:.55,metalness:.12}),image=typeof Image!=='undefined'?new Image():null;let color='#4088d8',disposed=false;
 const texture=new T.Texture();texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;if(image)material.map=texture;
 function paint(next=color){if(next===color&&texture.image)return;color=next;if(!image?.complete||!image.naturalWidth||disposed)return;const c=document.createElement('canvas');c.width=c.height=512;const g=c.getContext('2d');g.drawImage(image,0,0,512,512);const pixels=g.getImageData(0,0,512,512),target=new T.Color(color),srgb=target.clone().convertLinearToSRGB();
  for(let i=0;i<pixels.data.length;i+=4){const r=pixels.data[i],gg=pixels.data[i+1],b=pixels.data[i+2],blue=b>r*1.3&&b>gg*1.25&&b>45,gold=id==='delta'&&r>b*1.6&&gg>b*1.5&&Math.abs(r-gg)<65,brown=id==='escort'&&r>gg*1.4&&gg>b*1.5&&gg>25&&r<190;if(blue||gold||brown){const light=Math.max(.12,Math.max(r,gg,b)/255);pixels.data[i]=srgb.r*255*light;pixels.data[i+1]=srgb.g*255*light;pixels.data[i+2]=srgb.b*255*light}}
  g.putImageData(pixels,0,0);texture.image=c;texture.needsUpdate=true;onChange?.();
 }
 if(image){image.onload=()=>paint();image.src=source.map;}
 object.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position,n=o.geometry.attributes.normal;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);p.setXYZ(i,(x-center.x)/size.x*width,(z-bounds.min.z)/size.z*(roof-.30)+.30,-(y-center.y)/size.y*length);if(n){const nx=n.getX(i),ny=n.getY(i),nz=n.getZ(i);n.setXYZ(i,nx,nz,-ny)}}o.geometry.deleteAttribute('normal');const old=o.geometry;o.geometry=mergeVertices(old);old.dispose();o.geometry.computeVertexNormals();o.geometry.computeBoundingSphere();o.material=material;o.castShadow=true;o.receiveShadow=true;o.name='artist-rally-body';});
 return{object,material,paint,dispose(){disposed=true;if(image)image.onload=null;texture.dispose()}};
}
