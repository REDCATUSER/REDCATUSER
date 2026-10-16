"""Generate bundled neural FR/DE packs and numeric English cues.

Install sherpa-onnx, numpy and soundfile; FFmpeg is required. Obtain the three
Piper archives linked in src/audio/NEURAL-VOICES.md and extract into --models.
No model or Python runs in the game. Matching English AB recordings are kept.
"""
from pathlib import Path
import argparse,base64,json,subprocess,tempfile
import numpy as np
import sherpa_onnx
import soundfile as sf
root=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--models',type=Path,required=True);args=parser.parse_args()
texts=json.loads((root/'src/audio/voice-texts.json').read_text())
international=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {INTERNATIONAL_AUDIO} from './src/audio/international-data.js';console.log(JSON.stringify(INTERNATIONAL_AUDIO))"],cwd=root))
for lang,model_name in [('fr','fr_FR-siwis-medium'),('de','de_DE-thorsten-medium'),('en','en_US-ljspeech-medium')]:
    directory=args.models/('vits-piper-'+model_name)
    config=sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(vits=sherpa_onnx.OfflineTtsVitsModelConfig(model=str(directory/(model_name+'.onnx')),tokens=str(directory/'tokens.txt'),data_dir=str(directory/'espeak-ng-data')),num_threads=2,debug=False))
    if not config.validate():raise RuntimeError('Invalid speech model')
    tts=sherpa_onnx.OfflineTts(config);pack={}
    with tempfile.TemporaryDirectory(prefix='rally-neural-') as temporary:
        for code,text in texts[lang].items():
            # AB says "Hard left", not "Left two": numeric cues are regenerated.
            old=international.get('en',{}).get(code,{})
            numeric=code.startswith(('left','right')) and code[-1:].isdigit()
            if lang=='en' and old.get('kind')=='recorded' and not numeric:
                pack[code]=old
                continue
            countdown=code.startswith('count') or code=='go'
            speed=1.28 if countdown else (1.12 if lang=='fr' else 1.08)
            audio=tts.generate(text,sid=0,speed=speed)
            samples=np.asarray(audio.samples,dtype=np.float32)
            # Strip model padding so short words follow the start lights.
            voiced=np.flatnonzero(np.abs(samples)>max(.002,float(np.max(np.abs(samples)))*.016))
            if len(voiced):
                pad=int(audio.sample_rate*.025)
                samples=samples[max(0,voiced[0]-pad):min(len(samples),voiced[-1]+pad+1)]
            wav=Path(temporary)/'voice.wav';ogg=Path(temporary)/'voice.ogg';sf.write(wav,samples,audio.sample_rate)
            subprocess.run(['ffmpeg','-loglevel','error','-y','-i',str(wav),'-af','highpass=f=95,lowpass=f=8500,loudnorm=I=-18:TP=-2:LRA=5','-ac','1','-ar','22050','-c:a','libvorbis','-q:a','4',str(ogg)],check=True)
            pack[code]={'text':text,'url':'data:audio/ogg;base64,'+base64.b64encode(ogg.read_bytes()).decode(),'kind':'neural'}
            print(lang,code,round(len(samples)/audio.sample_rate,3),flush=True)
    if lang=='fr':(root/'src/audio/notes-data.js').write_text('// French neural speech (Siwis/Piper), not human recordings. See NEURAL-VOICES.md.\nexport const NOTE_AUDIO='+json.dumps(pack,ensure_ascii=False,separators=(',',':'))+';\n')
    else:international[lang]=pack
(root/'src/audio/international-data.js').write_text('// EN: neural LJ Speech/Piper numeric cues with AB recorded supplements. DE: neural Thorsten/Piper. See audio licenses.\nexport const INTERNATIONAL_AUDIO='+json.dumps(international,ensure_ascii=False,separators=(',',':'))+';\n')
