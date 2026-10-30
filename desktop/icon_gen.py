# -*- coding: utf-8 -*-
"""生成「校园通」应用图标 app.ico（多尺寸）与预览图。
品牌色与界面一致：#6366f1 → #8b5cf6 → #14b8a6。
大尺寸用「校」字，小尺寸用简化的学位帽图形（保证 16/24px 可辨识）。
"""
from PIL import Image, ImageDraw, ImageFont
import os

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
SS = 8  # 超采样倍数

C1 = (99, 102, 241)
C2 = (139, 92, 246)
C3 = (20, 184, 166)


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def gradient(size):
    """135° 三色渐变"""
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2.0 * (size - 1))
            if t < 0.55:
                c = lerp(C1, C2, t / 0.55)
            else:
                c = lerp(C2, C3, (t - 0.55) / 0.45)
            px[x, y] = c
    return img


def rounded_mask(size, radius_ratio=0.225):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    r = int(size * radius_ratio)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=255)
    return m


def draw_cap(draw, size, color=(255, 255, 255, 255)):
    """简化学位帽：菱形帽板 + 帽檐 + 流苏"""
    s = size
    cx = s * 0.5
    # 帽板（菱形）
    top = (cx, s * 0.235)
    right = (s * 0.845, s * 0.415)
    bottom = (cx, s * 0.595)
    left = (s * 0.155, s * 0.415)
    draw.polygon([top, right, bottom, left], fill=color)
    # 帽檐（下方梯形，示意帽体）
    bw = s * 0.30
    draw.polygon([
        (cx - bw, s * 0.545),
        (cx + bw, s * 0.545),
        (cx + bw * 0.80, s * 0.735),
        (cx - bw * 0.80, s * 0.735),
    ], fill=color)
    # 流苏
    lw = max(2, int(s * 0.028))
    draw.line([(s * 0.845, s * 0.425), (s * 0.855, s * 0.665)], fill=color, width=lw)
    rr = s * 0.045
    draw.ellipse([s * 0.855 - rr, s * 0.665 - rr, s * 0.855 + rr, s * 0.665 + rr], fill=color)


def find_font(size):
    for path in (r"C:\Windows\Fonts\msyhbd.ttc", r"C:\Windows\Fonts\msyh.ttc",
                 r"C:\Windows\Fonts\simhei.ttf", r"C:\Windows\Fonts\Deng.ttf"):
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size, index=0)
            except Exception:
                try:
                    return ImageFont.truetype(path, size)
                except Exception:
                    continue
    return ImageFont.load_default()


def draw_char(img, size):
    """在大尺寸图标上写「校」字并做光学居中"""
    d = ImageDraw.Draw(img)
    font = find_font(int(size * 0.60))
    text = "校"
    box = d.textbbox((0, 0), text, font=font)
    w = box[2] - box[0]
    h = box[3] - box[1]
    x = (size - w) / 2.0 - box[0]
    y = (size - h) / 2.0 - box[1] - size * 0.015  # 视觉微调
    d.text((x, y), text, font=font, fill=(255, 255, 255, 255))


def render(size):
    big = size * SS
    base = gradient(big).convert("RGBA")
    mask = rounded_mask(big)
    out = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    out.paste(base, (0, 0), mask)
    if size <= 24:
        d = ImageDraw.Draw(out)
        draw_cap(d, big)
    else:
        draw_char(out, big)
    return out.resize((size, size), Image.LANCZOS)


def render_fullbleed(size, glyph_ratio=1.0):
    """满幅方形（不切圆角）+ 可缩小的字形，用于 maskable / apple-touch 图标：
    系统会自己套遮罩，所以背景必须铺满，字形要留安全边距。"""
    big = size * SS
    out = gradient(big).convert("RGBA")
    if glyph_ratio <= 0.35:
        d = ImageDraw.Draw(out)
        draw_cap(d, big)
    else:
        # 用临时图层把字形画小并居中
        layer = Image.new("RGBA", (big, big), (0, 0, 0, 0))
        draw_char(layer, big)
        inner = int(big * glyph_ratio)
        shrunk = layer.resize((inner, inner), Image.LANCZOS)
        # 缩放后透明度会衰减，这里直接贴到中心
        off = (big - inner) // 2
        out.alpha_composite(shrunk, (off, off))
    return out.resize((size, size), Image.LANCZOS)


def main():
    sizes = [16, 24, 32, 48, 64, 128, 256]
    imgs = [render(s) for s in sizes]
    ico = os.path.join(OUT_DIR, "app.ico")
    imgs[-1].save(ico, format="ICO", sizes=[(s, s) for s in sizes])
    print("已生成: " + ico + "  尺寸: " + ", ".join(str(s) for s in sizes))

    # 预览图：各尺寸并排 + 放大展示
    pad = 16
    strip_w = sum(sizes) + pad * (len(sizes) + 1)
    strip_h = max(sizes) + pad * 2
    strip = Image.new("RGBA", (strip_w, strip_h), (245, 246, 251, 255))
    x = pad
    for s, im in zip(sizes, imgs):
        strip.paste(im, (x, pad + (max(sizes) - s) // 2), im)
        x += s + pad
    strip.save(os.path.join(OUT_DIR, "icon_preview.png"))
    print("预览: " + os.path.join(OUT_DIR, "icon_preview.png"))

    # Web / PWA 图标（供手机添加到主屏幕使用）
    web = os.path.join(os.path.dirname(OUT_DIR), "icons")
    os.makedirs(web, exist_ok=True)
    render(192).save(os.path.join(web, "icon-192.png"))
    render(512).save(os.path.join(web, "icon-512.png"))
    # maskable：满幅 + 字形缩到 62%（落在安全区内）
    render_fullbleed(512, 0.62).save(os.path.join(web, "icon-maskable-512.png"))
    # iOS 会自己切圆角，用满幅
    render_fullbleed(180, 0.78).save(os.path.join(web, "apple-touch-icon.png"))
    print("Web 图标已写入: " + web)


if __name__ == "__main__":
    main()
