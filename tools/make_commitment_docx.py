# -*- coding: utf-8 -*-
"""生成《校园通 CampusKit · 产品承诺书》DOCX。

承诺条款中的每一项都与产品实际实现/实测结果对应，不写无法验证的承诺。
"""
import os
import sys

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

OUT = sys.argv[1] if len(sys.argv) > 1 else "校园通-产品承诺书.docx"

FONT_HEI = "黑体"
FONT_SONG = "宋体"
FONT_LATIN = "Times New Roman"


def style_run(run, east=FONT_SONG, latin=FONT_LATIN, size=11, bold=False, color=None):
    run.font.name = latin
    run.font.size = Pt(size)
    run.font.bold = bold
    if color:
        run.font.color.rgb = color
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.get_or_add_rFonts()
    rFonts.set(qn("w:eastAsia"), east)
    rFonts.set(qn("w:ascii"), latin)
    rFonts.set(qn("w:hAnsi"), latin)


def para(doc, text="", east=FONT_SONG, size=11, bold=False, align=None,
         space_before=0, space_after=6, indent_first=True, line=1.5):
    p = doc.add_paragraph()
    if align is not None:
        p.alignment = align
    pf = p.paragraph_format
    pf.space_before = Pt(space_before)
    pf.space_after = Pt(space_after)
    pf.line_spacing = line
    if indent_first and text:
        pf.first_line_indent = Pt(size * 2)
    if text:
        style_run(p.add_run(text), east=east, size=size, bold=bold)
    return p


def heading(doc, text):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.space_before = Pt(12)
    pf.space_after = Pt(6)
    pf.line_spacing = 1.4
    style_run(p.add_run(text), east=FONT_HEI, size=13, bold=True)
    return p


def bullet(doc, text, size=10.5):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.left_indent = Pt(21)
    pf.first_line_indent = Pt(-10.5)
    pf.space_after = Pt(3)
    pf.line_spacing = 1.45
    style_run(p.add_run("· " + text), size=size)
    return p


def make_table(doc, headers, rows, widths=None):
    t = doc.add_table(rows=1, cols=len(headers))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, h in enumerate(headers):
        cell = t.rows[0].cells[i]
        cell.text = ""
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(2)
        p.paragraph_format.space_before = Pt(2)
        style_run(p.add_run(h), east=FONT_HEI, size=9.5, bold=True)
    for row in rows:
        cells = t.add_row().cells
        for i, val in enumerate(row):
            cells[i].text = ""
            p = cells[i].paragraphs[0]
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.line_spacing = 1.25
            style_run(p.add_run(val), size=9.5)
    if widths:
        for r in t.rows:
            for i, w in enumerate(widths):
                r.cells[i].width = Cm(w)
    # 禁止行内跨页断开，避免一行被拆到两页（出现"APK"独占一页之类的孤行）
    for r in t.rows:
        r._tr.get_or_add_trPr().append(OxmlElement('w:cantSplit'))
    return t


doc = Document()
sec = doc.sections[0]
sec.top_margin = Cm(2.4)
sec.bottom_margin = Cm(2.2)
sec.left_margin = Cm(2.2)
sec.right_margin = Cm(2.2)

# ---------- 标题 ----------
para(doc, "产品承诺书", east=FONT_HEI, size=22, bold=True,
     align=WD_ALIGN_PARAGRAPH.CENTER, indent_first=False, space_after=4, line=1.2)
para(doc, "校园通 CampusKit", east=FONT_HEI, size=14, bold=False,
     align=WD_ALIGN_PARAGRAPH.CENTER, indent_first=False, space_after=14, line=1.2)

info = [
    ("产品名称", "校园通 CampusKit"),
    ("产品形态", "Windows 桌面软件、Android 应用（APK）、网页应用（PWA）"),
    ("版本号", "v1.0"),
    ("参赛赛事", "＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿"),
    ("承诺方（团队名称）", "＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿"),
    ("所在学校 / 单位", "＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿"),
    ("团队负责人", "＿＿＿＿＿＿＿＿＿＿"),
    ("日期", "＿＿＿＿ 年 ＿＿ 月 ＿＿ 日"),
]
t = make_table(doc, ["项目", "内容"], info, widths=[4.2, 12.0])
doc.add_paragraph()

