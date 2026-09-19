import os
import numpy as np
from PIL import Image

SRC = r"C:\Users\Administrator\Downloads\1786093045297_edit_1243626426793613.png"
OUT_DIR = r"C:\Users\Administrator\Desktop\home-inventory-app\android\app\src\main\res"
FULL_OUT = r"C:\Users\Administrator\Desktop\home-inventory-app\_tmp\icon-final"
os.makedirs(FULL_OUT, exist_ok=True)

img = Image.open(SRC).convert("RGB")
W, H = img.size
print("source size", W, H)

a = np.asarray(img, dtype=np.uint8)
# find content: pixels that are clearly not white
nonwhite = (a[:, :, 0] < 238) | (a[:, :, 1] < 238) | (a[:, :, 2] < 238)
ys, xs = np.where(nonwhite)
x0, x1 = xs.min(), xs.max()
y0, y1 = ys.min(), ys.max()
print("content bbox", x0, y0, x1, y1)

# crop to a square centered on the content, with a small margin (2.5%)
size = max(x1 - x0, y1 - y0)
cx = (x0 + x1) // 2
cy = (y0 + y1) // 2
half = int(size * 1.025) // 2
left = max(0, cx - half)
top = max(0, cy - half)
right = min(W, cx + half)
bottom = min(H, cy + half)
img = img.crop((left, top, right, bottom))
print("cropped size", img.size)

img.save(os.path.join(FULL_OUT, "ic_launcher_master.png"))
full = img.resize((1024, 1024), Image.LANCZOS)
full.save(os.path.join(FULL_OUT, "ic_launcher_full_1024.png"))

DENSITIES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}
for folder, size in DENSITIES.items():
    d = os.path.join(OUT_DIR, folder)
    os.makedirs(d, exist_ok=True)
    im = img.resize((size, size), Image.LANCZOS)
    im.save(os.path.join(d, "ic_launcher.png"))
    im.save(os.path.join(d, "ic_launcher_round.png"))
    print(folder, size, "ok")
