import sys, time
sys.path.insert(0, '/home/user/Aelvon-1-test/arici-app-pub/src')
from PIL import Image, ImageDraw
import scenes
from common import font
times = [float(x) for x in sys.argv[1].split(',')]
out = sys.argv[2]
blur = len(sys.argv) > 3 and sys.argv[3] == 'blur'
t0 = time.time(); scenes.build_assets(); print('assets', round(time.time()-t0,2))
ims = []
for t in times:
    t1 = time.time()
    im = scenes.render_frame(int(round(t*30))) if blur else scenes.render(t).convert('RGB')
    print(t, round(time.time()-t1,2))
    ims.append(im)
cols = min(5, len(ims)); rows = (len(ims)+cols-1)//cols
tw, th = 360, 640
sheet = Image.new('RGB', (cols*tw + (cols-1)*8, rows*(th+30)), (60,60,60))
d = ImageDraw.Draw(sheet)
for i, (t, im) in enumerate(zip(times, ims)):
    x = (i % cols)*(tw+8); y = (i//cols)*(th+30)
    sheet.paste(im.resize((tw, th), Image.LANCZOS), (x, y+30))
    # safe zone guides
    d.rectangle((x, y+30, x+tw-1, y+30+int(250/3)), outline=(255,0,0))
    d.rectangle((x, y+30+th-int(350/3), x+tw-1, y+30+th-1), outline=(255,0,0))
    d.line((x+tw-40, y+30, x+tw-40, y+30+th), fill=(255,0,0))
    d.text((x+4, y+6), f't={t:.2f}s', fill=(255,255,255), font=font('inter', 18, 600))
sheet.save(out)
