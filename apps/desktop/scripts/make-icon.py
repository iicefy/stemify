"""Draws assets/icon.icns: a dark rounded square with five stem-colored waveform bars."""
import struct, subprocess, sys, zlib
from pathlib import Path
import numpy as np

SIZE = 1024
SS = 2  # supersample for smooth edges
N = SIZE * SS

def capsule(x, y, cx, cy, half_w, half_h, r):
    # signed distance to a rounded rectangle (negative inside)
    qx = np.abs(x - cx) - (half_w - r)
    qy = np.abs(y - cy) - (half_h - r)
    outside = np.hypot(np.maximum(qx, 0), np.maximum(qy, 0))
    inside = np.minimum(np.maximum(qx, qy), 0)
    return outside + inside - r

ys, xs = np.mgrid[0:N, 0:N].astype(np.float32)
img = np.zeros((N, N, 4), np.float32)

def paint(dist, color, alpha=1.0):
    cov = np.clip(0.5 - dist / SS, 0, 1) * alpha
    for c in range(3):
        img[..., c] = img[..., c] * (1 - cov) + color[c] * cov
    img[..., 3] = img[..., 3] + cov * (1 - img[..., 3])

c = N / 2
paint(capsule(xs, ys, c, c, 412 * SS, 412 * SS, 185 * SS), (0x14, 0x14, 0x17))

colors = [(0xef, 0x44, 0x44), (0x22, 0xb8, 0xa8), (0xf5, 0xa6, 0x23), (0x34, 0xd3, 0x99), (0xa8, 0x55, 0xf7)]
heights = [280, 500, 380, 580, 320]
bar_w, gap = 70, 44
total = len(colors) * bar_w + (len(colors) - 1) * gap
x0 = (SIZE - total) / 2 + bar_w / 2
for i, (col, h) in enumerate(zip(colors, heights)):
    cx = (x0 + i * (bar_w + gap)) * SS
    paint(capsule(xs, ys, cx, c, bar_w / 2 * SS, h / 2 * SS, bar_w / 2 * SS), col)

# downsample and write a PNG
img = img.reshape(SIZE, SS, SIZE, SS, 4).mean(axis=(1, 3))
a = np.clip(img[..., 3:4], 1e-6, 1)
rgb = np.clip(img[..., :3] / a, 0, 255)
out = np.concatenate([rgb, np.clip(img[..., 3:4], 0, 1) * 255], axis=2).astype(np.uint8)

def png(path, arr):
    h, w, _ = arr.shape
    raw = b"".join(b"\x00" + arr[r].tobytes() for r in range(h))
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    Path(path).write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))

assets = Path(__file__).resolve().parent.parent / "assets"
assets.mkdir(exist_ok=True)
base = assets / "icon-1024.png"
png(base, out)

iconset = assets / "icon.iconset"
iconset.mkdir(exist_ok=True)
for size in (16, 32, 128, 256, 512):
    for scale in (1, 2):
        px = size * scale
        name = f"icon_{size}x{size}{'@2x' if scale == 2 else ''}.png"
        subprocess.run(["sips", "-z", str(px), str(px), str(base), "--out", str(iconset / name)], check=True, capture_output=True)
subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(assets / "icon.icns")], check=True)
print("wrote", assets / "icon.icns")
