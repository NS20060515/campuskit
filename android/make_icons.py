# -*- coding: utf-8 -*-
"""生成 Android 图标资源：
  · drawable/ic_launcher_foreground.png —— 自适应图标前景（透明底 + 白色「校」，留安全区）
  · mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher.png —— 旧版系统用的整体图标（满幅，系统自行裁形）
复用 icon_gen.py 的渐变与字体逻辑。
"""
import os
import sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'desktop'))
import icon_gen  # noqa: E402  （复用渐变/字体/字形实现）

RES = os.path.join(HERE, 'res')
DENSITIES = [('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)]


def adaptive_foreground(size=432):
    """自适应图标前景：画布 432，内容集中在中间 66%（安全区）"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    inner = int(size * 0.60)
    glyph = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    icon_gen.draw_char(glyph, size)
    glyph = glyph.resize((inner, inner), Image.LANCZOS)
    off = (size - inner) // 2
    img.alpha_composite(glyph, (off, off))
    return img


def legacy_icon(size):
    """旧版图标：满幅渐变 + 稍大的字形（系统会自行裁成圆形/圆角）"""
    return icon_gen.render_fullbleed(size, 0.70)


def main():
    os.makedirs(os.path.join(RES, 'drawable'), exist_ok=True)
    fg = adaptive_foreground(432)
    fg.save(os.path.join(RES, 'drawable', 'ic_launcher_foreground.png'))
    print('  drawable/ic_launcher_foreground.png  432x432')

    for name, px in DENSITIES:
        d = os.path.join(RES, 'mipmap-' + name)
        os.makedirs(d, exist_ok=True)
        legacy_icon(px).save(os.path.join(d, 'ic_launcher.png'))
        print('  mipmap-%-8s ic_launcher.png  %dx%d' % (name, px, px))


if __name__ == '__main__':
    main()
