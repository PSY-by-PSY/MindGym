#!/usr/bin/env python3
"""Generate a brand-coloured splash from the mascot icon.

The icon (resources/icon.png) is the mascot on a subtle vertical light-blue
gradient. We recreate that gradient across a full 2732x2732 canvas, key the
mascot out of the icon's background, and paste it centred with breathing room.
Keying (rather than pasting the whole icon) avoids a visible rectangle where
the icon's own gradient would otherwise not line up with the canvas gradient.
"""
import numpy as np
from PIL import Image

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

# Key the mascot out of the icon: a pixel is background if it is light AND
# bluish (B-R >= 8). White mascot highlights have B-R ~ 0 so they survive.
icon = np.asarray(Image.open('resources/icon.png').convert('RGB')).astype(np.int16)
R, G, B = icon[:, :, 0], icon[:, :, 1], icon[:, :, 2]
is_bg = (np.minimum(np.minimum(R, G), B) > 214) & ((B - R) >= 8)
alpha = np.where(is_bg, 0, 255).astype(np.uint8)
mascot = np.dstack([icon.astype(np.uint8), alpha])
mascot_img = Image.fromarray(mascot, 'RGBA').resize(
    (MASCOT_SCALE, MASCOT_SCALE), Image.LANCZOS)

off = (SIZE - MASCOT_SCALE) // 2
canvas.paste(mascot_img, (off, off), mascot_img)

canvas.save('resources/splash.png')

# iOS asset catalog: Capacitor uses the same 2732 image for 1x/2x/3x.
imageset = 'ios/App/App/Assets.xcassets/Splash.imageset'
for name in ('splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'):
    canvas.save(f'{imageset}/{name}')

mid = grad[SIZE // 2, 0]
print('done; mid bg rgb =', tuple(int(v) for v in mid),
      '-> #%02X%02X%02X' % tuple(int(v) for v in mid))
