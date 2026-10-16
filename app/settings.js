// Physical KeyboardEvent.code bindings keep left Ctrl distinct from right Ctrl.
export const ACTIONS = [
  ['throttle','Accélérer'],['brake','Freiner / reculer'],['left','Tourner à gauche'],['right','Tourner à droite'],
  ['handbrake','Frein à main'],['shiftUp','Monter un rapport'],['shiftDown','Descendre un rapport'],
  ['transmission','Boîte auto / manuelle'],['camera','Changer de caméra'],['chase','Vue poursuite'],
  ['hood','Vue capot'],['cockpit','Vue pilote'],['headlights','Phares'],['recover','Replacer la voiture'],['pause','Pause'],['mute','Activer / couper le son']
];
export const DEFAULT_BINDINGS = {
  throttle:['ArrowUp','KeyZ','KeyW'],brake:['ArrowDown','KeyS'],left:['ArrowLeft','KeyQ','KeyA'],right:['ArrowRight','KeyD'],
  handbrake:['Space'],shiftUp:['ShiftLeft','ShiftRight'],shiftDown:['ControlLeft'],transmission:['KeyM'],camera:['KeyC'],
  chase:['Digit1'],hood:['Digit2'],cockpit:['Digit3'],headlights:['KeyH'],recover:['KeyR'],pause:['Escape'],mute:['KeyV']
};
export const RESOLUTIONS=['native','1280x720','1600x900','1920x1080','2560x1440'];
export const DEFAULT_SETTINGS={manual:false,camera:0,volume:72,copilot:true,quality:'medium',textureQuality:'medium',
  resolution:'native',windowMode:'windowed',language:'fr',musicVolume:22,engineVolume:100,copilotVolume:100,effectsVolume:75,bindings:DEFAULT_BINDINGS};
export function validKey(code){return typeof code==='string'&&/^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|Escape|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Tab|Enter|Backspace|Delete|Insert|Home|End|Page(Up|Down)|F([1-9]|1[0-2])|Numpad[0-9]|Numpad(Add|Subtract|Multiply|Divide|Decimal|Enter)|Comma|Period|Slash|Semicolon|Quote|Bracket(Left|Right)|Backslash|Minus|Equal|Backquote|CapsLock)$/.test(code)}
export function normalizeBindings(value){
  const used=new Set(),result={};
  for(const [action] of ACTIONS){
    const codes=Array.isArray(value?.[action])?value[action]:DEFAULT_BINDINGS[action];
    result[action]=[];
    for(const code of codes){if(result[action].length===3)break;if(!validKey(code)||used.has(code))continue;used.add(code);result[action].push(code)}
  }
  return result;
}
export function normalizeSettings(value={}){
  const out={...DEFAULT_SETTINGS,bindings:normalizeBindings(value?.bindings)};
  for(const field of ['manual','copilot'])if(typeof value?.[field]==='boolean')out[field]=value[field];
  if([0,1,2].includes(value?.camera))out.camera=value.camera;
  for(const field of ['volume','musicVolume','engineVolume','copilotVolume','effectsVolume'])
    if(typeof value?.[field]==='number'&&Number.isFinite(value[field]))out[field]=Math.max(0,Math.min(100,value[field]));
  for(const field of ['quality','textureQuality'])if(['low','medium','high'].includes(value?.[field]))out[field]=value[field];
  if(RESOLUTIONS.includes(value?.resolution))out.resolution=value.resolution;
  if(['windowed','fullscreen'].includes(value?.windowMode))out.windowMode=value.windowMode;
  if(['fr','en','de'].includes(value?.language))out.language=value.language;
  return out;
}
export const held=(keys,bindings,action)=>(bindings[action]||[]).some(code=>keys.has(code));
export const matches=(bindings,action,code)=>(bindings[action]||[]).includes(code);
export function keyLabel(code){
  const names={ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',Space:'Espace',Escape:'Échap',ShiftLeft:'Maj G',ShiftRight:'Maj D',ControlLeft:'Ctrl G',ControlRight:'Ctrl D',AltLeft:'Alt G',AltRight:'Alt D',Delete:'Suppr',Backspace:'Retour',Enter:'Entrée'};
  return names[code]||code?.replace(/^Key|^Digit/,'')||'—';
}
