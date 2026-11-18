"""Render all frames in parallel and stream them to ffmpeg (H.264)."""
import os
import sys
import time
import subprocess
from multiprocessing import Pool

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import scenes
import timeline as TL
from common import W, H, FPS, ROOT


def _init():
    scenes.build_assets()


def _work(fi):
    return fi, scenes.render_frame(fi).tobytes()


def main(out_path, audio=None, procs=4):
    n = int(round(TL.T_TOTAL * FPS))
    hold_fi = int(np.ceil(TL.HOLD_START * FPS))
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}',
           '-r', str(FPS), '-i', '-']
    if audio:
        cmd += ['-i', audio, '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest']
    cmd += ['-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
            '-level', '4.2', '-maxrate', '16M', '-bufsize', '24M', '-movflags', '+faststart',
            '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', out_path]
    ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    t0 = time.time()
    todo = list(range(min(n, hold_fi + 1)))
    hold_bytes = None
    with Pool(procs, initializer=_init) as pool:
        for fi, data in pool.imap(_work, todo, chunksize=2):
            ff.stdin.write(data)
            if fi == todo[-1]:
                hold_bytes = data
            if fi % 30 == 0:
                print(f'frame {fi}/{n}  {time.time() - t0:.0f}s', flush=True)
    for fi in range(len(todo), n):
        ff.stdin.write(hold_bytes)
    ff.stdin.close()
    ff.wait()
    print('done', n, 'frames in', round(time.time() - t0, 1), 's ->', out_path)


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'build', 'video_noaudio.mp4')
    main(out, sys.argv[2] if len(sys.argv) > 2 else None)
