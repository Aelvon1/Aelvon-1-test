import sys, subprocess, io
from PIL import Image, ImageDraw
sys.path.insert(0,'/home/user/Aelvon-1-test/arici-app-pub/src')
from common import font
video, out = sys.argv[1], sys.argv[2]
times = [float(x) for x in sys.argv[3].split(',')]
cols = int(sys.argv[4]) if len(sys.argv) > 4 else 6
tw, th = 270, 480
rows = (len(times)+cols-1)//cols
sheet = Image.new('RGB', (cols*(tw+6), rows*(th+26)), (40,40,40))
d = ImageDraw.Draw(sheet)
for i,t in enumerate(times):
    p = subprocess.run(['ffmpeg','-v','error','-ss',f'{t:.3f}','-i',video,'-frames:v','1','-f','image2pipe','-vcodec','png','-'],capture_output=True)
    im = Image.open(io.BytesIO(p.stdout)).convert('RGB').resize((tw,th), Image.LANCZOS)
    x=(i%cols)*(tw+6); y=(i//cols)*(th+26)
    sheet.paste(im,(x,y+26))
    d.rectangle((x,y+26,x+tw-1,y+26+int(250/4)),outline=(255,0,0)); d.rectangle((x,y+26+th-int(350/4),x+tw-1,y+26+th-1),outline=(255,0,0)); d.line((x+tw-30,y+26,x+tw-30,y+26+th),fill=(255,0,0))
    d.text((x+4,y+4),f'{t:.2f}s',fill=(255,255,255),font=font('inter',16,600))
sheet.save(out)
