// A single policy is shared by race setup, assists, collision damage and score-only rivals.
// Pace multiplies rival times, so a larger value makes the event easier to win.
export const DIFFICULTIES=Object.freeze([
  {id:'superEasy',label:'Super Facile',pace:1.5,assist:'comfort',damageMultiplier:.35,hardcore:false},
  {id:'easy',label:'Facile',pace:1.22,assist:'comfort',damageMultiplier:.6,hardcore:false},
  {id:'medium',label:'Moyen',pace:1,assist:'sport',damageMultiplier:1,hardcore:false},
  {id:'hard',label:'Dur',pace:.93,assist:'expert',damageMultiplier:1,hardcore:false},
  {id:'hardcore',label:'Hardcore',pace:.90,assist:'expert',damageMultiplier:1.2,hardcore:true}
].map(Object.freeze));

const legacy={casual:'easy',club:'medium',pro:'hard'};
export function normalizeDifficulty(id,legacyAI){
  if(DIFFICULTIES.some(d=>d.id===id))return id;
  return Object.hasOwn(legacy,id)?legacy[id]:Object.hasOwn(legacy,legacyAI)?legacy[legacyAI]:'medium';
}
export function difficultyFor(id){return DIFFICULTIES.find(d=>d.id===normalizeDifficulty(id));}
export function legacyAIFor(id){
  const difficulty=normalizeDifficulty(id);
  return difficulty==='superEasy'||difficulty==='easy'?'casual':difficulty==='medium'?'club':'pro';
}
