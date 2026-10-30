"""下载高德地图瓦片并拼接成校园底图（高德坐标系 GCJ-02 → WGS84 配准）。
输出：
  campus-app/img/base-amap.jpg      拼接后的底图
  campus-app/img/base-amap.json     配准参数（资源像素 → 世界米）
用法：python tools/fetch_amap_base.py
"""
import io
import json
import math
import os
import time
import urllib.request
from PIL import Image

# ---------- 坐标系 ----------
A = 6378245.0
EE = 0.00669342162296594323


def _tlat(x, y):
    r = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * math.sqrt(abs(x))
    r += (20.0 * math.sin(6.0 * x * math.pi) + 20.0 * math.sin(2.0 * x * math.pi)) * 2.0 / 3.0
    r += (20.0 * math.sin(y * math.pi) + 40.0 * math.sin(y / 3.0 * math.pi)) * 2.0 / 3.0
    r += (160.0 * math.sin(y / 12.0 * math.pi) + 320 * math.sin(y * math.pi / 30.0)) * 2.0 / 3.0
    return r


def _tlng(x, y):
    r = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * math.sqrt(abs(x))
    r += (20.0 * math.sin(6.0 * x * math.pi) + 20.0 * math.sin(2.0 * x * math.pi)) * 2.0 / 3.0
    r += (20.0 * math.sin(x * math.pi) + 40.0 * math.sin(x / 3.0 * math.pi)) * 2.0 / 3.0
    r += (150.0 * math.sin(x / 12.0 * math.pi) + 300.0 * math.sin(x / 30.0 * math.pi)) * 2.0 / 3.0
    return r


def wgs2gcj(lng, lat):
    dlat = _tlat(lng - 105.0, lat - 35.0)
    dlng = _tlng(lng - 105.0, lat - 35.0)
    rad = lat / 180.0 * math.pi
    magic = 1 - EE * math.sin(rad) ** 2
    sq = math.sqrt(magic)
    dlat = (dlat * 180.0) / ((A * (1 - EE)) / (magic * sq) * math.pi)
    dlng = (dlng * 180.0) / (A / sq * math.cos(rad) * math.pi)
    return lng + dlng, lat + dlat


def gcj2wgs(lng, lat):
    """迭代反解，三次足够（残差 < 0.05 m）。"""
    wlng, wlat = lng, lat
    for _ in range(3):
        glng, glat = wgs2gcj(wlng, wlat)
        wlng -= glng - lng
        wlat -= glat - lat
    return wlng, wlat


# ---------- 投影（与 App 内一致：以校园中心为原点的局部平面直角坐标）----------
CENTER = (38.4965932, 106.0998505)
rad = math.radians(CENTER[0])
M_LAT = 111132.92 - 559.82 * math.cos(2 * rad) + 1.175 * math.cos(4 * rad)
M_LNG = 111412.84 * math.cos(rad) - 93.5 * math.cos(3 * rad)


def world(lat, lng):
    return ((lng - CENTER[1]) * M_LNG, (CENTER[0] - lat) * M_LAT)


# ---------- 瓦片 ----------
def lonlat2tile(lng, lat, z):
    n = 2 ** z
    x = (lng + 180.0) / 360.0 * n
    r = math.radians(lat)
    y = (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * n
    return x, y


def tile2lonlat(tx, ty, z):
    n = 2 ** z
    lng = tx / n * 360.0 - 180.0
    r = math.atan(math.sinh(math.pi * (1 - 2 * ty / n)))
    return lng, math.degrees(r)


def fetch(url, tries=3):
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Referer': 'https://www.amap.com/',
        'Accept': 'image/avif,image/webp,image/png,image/*,*/*;q=0.8',
    })
    last = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return r.read()
        except Exception as e:      # noqa: BLE001
            last = e
            time.sleep(0.8 * (i + 1))
    raise last