para(doc, "本团队就参加上述赛事所提交的作品「校园通 CampusKit」（以下简称「本产品」），"
          "郑重作出如下承诺，并接受大赛组委会及评审专家的核查：")

# ---------- 一 ----------
heading(doc, "一、原创性承诺")
para(doc, "1.1 本产品由承诺方独立设计与开发。前端界面与业务逻辑、Windows 桌面外壳、"
          "Android 应用外壳、局域网共享服务、二维码编码器等核心代码，均为承诺方自主编写。")
para(doc, "1.2 未抄袭、剽窃、非法复制任何第三方作品，未将他人在先作品的核心代码或素材作为自身成果申报。")
para(doc, "1.3 产品运行时不依赖任何第三方前端框架或 UI 库（未使用 React、Vue、jQuery 等），"
          "前端为原生 HTML / CSS / JavaScript 实现；二维码编码器为自主实现，未引入第三方库。")
para(doc, "1.4 产品中使用的第三方组件均已合法取得，并如实列明如下：")

make_table(doc,
    ["第三方组件", "用途", "是否随产品分发", "许可"],
    [
        ["Microsoft Edge WebView2 运行时", "桌面版内置浏览器内核", "否（复用系统已安装运行时）", "Microsoft 软件许可条款"],
        ["Microsoft.Web.WebView2 SDK", "桌面版与内核交互的托管库", "是", "BSD 三条款风格许可（含第三方 NOTICE）"],
        ["Android SDK / Build-Tools 34", "构建 APK 的工具链", "否（仅构建期使用）", "Apache License 2.0"],
        ["OpenJDK 17（Eclipse Temurin）", "编译与签名工具", "否（仅构建期使用）", "GPLv2 with Classpath Exception"],
        ["Python + Pillow", "构建期生成应用图标与截屏", "仅图标 PNG 为产物", "Pillow：MIT-CMU 许可"],
        ["系统字体（微软雅黑等）", "生成图标字形时渲染", "否（仅生成期使用）", "随操作系统授权"],
    ],
    widths=[4.4, 4.2, 3.6, 4.0])
para(doc, "注：上表所列为全部第三方依赖，产品中不存在未声明的第三方组件。", size=9.5, space_before=4)

# ---------- 二 ----------
heading(doc, "二、功能真实性承诺")
para(doc, "2.1 承诺产品说明书、演示视频与答辩材料中所述功能均已实际实现、可现场演示验证，"
          "不以效果图、剪辑或不可复现的演示冒充功能。")
para(doc, "2.2 已实现并已实测的主要功能如下：")
make_table(doc,
    ["模块", "已实现能力", "验证方式"],
    [
        ["课表 · 教室", "周课表增删改、时间冲突检测、空闲教室矩阵、社团活动报名、按当前位置推荐最近空教室",
         "内置自测 + 真机尺寸（390×844）设备仿真"],
        ["失物招领", "招领／寻物发布、图片上传、端侧特征匹配与匹配度排序",
         "模拟真实交互提交并核对数据落库"],
        ["校园问答", "问答广场、官方答复标识、政策与办事指南、校园通讯录（含电话与责任部门）",
         "内置自测覆盖渲染与数据完整性"],
        ["手机访问", "局域网共享 + 二维码扫码打开（二维码为自研编码器）",
         "截屏后由解码器回读，结果与地址完全一致"],
        ["多端形态", "Windows 桌面版（独立窗口／单实例／DPI 适配）、Android APK（离线可用）、PWA 离线缓存",
         "桌面版全流程回归；APK 静态校验 + 服务逻辑实测"],
    ],
    widths=[2.8, 8.6, 4.8])

para(doc, "2.3 承诺如实标明产品的演示性质与能力边界，绝不夸大：", space_before=8)
bullet(doc, "首页「空闲教室」的位置推荐使用浏览器／系统定位配合演示用校园坐标，并非学校真实坐标；")
bullet(doc, "教室占用数据中，仅「本人课表」与「社团活动」为用户真实录入，其余「其他班级占用」为"
            "确定性生成的演示数据（同一天结果稳定，不随刷新变化）；")
