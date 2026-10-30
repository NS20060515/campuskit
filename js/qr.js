/* 校园通 · 内置 QR 码生成器（无外部依赖）
 *
 * 用途：桌面版点「手机访问」后，把局域网地址直接渲染成二维码，手机扫一下就打开。
 *
 * 实现范围（够用且严格）：
 *   · 字节模式（Byte mode），UTF-8 编码
 *   · 纠错等级 L，版本 1–4（21×21 ~ 33×33），自动选择最小可用版本
 *   · 版本 1–4 在 L 级下均为单块，因此无需做块交织
 *   · 标准掩码 8 选 1（按规范的四条罚分规则择优），格式信息按 BCH(15,5) 生成
 * 输出：模块矩阵，以及可直接嵌入的 SVG。
 */
window.CH = window.CH || {};
(function (CH) {
  'use strict';

  // 纠错等级 L 的数据码字 / 纠错码字数（版本 1–4）
  const EC_L = {
    1: { data: 19, ec: 7 },
    2: { data: 34, ec: 10 },
    3: { data: 55, ec: 15 },
    4: { data: 80, ec: 20 },
  };
  const MAX_VERSION = 4;

  /* ---------------- GF(256) ---------------- */
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  (function initTables() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();

  function gmul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  /** 生成多项式 g(x) = Π (x - α^i)，返回降幂系数（poly[0] 为最高次项） */
  function rsGenerator(deg) {
    let poly = [1];
    for (let i = 0; i < deg; i++) {
      const next = new Array(poly.length + 1);
      for (let k = 0; k < next.length; k++) next[k] = 0;
      for (let j = 0; j < poly.length; j++) {
        // 乘以 (x + α^i)：x 项系数不变（下标不变），常数项乘 α^i（下标 +1）
        next[j] ^= poly[j];
        next[j + 1] ^= gmul(poly[j], EXP[i]);
      }
      poly = next;
    }
    return poly;
  }

  /** 多项式除法求余数（即纠错码字） */
  function rsRemainder(data, ecLen) {
    const gen = rsGenerator(ecLen);
    const buf = new Uint8Array(data.length + ecLen);
    buf.set(data);
    for (let i = 0; i < data.length; i++) {
      const factor = buf[i];
      if (factor === 0) continue;
      for (let j = 0; j < gen.length; j++) {
        buf[i + j] ^= gmul(gen[j], factor);
      }
    }
    return buf.subarray(data.length);
  }

  /* ---------------- 位流与码字 ---------------- */
  function utf8Bytes(text) {
    const out = [];
    for (let i = 0; i < text.length; i++) {
      let code = text.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
        const next = text.charCodeAt(i + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
          i++;
        }
      }
      if (code < 0x80) out.push(code);
      else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
      else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
      else out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    }
    return out;
  }

  function pickVersion(byteLen) {
    for (let v = 1; v <= MAX_VERSION; v++) {
      if (byteLen <= EC_L[v].data - 2) return v; // 4bit 模式 + 8bit 长度 + 数据，需留出至少 2 字节余量
    }
    return 0;
  }

  function buildCodewords(bytes, version) {
    const cap = EC_L[version].data;
    const bits = [];
    const push = (val, len) => {
      for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
    };
    push(4, 4);                 // 字节模式
    push(bytes.length, 8);      // 版本 1–9 的字符计数为 8 位
    for (let i = 0; i < bytes.length; i++) push(bytes[i], 8);

    const capBits = cap * 8;
    const term = Math.min(4, capBits - bits.length);
    push(0, term);
    while (bits.length % 8 !== 0) bits.push(0);

    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      let v = 0;
      for (let k = 0; k < 8; k++) v = (v << 1) | bits[i + k];
      data.push(v);
    }
    const padBytes = [0xec, 0x11];
    let pi = 0;
    while (data.length < cap) data.push(padBytes[pi++ % 2]);

    const ec = rsRemainder(data, EC_L[version].ec);
    const out = data.concat(Array.prototype.slice.call(ec));
    return out;
  }

  /* ---------------- 矩阵构建 ---------------- */
  function newMatrix(size) {
    const m = [];
    const res = [];
    for (let r = 0; r < size; r++) {
      m.push(new Array(size).fill(0));
      res.push(new Array(size).fill(false));
    }
    return { m, res };
  }

  function placeFinder(m, res, size, r0, c0) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = r0 + r;
        const cc = c0 + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        res[rr][cc] = true;
        const ring = (r === 0 || r === 6) && c >= 0 && c <= 6;
        const ring2 = (c === 0 || c === 6) && r >= 0 && r <= 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        m[rr][cc] = (ring || ring2 || core) ? 1 : 0;
      }
    }
  }

  function placeAlignment(m, res, cr, cc) {
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        const on = Math.max(Math.abs(r), Math.abs(c)) !== 1;
        m[cr + r][cc + c] = on ? 1 : 0;
        res[cr + r][cc + c] = true;
      }
    }
  }

  function reserveFormat(res, size) {
    for (let i = 0; i <= 8; i++) {
      res[8][i] = true;
      res[i][8] = true;
    }
    for (let i = 0; i < 8; i++) {
      res[8][size - 1 - i] = true;
      res[size - 1 - i][8] = true;
    }
  }

  function baseMatrix(version) {
    const size = version * 4 + 17;
    const { m, res } = newMatrix(size);

    placeFinder(m, res, size, 0, 0);
    placeFinder(m, res, size, 0, size - 7);
    placeFinder(m, res, size, size - 7, 0);

    // 定时图形
    for (let i = 8; i < size - 8; i++) {
      const v = (i % 2 === 0) ? 1 : 0;
      m[6][i] = v;
      res[6][i] = true;
      m[i][6] = v;
      res[i][6] = true;
    }

    // 校正图形：版本 2–4 只有一个，位于中心
    if (version >= 2) {
      const c = size - 7;
      placeAlignment(m, res, c, c);
    }

    // 暗模块
    m[size - 8][8] = 1;
    res[size - 8][8] = true;

    reserveFormat(res, size);
    return { m, res, size };
  }

  function placeData(m, res, size, codewords) {
    const totalBits = codewords.length * 8;
    const bitAt = (i) => (codewords[i >> 3] >> (7 - (i & 7))) & 1;
    let idx = 0;
    let upward = true;

    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5; // 跳过竖向定时图形所在列
      for (let vert = 0; vert < size; vert++) {
        const row = upward ? size - 1 - vert : vert;
        for (let k = 0; k < 2; k++) {
          const col = right - k;
          if (res[row][col]) continue;
          m[row][col] = idx < totalBits ? bitAt(idx) : 0;
          idx++;
        }
      }
      upward = !upward;
    }
  }

  /* ---------------- 掩码 ---------------- */
  const MASKS = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];

  function applyMask(m, res, size, maskIdx) {
    const fn = MASKS[maskIdx];
    const out = m.map((row) => row.slice());
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!res[r][c] && fn(r, c)) out[r][c] ^= 1;
      }
    }
    return out;
  }

  function penalty(m, size) {
    let score = 0;

    // 规则 1：同色连排 ≥5
    for (let r = 0; r < size; r++) {
      let run = 1;
      for (let c = 1; c < size; c++) {
        if (m[r][c] === m[r][c - 1]) { run++; }
        else { if (run >= 5) score += 3 + (run - 5); run = 1; }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
    for (let c = 0; c < size; c++) {
      let run = 1;
      for (let r = 1; r < size; r++) {
        if (m[r][c] === m[r - 1][c]) { run++; }
        else { if (run >= 5) score += 3 + (run - 5); run = 1; }
      }
      if (run >= 5) score += 3 + (run - 5);
    }

    // 规则 2：2×2 同色块
    for (let r = 0; r < size - 1; r++) {
      for (let c = 0; c < size - 1; c++) {
        const v = m[r][c];
        if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
      }
    }

    // 规则 3：类似定位图形的 1011101 0000 序列
    const pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    const pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    const matchAt = (get, len, start, pat) => {
      for (let i = 0; i < pat.length; i++) {
        if (start + i >= len) return false;
        if (get(start + i) !== pat[i]) return false;
      }
      return true;
    };
    for (let r = 0; r < size; r++) {
      const get = (i) => m[r][i];
      for (let c = 0; c + 11 <= size; c++) {
        if (matchAt(get, size, c, pat1)) score += 40;
        if (matchAt(get, size, c, pat2)) score += 40;
      }
    }
    for (let c = 0; c < size; c++) {
      const get = (i) => m[i][c];
      for (let r = 0; r + 11 <= size; r++) {
        if (matchAt(get, size, r, pat1)) score += 40;
        if (matchAt(get, size, r, pat2)) score += 40;
      }
    }

    // 规则 4：黑白比例偏离 50%
    let dark = 0;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark += m[r][c];
    const pct = (dark * 100) / (size * size);
    score += Math.floor(Math.abs(pct - 50) / 5) * 10;

    return score;
  }

  function formatInfoBits(maskIdx) {
    const data = (1 << 3) | maskIdx; // 纠错等级 L = 01
    let rem = data << 10;
    for (let i = 14; i >= 10; i--) {
      if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
    }
    return ((data << 10) | (rem & 0x3ff)) ^ 0x5412;
  }

  function placeFormat(m, size, maskIdx) {
    const bits = formatInfoBits(maskIdx);
    const bit = (i) => (bits >> i) & 1;

    // 第一份：左上沿第 8 列自上而下，随后左下沿第 8 列自下而上
    for (let i = 0; i <= 5; i++) m[i][8] = bit(i);
    m[7][8] = bit(6);
    m[8][8] = bit(7);
    for (let i = 8; i <= 14; i++) m[size - 15 + i][8] = bit(i);

    // 第二份：右上沿第 8 行自右向左，随后左上沿第 8 行继续向左（跳过第 6 列的定时图形）
    for (let i = 0; i <= 7; i++) m[8][size - 1 - i] = bit(i);
    m[8][7] = bit(8);
    for (let i = 9; i <= 14; i++) m[8][15 - i - 1] = bit(i);
  }

  /* ---------------- 对外接口 ---------------- */
  /**
   * 编码为模块矩阵
   * @param {string} text 内容
   * @param {{mask?:number}} [opts] 仅测试用：锁定掩码，跳过择优
   * @returns {{size:number, modules:number[][], version:number, mask:number}}
   */
  function encode(text, opts) {
    const bytes = utf8Bytes(String(text));
    const version = pickVersion(bytes.length);
    if (!version) throw new Error('内容过长，超出内置编码器范围（支持到版本 4）');

    const codewords = buildCodewords(bytes, version);
    const { m, res, size } = baseMatrix(version);
    placeData(m, res, size, codewords);

    if (opts && typeof opts.mask === 'number') {
      const maskIdx = opts.mask & 7;
      const fixed = applyMask(m, res, size, maskIdx);
      placeFormat(fixed, size, maskIdx);
      return { size, modules: fixed, version, mask: maskIdx };
    }

    let best = null;
    for (let k = 0; k < 8; k++) {
      const masked = applyMask(m, res, size, k);
      placeFormat(masked, size, k);
      const p = penalty(masked, size);
      if (!best || p < best.penalty) best = { penalty: p, matrix: masked, mask: k };
    }
    return { size, modules: best.matrix, version, mask: best.mask };
  }

  /** 生成 SVG 字符串（可以直接塞进 innerHTML，矢量不糊） */
  function svg(text, opts) {
    const o = opts || {};
    const box = o.moduleSize || 4;
    const margin = o.margin == null ? 2 : o.margin;
    const q = encode(text);
    const total = (q.size + margin * 2) * box;

    let d = '';
    for (let r = 0; r < q.size; r++) {
      for (let c = 0; c < q.size; c++) {
        if (!q.modules[r][c]) continue;
        const x = (c + margin) * box;
        const y = (r + margin) * box;
        d += 'M' + x + ' ' + y + 'h' + box + 'v' + box + 'h-' + box + 'z';
      }
    }
    return '<svg class="qr-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total +
      '" width="' + total + '" height="' + total + '" role="img" aria-label="扫码在手机上打开">' +
      '<rect width="' + total + '" height="' + total + '" fill="#ffffff"/>' +
      '<path d="' + d + '" fill="#161a2b" shape-rendering="crispEdges"/></svg>';
  }

  CH.qr = { encode, svg };
})(window.CH);
