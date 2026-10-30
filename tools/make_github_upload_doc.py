# -*- coding: utf-8 -*-
"""生成《校园通 CampusKit · GitHub 上传交接说明》到桌面，同时输出 MD 与 DOCX。

MD 版供另一个 AI 对话读取并执行；DOCX 版供人阅读。
所有路径、体积、文件数均为本机实测值。
"""
import os
import sys

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt

DESKTOP = os.path.join(os.environ.get('USERPROFILE', r'C:\Users\NS'), 'Desktop')
OUT_MD = os.path.join(DESKTOP, '校园通-GitHub上传说明.md')
OUT_DOCX = os.path.join(DESKTOP, '校园通-GitHub上传说明.docx')

FONT_HEI, FONT_SONG, FONT_LATIN = '黑体', '宋体', 'Times New Roman'

PROJ = r'E:\Deepseek Work\Competer\campus-app'
VIDEO = r'E:\Deepseek Work\Competer\_video_build'

# ============================ 内容 ============================
# 块：(kind, payload)  kind: h1/h2/p/bullet/code/table/note
C = [
    ('p', '本文档是「校园通 CampusKit」源码上传 GitHub 的完整交接说明。'
          '接手方（人或 AI）按本文可直接完成上传，无需再询问项目结构。'
          '文中所有路径、文件数、体积均为 2026-10-30 在本机实测。'),

    ('h1', '0. 任务一句话'),
    ('p', '把位于 E:\\Deepseek Work\\Competer\\campus-app 的源码（约 111 个文件、9.5 MB）'
          '上传到 GitHub 新建仓库；**不要**上传其中约 900 MB 的构建工具链与缓存，'
          '也不要上传参赛材料（含个人信息）。'),

    ('h1', '1. 环境现状（先看这一节）'),
    ('bullet', '本机 **未安装 git**：PATH 中没有，常见安装位置（C:\\Program Files\\Git、'
               'LOCALAPPDATA\\Programs\\Git）也没有。→ 必须先安装 Git，或改用网页上传（见第 5 节）。'),
    ('bullet', '未安装 gh CLI（GitHub 官方命令行）。'),
    ('bullet', '未安装 GitHub Desktop。'),
    ('bullet', '系统 Windows（中文），PowerShell 可用；PowerShell 5.1 下含中文的 .ps1 必须存为 UTF-8 with BOM。'),
    ('bullet', '网络在中国大陆：访问 github.com 可能不稳定，第 6 节给了应对办法。'),
    ('bullet', '项目源码根目录：`E:\\Deepseek Work\\Competer\\campus-app`'),

    ('h1', '2. 要上传的代码位置（完整清单）'),
    ('p', '以下为应上传的全部内容，合计 **111 个文件 / 约 9.5 MB**。'),
    ('table', [
        ['路径（相对 campus-app）', '内容', '文件数', '大小'],
        ['（根目录）', 'index.html 应用入口、manifest.webmanifest（PWA 清单）、sw.js（Service Worker）、README.md', '4', '39 KB'],
        ['js\\', '12 个前端模块：main.js 路由/主题、timetable.js 课表与空闲教室、lost.js 失物招领与图片匹配、'
                 'qa.js 问答/政策/通讯录、occupancy.js 教室占用引擎、data.js 数据、store.js 状态、ui.js 组件、'
                 'util.js 工具、qr.js 自研二维码编码器、install.js 安装引导、campus-map.js 校园地图', '12', '194 KB'],
        ['css\\styles.css', '全部样式（浅色/深色、响应式）', '1', '45 KB'],
        ['icons\\', 'PWA 图标 4 个（192/512/maskable/apple-touch）', '4', '98 KB'],
        ['img\\', '校园地图底图 base-amap.jpg 与其坐标元数据 base-amap.json（campus-map.js 第 103 行引用，必须上传）', '2', '430 KB'],
        ['tests\\', 'selftest.js（39 项自测）、qr-verify.cjs（二维码真解码）、campus-map-verify.cjs（地图校验）', '3', '35 KB'],
        ['tools\\', '文档生成与验证脚本 12 个（申报书、承诺书、提示词、指令记录、演示视频脚本等）', '12', '140 KB'],
        ['docs\\', '38 张界面截图（桌面版/手机端/深色模式），README 中引用了其中的路径', '38', '7.7 MB'],
        ['desktop\\', 'Windows 桌面版工程：Program.cs（WinForms + WebView2 外壳）、LanServer.cs（局域网只读服务）、'
                      'app.manifest、app.config、build.ps1、icon_gen.py、app.ico、icon_preview.png、使用说明.txt', '9', '141 KB'],
        ['android\\', '安卓工程：AndroidManifest.xml、build.ps1（不用 Gradle 的构建脚本）、make_icons.py、'
                      '安装说明-APK.txt、src\\（MainActivity.java、AssetServer.java）、res\\（图标与资源）', '26', '690 KB'],
    ]),
    ('note', '另外还有一个**可选**目录 `E:\\Deepseek Work\\Competer\\_video_build`（24 个文件、19.1 MB）：'
             '演示视频的自动录制与合成脚本（record.mjs / timeline.mjs / inject.js / encode.ps1 / tts.ps1 等）。'
             '若想一并开源视频制作流程，可把它放进仓库的 `video-build/` 子目录，'
             '但**必须排除** `frames\\`（262 MB 帧序列）与 `audio\\`（7 MB 旁白缓存）。'),

    ('h1', '3. 必须排除的内容（约 900 MB，且含隐私）'),
    ('table', [
        ['排除项（绝对路径）', '体积', '原因'],
        [r'campus-app\android\_sdk', '533.9 MB', 'Android SDK 工具链，构建脚本会自动重新下载'],
        [r'campus-app\android\_dl', '297.8 MB', 'SDK 压缩包下载缓存'],
        [r'campus-app\desktop\_sdk', '71.7 MB', 'WebView2 SDK 与验证工具，build.ps1 会自动获取'],
        [r'campus-app\android\build', '1.3 MB', '编译中间产物'],
        [r'campus-app\android\assets', '0.8 MB', r'由 android\build.ps1 从上级目录自动复制生成'],
        [r'campus-app\desktop\build', '0.1 MB', '编译中间产物'],
        [r'campus-app\desktop\__pycache__', '—', 'Python 字节码缓存'],
        [r'campus-app\css\styles.css.bak', '37 KB', '开发期备份文件'],
        [r'campus-app\android\校园通.apk.idsig', '14 KB', '签名中间文件'],
        [r'campus-app\android\校园通.apk', '631 KB', '构建产物，建议放到 GitHub Releases 而非源码'],
        [r'_video_build\frames、_video_build\audio', '269 MB', '演示视频的帧序列与旁白缓存'],
        [r'E:\AI大赛\ 下的申报书/承诺书/指令记录等', '—', '**含个人与团队信息**，且与代码仓库无关，切勿上传'],
    ]),
    ('note', '这些缓存删掉后不影响复现：`android\\build.ps1` 会重新下载 JDK 与 Android SDK（约 300 MB），'
             '`desktop\\build.ps1` 会重新获取 WebView2 SDK。'),

    ('h1', '4. 直接可用的 .gitignore（复制到仓库根目录）'),
    ('p', '在 `campus-app\\` 下新建名为 `.gitignore` 的文件，内容如下：'),
    ('code', '''# ── 构建工具链与下载缓存（构建脚本会自动重新获取） ──
_dl/
_sdk/
build/
__pycache__/
*.pyc
node_modules/

# ── 自动生成 ──
android/assets/

# ── 构建产物 ──
*.apk
*.idsig
*.exe
*.dll
*.zip
dist/

# ── 临时与备份 ──
*.bak
*.tmp
*.log
.dsh-office-*/

# ── 系统 ──
Thumbs.db
desktop.ini
.DS_Store'''),

    ('h1', '5. 上传步骤（三条路线，任选其一）'),

    ('h2', '路线 A · 安装 Git 后用命令行上传（推荐，便于日后更新）'),
    ('p', '1）安装 Git for Windows'),
    ('bullet', '官网：https://git-scm.com/download/win'),
    ('bullet', '或命令行：`winget install --id Git.Git -e`'),
    ('bullet', '国内下载慢可换镜像（华为云/腾讯软件源搜索 Git for Windows）'),
    ('bullet', '装完后**必须新开一个 PowerShell 窗口**，再执行 `git --version` 验证'),
    ('p', '2）配置身份与中文显示（只需一次）'),
    ('code', '''git config --global user.name "你的名字"
git config --global user.email "你的邮箱@example.com"
git config --global core.autocrlf true
git config --global core.quotepath false    # 中文文件名不乱码，重要'''),
    ('p', '3）在 GitHub 网页新建仓库'),
    ('bullet', '打开 https://github.com/new'),
    ('bullet', '仓库名建议：`campuskit`（或 campus-hub）'),
    ('bullet', '**不要**勾选 Add a README / Add .gitignore / Choose a license —— 本地已有'),
    ('bullet', '如担心参赛规则限制公开代码，先选 **Private**（见第 8 节）'),
    ('p', '4）本地初始化、提交、推送'),
    ('code', '''# 先把第 4 节的 .gitignore 内容保存为 E:\\Deepseek Work\\Competer\\campus-app\\.gitignore
cd "E:\\Deepseek Work\\Competer\\campus-app"

git init
git add .
git status --short          # 核对：文件数应约 110，且看不到 _sdk / _dl / build / assets
git commit -m "feat: 校园通 CampusKit —— 课表·教室 / 失物招领 / 校园问答（桌面·安卓·网页三端同源）"
git branch -M main
git remote add origin https://github.com/你的用户名/campuskit.git
git push -u origin main'''),
    ('bullet', 'https 推送时会要求登录：GitHub 已不接受账号密码，需用 **Personal Access Token** 代替密码'
               '（详见第 6 节）；Git for Windows 自带的 Credential Manager 会弹出浏览器授权，按提示走即可'),
    ('p', '5）验证：浏览器打开仓库，确认文件数与本地一致、README 正常显示'),

    ('h2', '路线 B · GitHub 网页上传（不装 Git，适合一次性）'),
    ('bullet', '新建仓库（同上），进入仓库页 → Add file → Upload files'),
    ('bullet', '在资源管理器打开 `E:\\Deepseek Work\\Competer\\campus-app`，'
               '**先手动跳过第 3 节列出的目录**，再全选拖入浏览器'),
    ('bullet', '网页上传对单次文件数与体积有限制，建议分三批：'
               '① 根目录 4 个文件 + js + css + icons + img；② tests + tools + docs；③ desktop + android（去掉 assets 与 build）'),
    ('bullet', '每批填写 commit message 后提交'),
    ('note', '网页上传的缺点：以后每次改动都要重新拖，容易漏文件；无法设置 .gitignore 自动过滤。'
             '一次性上传可以用，长期维护建议路线 A。'),

    ('h2', '路线 C · GitHub Desktop（图形化）'),
    ('bullet', '下载安装 GitHub Desktop 并用 GitHub 账号登录'),
    ('bullet', 'File → Add local repository → 选择 `E:\\Deepseek Work\\Competer\\campus-app`'),
    ('bullet', '它会提示生成 .gitignore，务必把第 3 节的目录排除后再 Publish repository'),
    ('bullet', '点 Publish repository 时注意取消勾选 "Keep this code private"（若要公开）'),
    ('note', '注意：GitHub Desktop 会把目录下**所有**文件纳入版本控制，'
             '如果漏掉排除规则，它会尝试上传 900 MB 缓存，请务必先建好 .gitignore。'),

    ('h1', '6. 网络与认证问题（中国大陆常见）'),
    ('h2', '推送卡住 / 报 443 超时'),
    ('code', '''# 若本机有代理（端口按实际改）
git config --global http.proxy http://127.0.0.1:7890
git config --global https.proxy http://127.0.0.1:7890
# 取消代理
git config --global --unset http.proxy
git config --global --unset https.proxy'''),
    ('h2', '改用 SSH（通常比 HTTPS 稳）'),
    ('code', '''ssh-keygen -t ed25519 -C "你的邮箱@example.com"     # 一路回车
# 把 C:\\Users\\<用户名>\\.ssh\\id_ed25519.pub 的内容整段复制
# 粘贴到 GitHub → Settings → SSH and GPG keys → New SSH key
ssh -T git@github.com                                     # 出现 successfully authenticated 即成功
git remote set-url origin git@github.com:你的用户名/campuskit.git'''),
    ('h2', '认证失败 / 要求密码'),
    ('bullet', 'GitHub 2021 年起停用账号密码推送，必须用 **Personal Access Token**：'
               'GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → '
               'Generate new token，勾选 `repo` 权限，生成后复制保存（只显示一次），推送时把它当密码粘贴'),
    ('bullet', '若推送大文件被中断：`git config --global http.postBuffer 524288000`'),
    ('bullet', '本仓库无大文件（最大 437 KB 的底图），不会触发 Git LFS 限制'),

    ('h1', '7. 建议的仓库信息'),
    ('table', [
        ['项目', '建议值'],
        ['仓库名', 'campuskit'],
        ['Description', '校园通 CampusKit —— 一站式校园服务助手：课表/空闲教室/社团活动合并视图、'
                        '失物招领图片智能匹配、校园问答（政策+通讯录）。纯前端零框架，桌面·安卓·网页三端同源，离线可用。'],
        ['Topics', 'campus  vanilla-javascript  pwa  offline-first  winforms  webview2  android  education'],
        ['Releases 附件', '校园通.exe（桌面版，绿色免安装）、校园通.apk（安卓版，218 KB）、演示视频.mp4（3 分 33 秒）'],
        ['License', '**暂不建议添加**。本项目同时是参赛作品，承诺书中有"参赛作品及成果产权归大赛组委会所有"条款，'
                    '添加开源许可证可能与之冲突；确需添加请先与赛事方确认。'],
    ]),

    ('h1', '8. ⚠️ 上传前必须确认的一件事（版权）'),
    ('p', '本项目是"银移杯校园 AI Agent 创新大赛"的参赛作品，已签署的《诚信承诺书》中包含：'),
    ('code', '本团队（本人）知悉并同意：本次大赛参赛作品及成果的产权归大赛组委会所有。'),
    ('bullet', '**公开源码前请先向赛事方确认是否允许公开**（有些赛事要求作品在评审期间保密）。'),
    ('bullet', '若不确定：先建 **Private 私有仓库**完成上传，确认允许后再改为 Public。'),
    ('bullet', '上传内容中**绝不能包含**：申报书、承诺书扫描件、指令记录等含姓名/学校/联系方式的文件；'
               '这些都在 `E:\\AI大赛\\` 下，不在 `campus-app\\` 内，只要按第 2 节清单上传就不会带入。'),

    ('h1', '9. 上传后的自检清单'),
    ('bullet', '仓库根目录能看到 `README.md`、`index.html`、`sw.js`、`manifest.webmanifest`、`.gitignore`'),
    ('bullet', '文件数约 110 个，仓库体积约 9 MB（不含 Releases）'),
    ('bullet', '仓库里搜不到：`_sdk`、`_dl`、`build/`、`assets/`、`__pycache__`、`.bak`、`.idsig`、`.apk`、`.exe`'),
    ('bullet', '没有申报书 / 承诺书 / 通讯录等含个人信息的文档'),
    ('bullet', '中文文件名显示正常（若乱码：执行 `git config --global core.quotepath false` 后重新提交）'),
    ('bullet', 'README 中的 `docs/...` 路径与实际目录一致'),

    ('h1', '10. 可选改进：让 README 直接显示截图'),
    ('p', '当前 README.md 只在正文里提到了截图路径（如 `docs/16-桌面版实测-*.png`），'
          '**没有使用 Markdown 图片语法**，所以在 GitHub 页面上看不到图。')
    ,
    ('p', '若想让仓库首页更直观，可在 README 顶部「功能一览」附近插入以下几行（图片已存在于 docs\\）：'),
    ('code', '''## 界面预览

| 课表 · 教室 | 空闲教室 · 位置推荐 |
|---|---|
| ![课表](docs/01-课表.png) | ![空闲教室](docs/02-空闲教室.png) |

| 失物招领 · 智能匹配 | 校园问答 · 通讯录 |
|---|---|
| ![智能匹配](docs/05-智能匹配.png) | ![通讯录](docs/08-校园通讯录.png) |'''),
    ('note', '插入前请先用 `dir docs` 核对实际文件名（截图编号可能与我写的不完全一致），'
             '路径写错会显示成裂图。'),

    ('h1', '11. 后续更新代码'),
    ('code', '''cd "E:\\Deepseek Work\\Competer\\campus-app"
git add -A
git commit -m "fix: 说明这次改了什么"
git push'''),

    ('h1', '12. 上传前快速核对命令（PowerShell 可直接跑）'),
    ('p', '① 统计将被上传的文件数与体积（不需要 git）：'),
    ('code', '''cd "E:\\Deepseek Work\\Competer\\campus-app"
$ex = '\\\\(_dl|_sdk|build|assets|__pycache__|node_modules)\\\\|\\\\.dsh-office'
$f = Get-ChildItem -Recurse -File |
  Where-Object { $_.FullName -notmatch $ex -and $_.Extension -notin @('.bak','.pyc','.idsig','.log','.tmp') }
"文件数: $($f.Count)"
"体积: {0:N2} MB" -f (($f | Measure-Object -Property Length -Sum).Sum / 1MB)'''),
    ('p', '预期输出：`文件数: 111`、`体积: 9.48 MB`（若含 android\\校园通.apk）。'),
    ('p', '② 若已 git init 并 add，用这条核对暂存区：'),
    ('code', '''git status --short | Measure-Object -Line          # 行数 ≈ 文件数
git ls-files | Select-String "_sdk|_dl|/build/|__pycache__|\\.bak|\\.idsig"   # 应无输出'''),

    ('h1', '附：本项目是做什么的（写 commit / 简介时可用）'),
    ('p', '**校园通 CampusKit** 是一个面向高校学生的校园服务应用，把三件高频小事收进同一个入口：'),
    ('bullet', '**课表 · 教室**：周课表、空闲教室矩阵（28 间教室 × 5 个大节）、社团活动，'
               '三者共用同一套教室占用计算；支持按当前位置推荐最近的空教室（含距离与步行时间）。'),
    ('bullet', '**失物招领**：发布招领/寻物（含照片），在本机提取图片主色与明暗特征，'
               '叠加分类、关键词、地点、时间加权打分，输出匹配度与可核验的匹配理由。'),
    ('bullet', '**校园问答**：问答广场、政策与办事指南（含责任部门、电话、地点、材料、步骤）、校园通讯录（可一键拨号）。'),
    ('p', '技术形态：过程中先做课表，逐步演进为课表/教室合并，再补失物招领与问答；'
          '纯原生 HTML/CSS/JS（无框架、无构建步骤、无运行时依赖），'
          '桌面端用 WinForms + WebView2 封装，安卓端用 WebView + 内置只读回环 HTTP 服务（不使用 Gradle，'
          '以 aapt2/javac/d8/apksigner 手工构建），网页端为 PWA（可安装、离线可用）。'
          '项目自带 39 项自动化自测与多个验证脚本（二维码真解码、局域网安全测试、地图校验）。'),
    ('note', '常见问题：这是"套壳浏览器"吗？不是。桌面端经虚拟主机映射加载本地资源以获得安全上下文；'
             '安卓端内置本地回环 HTTP 服务，使 localStorage、Service Worker 与定位行为与正式网站一致。'
             '这一设计取舍的原因写在 `campus-app\\README.md` 中。'),
]


