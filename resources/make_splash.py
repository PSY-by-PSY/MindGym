#!/usr/bin/env python3
"""Generate a brand-coloured splash from the gratitude mascot.

The mascot (src/assets/ui/gratitude-mascot.png) already has its own alpha
channel, so it's pasted straight onto a full 2732x2732 canvas filled with the
same vertical light-blue gradient used by the app icon's background.
"""
from PIL import Image
import numpy as np

SIZE = 2732
TOP = (233, 242, 254)      # icon top bg
BOTTOM = (247, 250, 255)   # icon bottom bg
MASCOT_SCALE = 1640        # mascot box on the 2732 canvas (~60%)

# Full-canvas vertical gradient identical to the icon background.
ramp = np.linspace(0.0, 1.0, SIZE)[:, None]
grad = np.empty((SIZE, SIZE, 3), np.uint8)
for c in range(3):
    grad[:, :, c] = np.round(TOP[c] + (BOTTOM[c] - TOP[c]) * ramp).astype(np.uint8)
canvas = Image.fromarray(grad, 'RGB')

mascot = Image.open('src/assets/ui/gratitude-mascot.png').convert('RGBA')
mascot_w = MASCOT_SCALE
mascot_h = round(MASCOT_SCALE * mascot.height / mascot.width)
mascot_img = mascot.resize((mascot_w, mascot_h), Image.LANCZOS)

off_x = (SIZE - mascot_w) // 2
off_y = (SIZE - mascot_h) // 2
canvas.paste(mascot_img, (off_x, off_y), mascot_img)

canvas.save('resources/splash.png')

# iOS asset catalog: Capacitor uses the same 2732 image for 1x/2x/3x.
imageset = 'ios/App/App/Assets.xcassets/Splash.imageset'
for name in ('splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'):
    canvas.save(f'{imageset}/{name}')

mid = grad[SIZE // 2, 0]
print('done; mid bg rgb =', tuple(int(v) for v in mid),
      '-> #%02X%02X%02X' % tuple(int(v) for v in mid))
