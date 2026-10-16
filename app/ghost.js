import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {sampleTerrain} from './terrain.js';
export function makeGhost(scene){
 const root=new T.Group();root.name='personal-best-ghost';root.visible=false;scene.add(root);
 const material=new T.MeshBasicMaterial({color:0x64e6e3,transparent:true,opacity:.22,depthWrite:false});
 const shapes=[[1.78,.58,3.9,0,.70,0],[1.4,.59,1.63,0,1.29,.12]];
 for(const [w,h,d,x,y,z]of shapes){const mesh=new T.Mesh(new RoundedBoxGeometry(w,h,d,2,.17),material);mesh.position.set(x,y,z);root.add(mesh)}
 const outline=new T.LineSegments(new T.EdgesGeometry(root.children[0].geometry,30),new T.LineBasicMaterial({color:0xa2ffff,transparent:true,opacity:.45,depthWrite:false}));outline.position.copy(root.children[0].position);root.add(outline);
 return{root,update(sample,heightAt,player,cameraMode){if(!sample){root.visible=false;return}const distance=Math.hypot(sample.x-player.x,sample.z-player.z);root.visible=distance>5&&distance<350;if(!root.visible)return;material.opacity=Math.min(.23,Math.max(0,(distance-5)/35))*(cameraMode===2?.65:1);const contact=sampleTerrain(heightAt,sample.x,sample.z,sample.yaw);root.position.set(sample.x,contact.height+.04,sample.z);root.rotation.set(contact.pitch,sample.yaw,contact.roll,'YXZ')},dispose(){root.traverse(o=>{o.geometry?.dispose();o.material?.dispose()});root.removeFromParent()}};
}
