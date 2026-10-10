# Membuat ikon aplikasi (adaptive + legacy) -> folder icons/
from PIL import Image, ImageDraw
import os
S = 1024
NAVY, GRID, MARK, SHADOW = (27,35,64), (36,46,84), (255,216,77), (62,80,150)

def background():
    im = Image.new('RGB', (S, S), NAVY); d = ImageDraw.Draw(im)
    for i in range(0, S + 1, 64):
        d.line([(i, 0), (i, S)], fill=GRID, width=3); d.line([(0, i), (S, i)], fill=GRID, width=3)
    return im

def foreground():
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    x0, y0, x1, y1 = 290, 280, 734, 724
    d.rounded_rectangle((x0 + 26, y0 + 26, x1 + 26, y1 + 26), 78, fill=SHADOW)   # bayangan keras
    d.rounded_rectangle((x0, y0, x1, y1), 78, fill=MARK)                          # halaman stabilo
    c = (512, 502)
    sats = [(398, 392), (632, 396), (630, 626), (394, 618)]
    for s in sats: d.line([c, s], fill=NAVY, width=22)
    for s in sats: d.ellipse((s[0]-36, s[1]-36, s[0]+36, s[1]+36), fill=NAVY)
    d.ellipse((c[0]-62, c[1]-62, c[0]+62, c[1]+62), fill=NAVY)
    d.ellipse((c[0]-24, c[1]-24, c[0]+24, c[1]+24), fill=MARK)
    return im

def legacy(shape):
    base = background().convert('RGBA')
    fg = foreground(); z = 1.32
    fg = fg.resize((int(S*z), int(S*z)), Image.LANCZOS); o = (S - fg.width)//2
    base.alpha_composite(fg, (o, o))
    mask = Image.new('L', (S, S), 0); m = ImageDraw.Draw(mask)
    if shape == 'round': m.ellipse((0, 0, S-1, S-1), fill=255)
    else: m.rounded_rectangle((0, 0, S-1, S-1), 230, fill=255)
    base.putalpha(mask); return base

dens = {'mdpi': (48, 108), 'hdpi': (72, 162), 'xhdpi': (96, 216), 'xxhdpi': (144, 324), 'xxxhdpi': (192, 432)}
fg, sq, rd = foreground(), legacy('square'), legacy('round')
for k, (l, a) in dens.items():
    p = f'icons/mipmap-{k}'; os.makedirs(p, exist_ok=True)
    sq.resize((l, l), Image.LANCZOS).save(f'{p}/ic_launcher.png')
    rd.resize((l, l), Image.LANCZOS).save(f'{p}/ic_launcher_round.png')
    fg.resize((a, a), Image.LANCZOS).save(f'{p}/ic_launcher_foreground.png')
os.makedirs('icons/mipmap-anydpi-v26', exist_ok=True); os.makedirs('icons/values', exist_ok=True)
adaptive = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
'''
for n in ('ic_launcher', 'ic_launcher_round'): open(f'icons/mipmap-anydpi-v26/{n}.xml', 'w').write(adaptive)
open('icons/values/ic_launcher_background.xml', 'w').write('''<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#1B2340</color>
</resources>
''')
# pratinjau
prev = Image.new('RGBA', (1100, 540), (243, 245, 249, 255))
prev.alpha_composite(sq.resize((480, 480), Image.LANCZOS), (30, 30))
prev.alpha_composite(rd.resize((480, 480), Image.LANCZOS), (590, 30))
prev.convert('RGB').save('/mnt/user-data/outputs/icon-preview.png')
sq.resize((512, 512), Image.LANCZOS).save('/mnt/user-data/outputs/icon-512.png')
