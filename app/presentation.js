import * as T from 'three';
export function makePresentation(renderer,scene){
 // Direct studio lighting avoids an expensive PMREM pass at menu startup.
 const root=new T.Group();root.name='showroom';scene.add(root);
 const floor=new T.Mesh(new T.CircleGeometry(4.6,48),new T.MeshStandardMaterial({color:0x172322,roughness:.95,metalness:0}));floor.rotation.x=-Math.PI/2;floor.position.y=-.025;root.add(floor);
 const ring=new T.Mesh(new T.RingGeometry(3.0,3.025,100),new T.MeshBasicMaterial({color:0x6f9b90,transparent:true,opacity:.4}));ring.rotation.x=-Math.PI/2;ring.position.y=-.018;root.add(ring);
 if(typeof document!=='undefined'){
  const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d'),r=g.createRadialGradient(64,64,8,64,64,64);r.addColorStop(0,'rgba(0,0,0,.7)');r.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=r;g.fillRect(0,0,128,128);
  const contact=new T.Mesh(new T.PlaneGeometry(3.0,5.1),new T.MeshBasicMaterial({map:new T.CanvasTexture(c),transparent:true,depthWrite:false}));contact.rotation.x=-Math.PI/2;contact.position.y=-.012;root.add(contact);
 }
 return{root,environment:null,dispose(){root.traverse(o=>{o.geometry?.dispose();o.material?.map?.dispose();o.material?.dispose()});root.removeFromParent()}};
}
