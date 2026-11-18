import sys, json, wave, math
import numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0,'/home/user/Aelvon-1-test/arici-app-pub/src')
from scipy import signal
from common import font
def rd(p):
    w=wave.open(p); x=np.frombuffer(w.readframes(w.getnframes()),np.int16).astype(np.float32)/32768
    return x.reshape(-1,w.getnchannels()).mean(1), w.getframerate()
mix,sr=rd('build/mix.wav'); v,_=rd('build/stem_voice.wav'); bed,_=rd('build/stem_bed.wav')
info=json.load(open('build/mix_info.json'))
print('dur', len(mix)/sr)
for k,t0 in info['voice_slots'].items():
    d=info['voice_durations'][k]; a,b=int(t0*sr),int((t0+d)*sr)
    rv=20*np.log10(np.sqrt((v[a:b]**2).mean())+1e-9); rb=20*np.log10(np.sqrt((bed[a:b]**2).mean())+1e-9)
    print(k, f'{t0:.2f}-{t0+d:.2f}', 'voice %.1f dB  bed %.1f dB  => voice/bed %+.1f dB'%(rv,rb,rv-rb))
# spectrogram
f,t,Z=signal.stft(mix,sr,nperseg=2048,noverlap=2048-480)
S=20*np.log10(np.abs(Z)+1e-7)
fmax=12000; S=S[f<=fmax]
img=np.clip((S+100)/80,0,1)[::-1]
Wd=1800; Hs=400
im=Image.fromarray((img*255).astype(np.uint8)).resize((Wd,Hs))
im=Image.merge('RGB',(im, im.point(lambda q:int(q*0.7)), im.point(lambda q:int(q*0.3))))
canvas=Image.new('RGB',(Wd,Hs+240),(20,20,20)); canvas.paste(im,(0,0))
d=ImageDraw.Draw(canvas)
T=len(mix)/sr
def X(tt): return int(tt/T*Wd)
# waveform voice/bed
for name,sig,y0,col in (('voice',v,Hs+20,(120,200,255)),('bed',bed,Hs+130,(255,180,90))):
    env=np.array([np.abs(sig[i:i+sr//100]).max() for i in range(0,len(sig),sr//100)])
    for i,e in enumerate(env):
        x=int(i/len(env)*Wd); h=int(e*45); d.line((x,y0+45-h,x,y0+45+h),fill=col)
    d.text((4,y0),name,fill=col)
for tt,lab in [(0,'S1'),(2.5,'S2'),(6,'S3'),(6.86,'tap'),(6.95,'spin'),(9.3,'stop'),(10,'S4'),(11.6,'count end'),(13,'S5'),(13.26,'gift'),(13.5,'lid'),(15.08,'bip'),(15.5,'S6'),(15.98,'land'),(16.06,'hold')]:
    d.line((X(tt),0,X(tt),Hs+240),fill=(255,255,255)); d.text((X(tt)+2,2),lab,fill=(255,255,255),font=font('inter',16,600))
canvas.save('build/check/audio_spectro.png')
