"""Generate bundled FR/DE neural speech, not human recordings.

Install sherpa-onnx and soundfile; FFmpeg is required. Obtain the Siwis/Thorsten
Piper model archives linked in src/audio/NEURAL-VOICES.md, extract them, and pass
--models /path/to/the/two/model/directories. No model or Python runs in the game.
"""
from pathlib import Path
import argparse,base64,json,subprocess,tempfile
import sherpa_onnx
import soundfile as sf
root=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--models',type=Path,required=True);args=parser.parse_args()
texts=json.loads((root/'src/audio/voice-texts.json').read_text())
fr=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {NOTE_AUDIO} from './src/audio/notes-data.js';console.log(JSON.stringify(Object.fromEntries(Object.entries(NOTE_AUDIO).map(([k,v])=>[k,v.text]))))"],cwd=root))
texts['fr']=fr
international=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {INTERNATIONAL_AUDIO} from './src/audio/international-data.js';console.log(JSON.stringify(INTERNATIONAL_AUDIO))"],cwd=root))
for lang,model_name in [('fr','fr_FR-siwis-medium'),('de','de_DE-thorsten-medium')]:
    directory=args.models/('vits-piper-'+model_name)
    config=sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(vits=sherpa_onnx.OfflineTtsVitsModelConfig(model=str(directory/(model_name+'.onnx')),tokens=str(directory/'tokens.txt'),data_dir=str(directory/'espeak-ng-data')),num_threads=2,debug=False))
    if not config.validate():raise RuntimeError('Invalid speech model')
    tts=sherpa_onnx.OfflineTts(config);pack={}
    with tempfile.TemporaryDirectory(prefix='rally-neural-') as temporary:
        for code,text in texts[lang].items():
            audio=tts.generate(text,sid=0,speed=1.12 if lang=='fr' else 1.08)
            wav=Path(temporary)/'voice.wav';ogg=Path(temporary)/'voice.ogg';sf.write(wav,audio.samples,audio.sample_rate)
            subprocess.run(['ffmpeg','-loglevel','error','-y','-i',str(wav),'-af','highpass=f=95,lowpass=f=8500,loudnorm=I=-18:TP=-2:LRA=5','-ac','1','-ar','22050','-c:a','libvorbis','-q:a','4',str(ogg)],check=True)
            pack[code]={'text':text,'url':'data:audio/ogg;base64,'+base64.b64encode(ogg.read_bytes()).decode(),'kind':'neural'}
            print(lang,code,flush=True)
    if lang=='fr':(root/'src/audio/notes-data.js').write_text('// French neural speech (Siwis/Piper), not human recordings. See NEURAL-VOICES.md.\nexport const NOTE_AUDIO='+json.dumps(pack,ensure_ascii=False,separators=(',',':'))+';\n')
    else:international['de']=pack
(root/'src/audio/international-data.js').write_text('// EN: AB recorded core and synthetic supplements. DE: neural Thorsten/Piper. See audio licenses.\nexport const INTERNATIONAL_AUDIO='+json.dumps(international,ensure_ascii=False,separators=(',',':'))+';\n')
(root/'src/audio/voice-texts.json').write_text(json.dumps(texts,ensure_ascii=False,indent=2)+'\n')
