#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generator ikon Sa7tein (Pillow, tanpa server).
Menggambar huruf hijaiyyah ح (Haa) putih di atas kotak membulat merah-oranye #e04020,
meniru model logo pada gambar referensi brand.

Menghasilkan:
  - Ikon web (PWA): icon-192.png, icon-512.png, icon.svg  → apps/*/public/icons
  - Ikon Android  : ic_launcher.png, ic_launcher_round.png, ic_launcher_foreground.png
                     (mdpi..xxxhdpi)                       → apps/{customer,merchant,courier}/android/.../res/mipmap-*
                     + warna background adaptive icon #e04020
  - Ikon iOS      : AppIcon-512@2x.png (1024x1024)        → apps/{customer,merchant,courier}/ios/.../AppIcon.appiconset

Cara pakai:  /usr/bin/python3 scripts/generate-icons.py
"""

import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Palet brand Sa7tein (dari gambar referensi)
BRAND_TOP = (224, 64, 32)       # #e04020 (merah-oranye)
BRAND_BOTTOM = (167, 43, 21)    # #a72b15 (lebih gelap untuk gradasi bawah)
WHITE = (255, 255, 255, 255)

# Font Arab sistem macOS
FONT = '/System/Library/Fonts/GeezaPro.ttc'
LETTER = '\u062d'  # ح (Haa)

WEB_APPS = ['customer', 'merchant', 'courier', 'cs']
NATIVE_APPS = ['customer', 'merchant', 'courier']

# Ukuran launcher Android per density (ic_launcher / round)
ANDROID_LEGACY = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
# Ukuran foreground adaptive icon per density
ANDROID_FOREGROUND = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}


def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def vertical_gradient(size, top, bottom):
    """Gambar kanvas RGBA berisi gradasi vertikal top→bottom."""
    img = Image.new('RGBA', (size, size))
    px = img.load()
    for y in range(size):
        t = y / max(size - 1, 1)
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        for x in range(size):
            px[x, y] = (r, g, b, 255)
    return img


def render_letter(size, font_size, letter=LETTER, fill=WHITE):
    """Render huruf Arab putih pada kanvas transparan, terpusat secara visual."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT, font_size)
    draw.text((size / 2, size / 2), letter, font=font, fill=fill, anchor='mm')
    bbox = img.getbbox()
    if bbox:
        gw, gh = bbox[2] - bbox[0], bbox[3] - bbox[1]
        dx = bbox[0] - (size - gw) // 2
        dy = bbox[1] - (size - gh) // 2
        if dx or dy:
            out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
            out.alpha_composite(img, (-dx, -dy))
            img = out
    return img


def rounded_mask(size, radius):
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def circle_mask(size):
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    return mask


def make_full_icon(size, shape='rounded', radius_ratio=0.215, letter_scale=0.60):
    """Ikon penuh: kotak membulat (atau lingkaran/persegi) gradasi brand + huruf ح putih."""
    radius = int(size * radius_ratio) if shape == 'rounded' else 0
    base = vertical_gradient(size, BRAND_TOP, BRAND_BOTTOM)
    if shape == 'rounded':
        mask = rounded_mask(size, radius)
    elif shape == 'circle':
        mask = circle_mask(size)
    else:  # square (full-bleed untuk iOS)
        mask = Image.new('L', (size, size), 255)
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    img.paste(base, (0, 0), mask)
    letter = render_letter(size, int(size * letter_scale))
    img = Image.alpha_composite(img, letter)
    # potong ke bentuk mask (biar huruf tidak menonjol keluar sudut)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def make_foreground(size, letter_scale=0.46):
    """Foreground adaptive icon: huruf putih transparan di zona aman tengah."""
    return render_letter(size, int(size * letter_scale))


def write_svg(path, size=512):
    """SVG favicon: kotak membulat #e04020 + huruf ح (font arab sistem)."""
    radius = int(size * 0.215)
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {s} {s}" width="{s}" height="{s}">\n'
        '  <defs>\n'
        '    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">\n'
        '      <stop offset="0" stop-color="#e04020"/>\n'
        '      <stop offset="1" stop-color="#a72b15"/>\n'
        '    </linearGradient>\n'
        '  </defs>\n'
        '  <rect x="8" y="8" width="{w}" height="{w}" rx="{r}" fill="url(#bg)"/>\n'
        '  <text x="256" y="256" text-anchor="middle" dominant-baseline="central" '
        'font-family="\'Geeza Pro\', \'Noto Naskh Arabic\', sans-serif" '
        'font-size="300" fill="#ffffff">ح</text>\n'
        '</svg>\n'
    ).format(s=size, w=size - 16, r=radius)
    with open(path, 'w') as f:
        f.write(svg)


def main():
    # ---- Ikon web (PWA) ----
    for app in WEB_APPS:
        out_dir = os.path.join(ROOT, 'apps', app, 'public', 'icons')
        os.makedirs(out_dir, exist_ok=True)
        for s in (192, 512):
            make_full_icon(s).save(os.path.join(out_dir, 'icon-%d.png' % s))
            print('OK web  icon-%d.png (%s)' % (s, app))
        write_svg(os.path.join(out_dir, 'icon.svg'))
        print('OK web  icon.svg (%s)' % app)

    # ---- Ikon Android ----
    for app in NATIVE_APPS:
        res = os.path.join(ROOT, 'apps', app, 'android', 'app', 'src', 'main', 'res')
        if not os.path.isdir(res):
            print('SKIP android (%s): tidak ada folder res' % app)
            continue
        for density, px in ANDROID_LEGACY.items():
            d = os.path.join(res, 'mipmap-%s' % density)
            if not os.path.isdir(d):
                continue
            make_full_icon(px, shape='rounded').save(os.path.join(d, 'ic_launcher.png'))
            make_full_icon(px, shape='circle').save(os.path.join(d, 'ic_launcher_round.png'))
        for density, px in ANDROID_FOREGROUND.items():
            d = os.path.join(res, 'mipmap-%s' % density)
            if not os.path.isdir(d):
                continue
            make_foreground(px).save(os.path.join(d, 'ic_launcher_foreground.png'))
        # warna background adaptive icon → #e04020
        bg = os.path.join(res, 'values', 'ic_launcher_background.xml')
        if os.path.isfile(bg):
            with open(bg) as f:
                content = f.read()
            import re
            content2 = re.sub(r'(<color name="ic_launcher_background">)#[0-9A-Fa-f]+(</color>)',
                              r'\g<1>#E04020\g<2>', content)
            if content2 != content:
                with open(bg, 'w') as f:
                    f.write(content2)
                print('OK     ic_launcher_background → #E04020 (%s)' % app)
        print('OK android (%s)' % app)

    # ---- Ikon iOS ----
    for app in NATIVE_APPS:
        appicon = os.path.join(ROOT, 'apps', app, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset')
        if not os.path.isdir(appicon):
            print('SKIP ios (%s): tidak ada folder AppIcon' % app)
            continue
        # iOS memakai mask sendiri → ikon full-bleed persegi (tanpa sudut membulat)
        make_full_icon(1024, shape='square').save(os.path.join(appicon, 'AppIcon-512@2x.png'))
        print('OK ios  AppIcon-512@2x.png (%s)' % app)

    print('\nSelesai — semua ikon Sa7tein (ح) berhasil dibuat.')


if __name__ == '__main__':
    main()