# ============================ 输出 ============================
def style_run(run, east=FONT_SONG, size=11, bold=False):
    run.font.name = FONT_LATIN
    run.font.size = Pt(size)
    run.font.bold = bold
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.get_or_add_rFonts()
    rFonts.set(qn('w:eastAsia'), east)
    rFonts.set(qn('w:ascii'), FONT_LATIN)
    rFonts.set(qn('w:hAnsi'), FONT_LATIN)


def make_docx():
    doc = Document()
    s = doc.sections[0]
    s.top_margin = Cm(2.2); s.bottom_margin = Cm(2.2)
    s.left_margin = Cm(2.2); s.right_margin = Cm(2.2)

    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(2)
    style_run(p.add_run('校园通 CampusKit'), east=FONT_HEI, size=13)
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(14)
    style_run(p.add_run('GitHub 上传交接说明'), east=FONT_HEI, size=20, bold=True)

    for kind, payload in C:
        if kind == 'h1':
            q = doc.add_paragraph()
            q.paragraph_format.space_before = Pt(14); q.paragraph_format.space_after = Pt(6)
            style_run(q.add_run(payload), east=FONT_HEI, size=14, bold=True)
        elif kind == 'h2':
            q = doc.add_paragraph()
            q.paragraph_format.space_before = Pt(10); q.paragraph_format.space_after = Pt(4)
            style_run(q.add_run(payload), east=FONT_HEI, size=12, bold=True)
        elif kind == 'p':
            q = doc.add_paragraph()
            q.paragraph_format.space_after = Pt(5); q.paragraph_format.line_spacing = 1.45
            q.paragraph_format.first_line_indent = Pt(22)
            style_run(q.add_run(payload.replace('**', '')))
        elif kind == 'bullet':
            q = doc.add_paragraph()
            q.paragraph_format.left_indent = Pt(22); q.paragraph_format.first_line_indent = Pt(-11)
            q.paragraph_format.space_after = Pt(3); q.paragraph_format.line_spacing = 1.4
            style_run(q.add_run('· ' + payload.replace('**', '')), size=10.5)
        elif kind == 'note':
            q = doc.add_paragraph()
            q.paragraph_format.left_indent = Pt(11); q.paragraph_format.space_before = Pt(3)
            q.paragraph_format.space_after = Pt(8); q.paragraph_format.line_spacing = 1.4
            style_run(q.add_run('提示：' + payload.replace('**', '')), size=10.5)
        elif kind == 'code':
            for line in payload.split('\n'):
                q = doc.add_paragraph()
                q.paragraph_format.left_indent = Pt(14)
                q.paragraph_format.space_after = Pt(0); q.paragraph_format.line_spacing = 1.15
                r = q.add_run(line if line else ' ')
                r.font.name = 'Consolas'; r.font.size = Pt(9)
                rPr = r._element.get_or_add_rPr(); rFonts = rPr.get_or_add_rFonts()
                rFonts.set(qn('w:eastAsia'), FONT_SONG)
                rFonts.set(qn('w:ascii'), 'Consolas'); rFonts.set(qn('w:hAnsi'), 'Consolas')
            doc.add_paragraph()
        elif kind == 'table':
            rows = payload
            t = doc.add_table(rows=1, cols=len(rows[0]))
            t.style = 'Table Grid'; t.alignment = WD_TABLE_ALIGNMENT.CENTER
            for i, h in enumerate(rows[0]):
                c = t.rows[0].cells[i]; c.text = ''
                cp = c.paragraphs[0]; cp.alignment = WD_ALIGN_PARAGRAPH.CENTER
                cp.paragraph_format.space_after = Pt(2)
                style_run(cp.add_run(h.replace('**', '')), east=FONT_HEI, size=9.5, bold=True)
            for row in rows[1:]:
                cells = t.add_row().cells
                for i, v in enumerate(row):
                    cells[i].text = ''
                    cp = cells[i].paragraphs[0]
                    cp.paragraph_format.space_after = Pt(2); cp.paragraph_format.line_spacing = 1.25
                    style_run(cp.add_run(v.replace('**', '')), size=9)
            n = len(rows[0])
            widths = [7.0, 6.0, 1.8, 1.8] if n == 4 else ([4.2, 12.4] if n == 2 else [16.6])
            for r in t.rows:
                for i, w in enumerate(widths[:n]):
                    r.cells[i].width = Cm(w)
                r._tr.get_or_add_trPr().append(OxmlElement('w:cantSplit'))
            doc.add_paragraph()

    doc.save(OUT_DOCX)
    print('DOCX: ' + OUT_DOCX)