bullet(doc, "失物招领的「智能匹配」为端侧特征计算（浏览器内提取图片主色与明暗特征，叠加分类、关键词、"
            "地点、时间加权打分），未接入云端视觉大模型，匹配结果为参考而非判定；")
bullet(doc, "政策文本、联系电话、教职员工姓名均系团队虚构，不指向任何真实单位或个人；")
bullet(doc, "本产品未接入教务系统、一卡通、校园定位等任何真实校内系统；当前无服务端，不提供多用户数据共享。")
para(doc, "2.4 承诺不将上述演示数据宣称为真实校内数据，亦不宣称产品已在校内实际部署使用。")

# ---------- 三 ----------
heading(doc, "三、数据安全与个人信息保护承诺")
para(doc, "3.1 不采集、不上传任何用户个人信息。产品不含埋点、统计、上报、崩溃回传等任何数据收集行为；"
          "运行时不向任何外部服务器发起请求——桌面版仅从内置虚拟主机加载本地资源，"
          "Android 版仅从 127.0.0.1 回环地址加载打包资源。")
para(doc, "3.2 用户数据仅保存在用户本机：桌面版存于 %LOCALAPPDATA%\\CampusKit，"
          "手机端存于应用私有目录或浏览器本地存储；数据随应用卸载一并删除，服务端无任何备份。")
para(doc, "3.3 权限最小化：")
bullet(doc, "Windows 桌面版：以普通用户身份运行（asInvoker），不申请管理员权限，不写注册表，"
            "删除文件夹即完全卸载；")
bullet(doc, "Android 版：仅申请 INTERNET（用于本机回环服务）与 ACCESS_FINE_LOCATION、"
            "ACCESS_COARSE_LOCATION（仅「按位置推荐教室」功能使用，运行时弹窗征求同意，拒绝不影响其它功能）。")
para(doc, "3.4 局域网共享功能知情可控：「手机访问」由用户主动点击后开启，服务仅绑定本机回环或内网地址、"
          "只支持读取、仅响应 GET 请求，并已实现目录穿越防护；关闭软件即停止服务。"
          "应用内已明确提示同一 WiFi 下其他设备可访问该地址。")
para(doc, "3.5 不索取、不存储账号口令、身份证号、银行卡号等敏感信息；演示数据中不含任何真实个人隐私。")
para(doc, "3.6 承诺遵守《中华人民共和国网络安全法》《中华人民共和国数据安全法》"
          "《中华人民共和国个人信息保护法》及大赛相关规定。")

# ---------- 四 ----------
heading(doc, "四、无恶意代码承诺")
para(doc, "4.1 产品不含计算机病毒、木马、后门、勒索软件、挖矿程序、窃密程序等任何恶意代码。")
para(doc, "4.2 不含强制弹窗、静默安装其他软件、篡改系统设置、劫持浏览器主页等行为。")
para(doc, "4.3 不含任何隐蔽的远程控制、远程执行或数据回传功能。")
para(doc, "4.4 Android 安装包为自签名（证书标识 CN=CampusKit），签名方案覆盖 v1 / v2 / v3。"
          "因未经应用商店分发，部分手机管家可能提示「未知来源」或「可能存在风险」，"
          "此为自签名应用的通用提示，并非恶意行为；欢迎评审专家对安装包进行安全检测。")

# ---------- 五 ----------
heading(doc, "五、合规与内容承诺")
para(doc, "5.1 产品内容与演示材料不含违反法律法规、公序良俗的信息。")
para(doc, "5.2 问答、失物招领等模块的示例内容均为团队虚构，不涉及真实个人与单位。")
para(doc, "5.3 产品后续若在真实校园投入使用，承诺在接入学校真实数据（教务课表、师生通讯录等）前"
          "取得学校书面授权，并按学校要求完成安全评估与备案。")
para(doc, "5.4 承诺遵守大赛章程、评审规则与保密要求，不泄露赛事非公开信息。")

# ---------- 六 ----------
heading(doc, "六、质量与维护承诺")
para(doc, "6.1 如实告知已知限制，不隐瞒、不回避：")
bullet(doc, "Android 版已通过静态校验（清单、dex、资源条目、签名、对齐）并将服务逻辑在桌面环境实测通过，"
            "但受开发环境所限（无安卓设备与模拟器镜像），尚未在真机上运行验证；")