def main():
    z = 18
    # 围合道路范围外扩 60 m（WGS84 度）
    W, E, S, N = 106.09597, 106.10951, 38.492845, 38.500773
    gl, gt = wgs2gcj(W, N)     # 高德坐标下的左上
    gr, gb = wgs2gcj(E, S)
    x0f, y0f = lonlat2tile(gl, gt, z)
    x1f, y1f = lonlat2tile(gr, gb, z)
    tx0, ty0, tx1, ty1 = int(x0f), int(y0f), int(x1f), int(y1f)
    cols, rows = tx1 - tx0 + 1, ty1 - ty0 + 1
    print('瓦片范围 z=%d  x %d..%d  y %d..%d  （%d × %d = %d 张）' % (z, tx0, tx1, ty0, ty1, cols, rows, cols * rows))

    sheet = Image.new('RGB', (cols * 256, rows * 256), (247, 247, 247))
    got = 0
    for j in range(rows):
        for i in range(cols):
            x, y = tx0 + i, ty0 + j
            url = ('https://webrd0%d.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x=%d&y=%d&z=%d'
                   % (1 + (x + y) % 4, x, y, z))
            try:
                data = fetch(url)
                tile = Image.open(io.BytesIO(data)).convert('RGB')
                if tile.size != (256, 256):
                    tile = tile.resize((256, 256), Image.LANCZOS)
                sheet.paste(tile, (i * 256, j * 256))
                got += 1
            except Exception as e:  # noqa: BLE001
                print('  瓦片失败 %d/%d/%d: %s' % (z, x, y, e))
    print('成功 %d / %d 张' % (got, cols * rows))

    # ---- 配准：取拼接图的左上/右下角（高德坐标 → WGS84 → 世界米）----
    def px2world(px, py):
        glng, glat = tile2lonlat(tx0 + px / 256.0, ty0 + py / 256.0, z)
        wlng, wlat = gcj2wgs(glng, glat)
        return world(wlat, wlng)

    tl = px2world(0, 0)
    br = px2world(sheet.width, sheet.height)
    mid = px2world(sheet.width / 2.0, sheet.height / 2.0)
    # 用中心处的局部比例（墨卡托在 800 m 内几乎等比）
    q = px2world(1000, 500)
    sx = (q[0] - mid[0]) / (1000 - sheet.width / 2.0)
    sy = (q[1] - mid[1]) / (500 - sheet.height / 2.0)
    m_per_px = (abs(sx) + abs(sy)) / 2.0
    x0 = mid[0] - (sheet.width / 2.0) * abs(sx) * (1 if sx > 0 else -1) if False else mid[0] - sheet.width / 2.0 * m_per_px
    y0 = mid[1] - sheet.height / 2.0 * m_per_px
    print('配准：mPerPx = %.6f  x0 = %.1f  y0 = %.1f' % (m_per_px, x0, y0))
    print('覆盖 x %.1f..%.1f  y %.1f..%.1f  (%.0f × %.0f m)' % (
        x0, x0 + sheet.width * m_per_px, y0, y0 + sheet.height * m_per_px,
        sheet.width * m_per_px, sheet.height * m_per_px))

    outdir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'img')
    os.makedirs(outdir, exist_ok=True)
    jpg = os.path.join(outdir, 'base-amap.jpg')
    sheet.save(jpg, quality=86, optimize=True, progressive=True)
    meta = {
        'src': 'img/base-amap.jpg',
        'w': sheet.width, 'h': sheet.height,
        'mPerPx': round(m_per_px, 7),
        'x0': round(x0, 1), 'y0': round(y0, 1),
        'zoom': z,
        'attribution': '© 高德地图（审图号 GS(2023)1314号）',
    }
    with open(os.path.join(outdir, 'base-amap.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print('输出 %s  %.0f KB' % (jpg, os.path.getsize(jpg) / 1024))
    print(json.dumps(meta, ensure_ascii=False))


if __name__ == '__main__':
    main()