def make_md():
    out = ['# 校园通 CampusKit · GitHub 上传交接说明', '',
           '> 本文档供接手方（人或 AI）直接执行上传，所有路径与体积均为本机实测。', '']
    for kind, payload in C:
        if kind == 'h1':
            out += ['## ' + payload, '']
        elif kind == 'h2':
            out += ['### ' + payload, '']
        elif kind == 'p':
            out += [payload, '']
        elif kind == 'bullet':
            out += ['- ' + payload]
            if payload is C[-1][1]:
                out.append('')
        elif kind == 'note':
            out += ['> **提示**：' + payload, '']
        elif kind == 'code':
            out += ['```powershell', payload, '```', '']
        elif kind == 'table':
            rows = payload
            out += ['| ' + ' | '.join(rows[0]) + ' |', '|' + '---|' * len(rows[0])]
            for row in rows[1:]:
                out += ['| ' + ' | '.join(row) + ' |']
            out.append('')
    # bullet 组后补空行
    text = '\n'.join(out)
    lines = text.split('\n')
    fixed = []
    for i, ln in enumerate(lines):
        fixed.append(ln)
        if ln.startswith('- ') and (i + 1 >= len(lines) or not lines[i + 1].startswith('- ')):
            fixed.append('')
    text = '\n'.join(fixed)
    while '\n\n\n' in text:
        text = text.replace('\n\n\n', '\n\n')
    with open(OUT_MD, 'w', encoding='utf-8') as f:
        f.write(text)
    print('MD:   ' + OUT_MD)


if __name__ == '__main__':
    make_md()   # 只输出 Markdown：桌面交付物只保留 .md（按用户要求）
