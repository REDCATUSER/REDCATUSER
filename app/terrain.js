// Four tire contact patches define the chassis plane. Pitch/cross-slope are
// angles in radians; height gradients must never be passed as angles directly.
export function sampleTerrain(heightAt,x,z,yaw,{wheelbase=2.48,track=1.78}={}){
 const fx=-Math.sin(yaw),fz=-Math.cos(yaw),rx=Math.cos(yaw),rz=-Math.sin(yaw);
 const contacts=[];
 for(const front of [1,-1])for(const right of [-1,1]){
  const px=x+fx*front*wheelbase/2+rx*right*track/2,pz=z+fz*front*wheelbase/2+rz*right*track/2;
  contacts.push(heightAt(px,pz));
 }
 const front=(contacts[0]+contacts[1])/2,rear=(contacts[2]+contacts[3])/2;
 const left=(contacts[0]+contacts[2])/2,right=(contacts[1]+contacts[3])/2;
 return{height:contacts.reduce((a,b)=>a+b,0)/4,pitch:Math.atan2(front-rear,wheelbase),roll:Math.atan2(right-left,track),contacts};
}
