# Rebuild optional voice assets. Requires espeak-ng and ffmpeg on PATH.
from pathlib import Path
import os,json,subprocess,base64,zipfile,shutil
root=Path(__file__).resolve().parent.parent
import tempfile
base=Path(tempfile.mkdtemp(prefix='rally-voices-'))
texts={}
for lang,sides in [('en',('Left','Right')),('de',('Links','Rechts'))]:
 t={}
 for side,label in zip(['left','right'],sides):
  for n in range(1,7):t[side+str(n)]=f'{label} {n}.'
 if lang=='en':t.update(leftFlat='Flat left.',rightFlat='Flat right.',hairpinLeft='Hairpin left.',hairpinRight='Hairpin right.',jump='Jump.',crest='Crest.',caution='Caution.',finish='Finish. Brake after the line.',straight='Straight, flat out.',start='Three, two, one, go!',snow='Snow, slippery.',sand='Deep sand.',rough='Rough road.',brake='Brake.',dontCut="Do not cut.",**{'100':'One hundred metres.','200':'Two hundred metres.','300':'Three hundred metres.'})
 else:t.update(leftFlat='Links voll.',rightFlat='Rechts voll.',hairpinLeft='Haarnadel links.',hairpinRight='Haarnadel rechts.',jump='Sprung.',crest='Kuppe.',caution='Achtung, Gefahr.',finish='Ziel. Hinter der Linie bremsen.',straight='Geradeaus, voll.',start='Drei, zwei, eins, los!',snow='Schnee, rutschig.',sand='Tiefer Sand.',rough='Schlechte Straße.',brake='Bremsen.',dontCut='Nicht schneiden.',**{'100':'Hundert Meter.','200':'Zweihundert Meter.','300':'Dreihundert Meter.'})
 texts[lang]=t
(root/'src/audio/voice-texts.json').write_text(json.dumps(texts,ensure_ascii=False,indent=2)+'\n')
env=os.environ.copy()
espeak=os.environ.get('RALLY_ESPEAK','espeak-ng')
voices={}
for lang,t in texts.items():
 pack={}
 for code,text in t.items():
  wav=base/f'{lang}-{code}.wav';ogg=base/f'{lang}-{code}.ogg'
  subprocess.run([espeak,'-v','en-gb' if lang=='en' else 'de','-s','166','-p','39','-a','150','-w',str(wav),text],env=env,check=True,stdout=subprocess.DEVNULL)
  subprocess.run(['ffmpeg','-loglevel','error','-y','-i',str(wav),'-af','highpass=f=180,lowpass=f=4800,loudnorm=I=-17:TP=-2:LRA=6','-ac','1','-ar','22050','-c:a','libvorbis','-q:a','2',str(ogg)],check=True)
  pack[code]={'text':text,'url':'data:audio/ogg;base64,'+base64.b64encode(ogg.read_bytes()).decode(),'kind':'synthetic'}
 voices[lang]=pack
# Preserve the licensed English source WAVs verbatim. Only compose complete
# words spoken by AB; never claim these phrases were recorded for this game.
source=root/'src/audio/english-source';source.mkdir(exist_ok=True)
phrases={}
for side in ['left','right']:
 for n,word in enumerate(['Hairpin','Hard','Square','Medium','Easy','Flat'],1):phrases[side+str(n)]=[word,side.title()]
 phrases[side+'Flat']=['Flat',side.title()]
 phrases['hairpin'+side.title()]=['Hairpin',side.title()]
phrases.update(finish=['Finish'],jump=['Jump'],dontCut=['Dont','Cut'],snow=['Snow'],sand=['Sand'],rough=['Dirt'])
for code,words in phrases.items():
 listing=base/'concat.txt';listing.write_text('\n'.join("file '"+str(source/(word+'.wav'))+"'" for word in words))
 ogg=base/f'ab-{code}.ogg'
 subprocess.run(['ffmpeg','-loglevel','error','-y','-f','concat','-safe','0','-i',str(listing),'-af','highpass=f=100,lowpass=f=6500,loudnorm=I=-17:TP=-2:LRA=6','-ac','1','-ar','22050','-c:a','libvorbis','-q:a','3',str(ogg)],check=True)
 voices['en'][code]={'text':texts['en'][code],'url':'data:audio/ogg;base64,'+base64.b64encode(ogg.read_bytes()).decode(),'kind':'recorded'}
(root/'src/audio/international-data.js').write_text('// English AB recordings: GPL-2.0-or-later; DE and supplemental EN: original synthetic speech. See LICENSE.txt.\nexport const INTERNATIONAL_AUDIO='+json.dumps(voices,ensure_ascii=False,separators=(',',':'))+';\n')
shutil.rmtree(base)
print('Generated',sum(len(v) for v in voices.values()),'clips;',sum(v['kind']=='recorded' for v in voices['en'].values()),'English recordings.')