bullet(doc, "界面已去除 color-mix、inset 等新语法以适配国产浏览器内核（Chromium 86 及以上）；"
            "Chromium 84 以下因不支持 flex gap，元素间距会略显紧凑，功能不受影响；")
bullet(doc, "未在 iOS 真机上实测，PWA 相关行为依据规范实现。")
para(doc, "6.2 提供完整、可复现的构建方式：桌面版提供一键构建脚本（可自动获取所需 SDK 组件）；"
          "Android 版提供不依赖 Gradle 的构建脚本；网页版零依赖可直接运行。")
para(doc, "6.3 提供自动化验证手段：内置 33 项自测（覆盖数据一致性、教室占用引擎、匹配算法、"
          "DOM 集成与移动端布局无溢出）；另附二维码真解码验证与局域网服务安全测试脚本，"
          "评审专家可一键复现。")
para(doc, "6.4 承诺自作品提交之日起至大赛结束后 6 个月内，对收到的缺陷反馈在 3 个工作日内响应，"
          "并对影响正常使用的缺陷提供修复版本。")
para(doc, "6.5 若产品在评审或演示过程中出现故障，团队承诺现场配合排查，不以「环境问题」为由推诿。")

# ---------- 七 ----------
heading(doc, "七、知识产权与责任承担")
para(doc, "7.1 本产品著作权归承诺方所有；若大赛对作品权属另有约定，从其约定。")
para(doc, "7.2 承诺不侵犯任何第三方的著作权、专利权、商标权及其他合法权益。"
          "如发生第三方权利纠纷，由承诺方承担全部责任，与大赛主办方、承办方无关。")
para(doc, "7.3 如违反上述任何一项承诺，承诺方自愿承担由此产生的全部责任，"
          "并接受大赛组委会依据赛事规则作出的处理（包括但不限于取消参赛资格、追回奖项与证书）。")

# ---------- 八 ----------
heading(doc, "八、承诺效力")
para(doc, "8.1 本承诺书自签署之日起生效，对承诺方具有约束力。")
para(doc, "8.2 本承诺书所述内容真实、准确、完整。如有虚假，承诺方愿承担相应法律责任。")

# ---------- 签署 ----------
doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)
para(doc, "签署栏", east=FONT_HEI, size=13, bold=True, indent_first=False, space_after=16)

sig = [
    "承诺方（团队负责人）签字：＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿",
    "",
    "团队成员签字：＿＿＿＿＿＿＿　＿＿＿＿＿＿＿　＿＿＿＿＿＿＿",
    "",
    "指导教师签字：＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿",
    "",
    "学校 / 院系（盖章）：",
    "",
    "",
    "日期：＿＿＿＿ 年 ＿＿ 月 ＿＿ 日",
]
for line in sig:
    para(doc, line, size=11, indent_first=False, space_after=10, line=1.6)

# ---------- 附件 ----------
doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)
para(doc, "附件：可验证项清单（供评审专家快速核验）", east=FONT_HEI, size=12, bold=True,
     indent_first=False, space_before=18, space_after=8)
make_table(doc,
    ["核验项", "操作方式", "预期结果"],
    [
        ["功能自测", "打开网页版，在地址后加 ?selftest=1", "页面标题显示 pass=33 fail=0"],
        ["桌面版运行", "双击 校园通.exe", "独立窗口打开，窗口标题随页面变化"],
        ["手机访问与扫码", "桌面版点左下角「手机访问」", "显示二维码与局域网地址，手机扫码可直接打开"],
        ["APK 权限与版本", "aapt2 dump badging 校园通.apk", "minSdk 21 / targetSdk 34，仅三项权限"],
        ["APK 签名", "apksigner verify -v 校园通.apk", "v1 / v2 / v3 均通过"],
        ["一键重建", "desktop\\build.ps1、android\\build.ps1", "无需 Gradle，可完整重建桌面版与 APK"],
        ["二维码真解码", "node tests\\qr-verify.cjs", "10 组内容全部解码回原文"],
    ],
    widths=[3.0, 6.6, 6.6])

doc.save(OUT)
print("已生成: " + os.path.abspath(OUT))
