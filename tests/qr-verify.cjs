/* 二维码编码器验证：把生成的矩阵渲染成像素，再用 jsQR 真解码，必须还原出原文。
 *
 * 这是一个开发期校验脚本，不参与应用运行。首次使用需要安装依赖：
 *   npm i jsqr
 *   npm i pngjs        （仅 -p 模式需要：从截图 PNG 解码）
 *
 * 用法：
 *   node tests/qr-verify.cjs                # 编码 → 渲染 → 解码，跑一批 URL
 *   node tests/qr-verify.cjs -p shot.png    # 从截图里解码（验证屏幕上看到的码）
 */
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function loadEncoder() {
  // qr.js 是浏览器脚本，这里给它一个最小的 window 环境
  global.window = {};
  require(path.join(ROOT, 'js', 'qr.js'));
  return global.window.CH.qr;
}

function have(mod) {
  try { require.resolve(mod); return true; } catch (e) { return false; }
}

if (!have('jsqr')) {
  console.error('缺少依赖 jsqr，请先执行： npm i jsqr');
  process.exit(2);
}
const jsQR = require('jsqr');

/* ---------- 模式一：从 PNG 截图解码 ---------- */
if (process.argv[2] === '-p') {
  const file = process.argv[3];
  if (!file) { console.error('用法: node tests/qr-verify.cjs -p <png>'); process.exit(2); }
  if (!have('pngjs')) { console.error('缺少依赖 pngjs，请先执行： npm i pngjs'); process.exit(2); }
  const { PNG } = require('pngjs');
  const png = PNG.sync.read(fs.readFileSync(file));
  const res = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  console.log('图片尺寸: ' + png.width + 'x' + png.height);
  if (res) { console.log('解码结果: ' + res.data); process.exit(0); }
  console.log('解码失败');
  process.exit(1);
}

/* ---------- 模式二：编码 → 渲染 → 解码 ---------- */
const qr = loadEncoder();

function render(modules, size, scale, margin) {
  const total = (size + margin * 2) * scale;
  const buf = new Uint8ClampedArray(total * total * 4);
  buf.fill(255);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!modules[r][c]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const i = (((r + margin) * scale + dy) * total + ((c + margin) * scale + dx)) * 4;
          buf[i] = 0; buf[i + 1] = 0; buf[i + 2] = 0; buf[i + 3] = 255;
        }
      }
    }
  }
  return { data: buf, width: total, height: total };
}

const cases = [
  'http://172.26.149.94:59349/',
  'http://192.168.1.5:64526/',
  'http://10.0.0.2:1024/',
  'http://255.255.255.255:65535/',
  'https://campus.example.com/index.html',
  'http://192.168.100.200:65535/?a=1',
  'http://192.168.0.1:8080/#/tt/rooms',
  '校园通',
  'http://a.b/',
];

let pass = 0, fail = 0;
console.log('== 编码 → 渲染 → jsQR 解码 ==');
for (const text of cases) {
  const q = qr.encode(text);
  const img = render(q.modules, q.size, 4, 4);
  const res = jsQR(img.data, img.width, img.height);
  const okDecode = !!(res && res.data === text);
  console.log((okDecode ? 'PASS ' : 'FAIL ') + 'v' + q.version + ' ' + q.size + 'x' + q.size +
    ' mask' + q.mask + '  ' + JSON.stringify(text));
  if (okDecode) pass++; else fail++;
}

try { qr.encode('x'.repeat(200)); console.log('FAIL 超长输入未抛错'); fail++; }
catch (e) { console.log('PASS 超长输入正确抛错'); pass++; }

console.log('');
console.log('结果: 通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
