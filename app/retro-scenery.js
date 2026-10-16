import * as T from 'three';

// Original game artwork. Integer rectangles and nearest-neighbour sampling keep
// the crowd crisp at every graphics setting; there are no external image loads.
function pixelTexture(width, height, paint) {
  const pixels = new Uint8Array(width * height * 4);
  function rect(x, y, w, h, color) {
    const channels = [...new T.Color(color).getHexString().match(/../g).map(v => parseInt(v, 16)), 255];
    for (let py = Math.max(0,y); py < Math.min(height,y+h); py++) for (let px = Math.max(0,x); px < Math.min(width,x+w); px++) pixels.set(channels, ((height-1-py)*width+px)*4);
  }
  paint(rect);
  const texture = new T.DataTexture(pixels, width, height, T.RGBAFormat);
  texture.colorSpace = T.SRGBColorSpace;
  texture.magFilter = texture.minFilter = T.NearestFilter;
  texture.generateMipmaps = false; texture.needsUpdate = true;
  return texture;
}

export function spectatorAtlas() {
  const jackets = [0xec563e,0x648db5,0xe7c850,0x769258,0xd8d7cd,0x855984,0x297e8b,0xd97835];
  return pixelTexture(32*jackets.length,48,rect=>{
    for(let variant=0;variant<jackets.length;variant++){
      const ox=variant*32, jacket=jackets[variant], skin=[0xe9b68d,0x9e664a,0xf1c8aa,0xbf8c67][variant%4];
      const r=(x,y,w,h,color)=>rect(ox+x,y,w,h,color);
      r(10,30,5,14,0x2b3546);r(18,30,5,14,0x344357);
      r(8,43,8,3,0x161e27);r(18,43,8,3,0x161e27);
      r(9,17,15,17,jacket);r(10,18,2,14,0x293b4b);r(21,19,2,13,0xa3a7a1);
      r(15,18,2,15,0xe3ded1);r(13,15,7,5,skin);
      r(11,6,12,11,skin);r(10,5,13,4,0x352d2b);r(10,7,3,5,0x352d2b);
      r(19,10,2,2,0x332e33);r(20,15,3,2,0x95674f);
      if(variant%3===0){
        // Photographer: bent sleeves, fingers around a camera and a bright lens.
        r(5,19,5,5,jacket);r(5,15,4,5,jacket);r(6,12,5,4,skin);
        r(23,18,4,6,jacket);r(23,14,4,5,skin);
        r(14,11,13,6,0x142331);r(19,10,6,8,0x354b5c);r(21,12,3,3,0x9dd3de);
        r(15,10,3,2,0xf0ecce);
      } else if(variant%3===1){
        // Waving spectator, with a small event pass on the jacket.
        r(5,18,5,12,jacket);r(6,29,3,4,skin);
        r(23,15,4,8,jacket);r(25,8,4,9,jacket);r(25,4,4,5,skin);
        r(13,24,5,6,0xf2f0d8);r(14,25,3,1,0xda503b);
      } else {
        r(5,18,5,13,jacket);r(6,30,3,4,skin);r(23,18,4,13,jacket);r(23,30,3,4,skin);
        r(9,4,15,3,jacket);r(10,3,11,3,jacket);r(17,9,6,2,0x25313e);
        r(10,17,13,3,0xd4d3bb);
      }
    }
  });
}

export function flashTexture() {
  return pixelTexture(32,32,r=>{
    r(14,0,4,32,0xbed9ff);r(0,14,32,4,0xbed9ff);
    r(11,8,10,16,0xe2efff);r(8,11,16,10,0xe2efff);r(13,13,6,6,0xffffff);
    for(let k=4;k<28;k+=3){r(k,k,3,3,0xecf6ff);r(29-k,k,3,3,0xecf6ff)}
  });
}

export const FICTIONAL_SPONSORS = [
  {name:'NOVA SPORT',tag:'PERFORMANCE OIL',ink:'#ffffff',paper:'#d83e38',stripe:'#f5bd40'},
  {name:'APEX 98',tag:'RALLY ENGINEERING',ink:'#17334c',paper:'#e8ece4',stripe:'#3187bd'},
  {name:'PULSE',tag:'RACE RADIO',ink:'#ffffff',paper:'#274b92',stripe:'#66d5ce'},
  {name:'NORTHSTAR',tag:'ALL TERRAIN',ink:'#f2eddb',paper:'#24493b',stripe:'#ddae48'},
  {name:'VECTOR',tag:'TYRE TECHNOLOGY',ink:'#151d30',paper:'#e8bb45',stripe:'#e85b40'},
  {name:'HORIZON',tag:'RALLY FIRST EDITION',ink:'#f0f2dd',paper:'#1e3246',stripe:'#76cfe1'}
];
