"""Mux the rendered picture with the -14 LUFS mix into the delivery MP4."""
import os, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
video = os.path.join(ROOT, 'build', 'video_noaudio.mp4')
audio = os.path.join(ROOT, 'build', 'mix.wav')
out = os.path.join(ROOT, 'out', 'ARICI_Application_Reels.mp4')
os.makedirs(os.path.dirname(out), exist_ok=True)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', video, '-i', audio, '-map', '0:v:0', '-map', '1:a:0',
                '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2',
                '-metadata', 'title=ARICI - Application', '-movflags', '+faststart', '-shortest', out], check=True)
print(out)
