# -*- coding: utf-8 -*-
"""生成《校园通 CampusKit · AI 指令记录》，输出 DOCX（提交用）与 Markdown（复制用）。

用途：竞赛申报中的「AI 使用记录 / 人机协作过程说明」。
范围由 RANGE 控制，默认第 1–15 条（需求定义 → 桌面软件 → 多端两用 → 安卓 APK）。
"""
import os
import sys

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt

OUT_DOCX = sys.argv[1] if len(sys.argv) > 1 else "校园通-AI指令记录.docx"
OUT_MD = sys.argv[2] if len(sys.argv) > 2 else "AI指令记录.md"
RANGE = (int(sys.argv[3]), int(sys.argv[4])) if len(sys.argv) > 4 else (1, 15)

FONT_HEI, FONT_SONG, FONT_LATIN = "黑体", "宋体", "Times New Roman"

# (序号, 指令原话, 需求解读, 交付物, 关键验证 / 修复, 备注)
ITEMS = [
    (1, "课表，失物招领，校园问答，空闲教室查询，",
     "先划出四个功能模块的边界。",
     "确认信息架构与页面结构；因交付形态的确认提问被跳过，按本地网页应用默认方案推进。",
     "确定技术基线：纯前端、零第三方依赖、离线可用、数据存 localStorage。",
     ""),
    (2, "……校园问答可以包括政策，相关老师，联系电话，失物招领，失主可以输入丢失的物件，"
        "ai根据图片自动推送相关帖子，课表和教室查询合并，让社团活动，自习室更方便查询，"
        "并根据当前位置推荐最近教室",
     "四个模块细化为三个：课表与教室合并；问答增加政策、教师与联系电话；"
     "失物招领增加图片智能匹配；教室按当前位置推荐。",
     "课表·教室（周课表 + 空闲教室矩阵 + 位置推荐 + 社团活动）、"
     "失物招领（图片端侧匹配）、校园问答（问答广场 + 政策指南 + 校园通讯录）。",
     "明确能力边界并写入界面：图片匹配为端侧特征计算，未接入云端视觉大模型。",
     "此后所有模块共用同一套教室占用计算，避免课表与教室数据互相矛盾。"),
    (3, "继续",
     "继续实现数据层与业务逻辑。",
     "util / data / store / ui / occupancy 五个基础模块，三套视图与哈希路由。",
     "内置自测：数据一致性、课表冲突、占用引擎稳定性、匹配算法、DOM 集成。",
     ""),
    (4, "继续",
     "继续实现与验证。",
     "完成三个模块的全部交互；用无头浏览器截图逐页核对渲染结果。",
     "自测扩展到 30 项；修正种子课表的三处时间冲突与红色被识别为橙色的问题。",
     ""),
    (5, "继续",
     "继续推进。",
     "补齐移动端响应式、深色模式、README 与截图归档。",
     "发现并修复移动端整页横向溢出（网格列被 min-width 撑爆）。",
     ""),
    (6, "file:///E:/Deepseek%20Work/Competer/campus-app/index.html#/tt 这个在哪里",
     "询问该地址对应的磁盘位置。",
     "说明 %20 为空格转义、#/tt 为页内路由；给出真实路径与两种打开方式。",
     "顺带说明 file:// 下浏览器会禁用设备定位，故改用本地服务演示。",
     ""),
    (7, "给我做成软件",
     "从网页升级为可双击运行的桌面程序。",
     "WinForms + WebView2 原生外壳：独立窗口与图标、单实例、窗口状态记忆、"
     "有计划地降级到系统浏览器；主程序仅 63 KB。",
     "解决三个真实阻碍：E 盘被 CLR 判为远程位置导致依赖无法加载；"
     "150% 缩放下网页只占窗口一角（Bounds 需物理像素）；"
     "仅靠 app.config 声明 DPI 感知不生效，必须写入嵌入式清单。",
     "打包为绿色版：不写注册表、不需管理员权限，删除文件夹即卸载。"),
    (8, "放在E盘的AI大赛文件夹里面",
     "指定交付落地位置。",
     "发布到 E:\\AI大赛\\校园通\\，含快捷方式安装脚本、卸载脚本、使用说明。",
     "验证快捷方式、单实例唤起、窗口状态恢复均正常。",
     ""),
    (9, "为什么内存这么小",
     "对内存占用数据提出质疑。",
     "复核后主动纠正自己的错报：47.6 MB 只是宿主进程，"
     "实际为 7 个进程合计约 424–470 MB。",
     "同时纠正此前「32 个内核进程」的说法——那是按进程名全机统计，属于本应用的只有 6 个。",
     "结论如实说明：节省的是磁盘（3 MB vs 需自带 Chromium），内存并不比同类方案低。"),
    (10, "不用省内存 + 内存表格 + 继续",
     "放弃内存优化，转向尚未完成的工作。",
     "用 WebView2 远程调试接口驱动真实窗口做端到端验收："
     "逐页渲染、AI 匹配真实交互、发布流程落库。",
     "发布流程实测：卡片 11→12 → localStorage 落库 12 → 清理回 11；JS 异常 0 条。",
     "同时发现并修复测试脚本自身的时序问题（路由重渲染是异步的）。"),
    (11, "继续",
     "继续收尾。",
     "整理发布包：运行资源与文档分离；补充可复现的验收方法到文档。",
     "复跑全部验收，结果与整理前一致。",
     ""),
    (12, "手机电脑两用板",
     "要求同一产品在手机与电脑上都能用。",
     "探明本机无 Java / Android SDK 后，手机端定为 PWA 路线："
     "manifest、Service Worker 离线缓存、安装图标；"
     "桌面版内建只读内网服务（TcpListener 手写，避免管理员权限），供手机扫码访问。",
     "内网服务经安全校验：5 种目录穿越（含编码变体）全部 403、写操作 405、"
     "响应体与源文件逐字节一致。",
     "手机与电脑数据各自独立，不做同步，文档中已写明；"
     "随后另有一条「要」——回应我上一轮末尾关于二维码的提议："
     "自研零依赖 QR 编码器（字节模式、纠错等级 L、版本 1–4 自动择版、8 种掩码按规范罚分择优），"
     "实现扫码即开，免去手输 IP。"),
    (13, "手机是能安装成APP，并且官方浏览器均可使用",
     "手机上要能安装成应用，且各官方浏览器都要正常。",
     "排查出会破坏界面的兼容缺陷：22 处 color-mix()（需 Chrome 111+ / Safari 16.2+）"
     "在国产内核上会全部失效，改为 rgba 变量配色；"
     "并实现分平台安装引导（含 iOS 分享菜单、微信内置浏览器的处理）。",
     "视觉回归核对配色计算值全部正确；390×844 设备仿真下 7 个页面零横向溢出。",
     "同时修正我此前「局域网 http 无法安装」的不完整说法：iOS 在 http 下即可添加到主屏幕。"),
    (14, "vivo",
     "针对 vivo 等国产浏览器做适配确认。",
     "修正 inset 简写（需 Chrome 87+）——它在老内核上会让弹层遮罩塌成 0 尺寸、"
     "照片上传区点不动；改为一组 top/right/bottom/left；"
     "并按浏览器品牌定制安装菜单路径。",
     "13 种真实 UA 矩阵逐个加载验证：平台识别、菜单文案、提示条出现率全部正确；"
     "目录穿越与逐字节一致性复测通过。",
     "识别出所有国产浏览器 UA 都含 Chrome/，此前给出的菜单说明与实际不符。"),
    (15, "做成APK",
     "要一个能真正安装到手机上的安卓安装包，而不是网页快捷方式。",
     "从零获取 JDK 17 与 Android SDK（build-tools r34 + platform 34），"
     "不使用 Gradle 手工构建：aapt2 compile/link → javac → d8 → 自行写入 assets → "
     "zipalign → apksigner；产出 218 KB 的校园通.apk 及安装说明。",
     "静态校验全部通过：清单（minSdk 21 / targetSdk 34 / 三项权限 / 中文应用名 / 自适应图标）、"
     "dex 类清单、assets 条目名、签名 v1+v2+v3、4 字节对齐；"
     "服务逻辑在桌面用文件系统桩实测（响应体与源文件逐字节一致、5 种目录穿越全部 404）。",
     "修复四个真实坑：aapt2 在 Windows 上把 assets 条目标成反斜杠（真机会全部 404）、"
     "apksigner 需要 JAVA_HOME、keytool 的正常信息走 stderr 被误判为致命错误、"
     "重复打开同一 zip 导致 IOException。"
     "受环境所限（无安卓设备与模拟器镜像）未在真机运行验证，该限制已写入产品承诺书。"),
]

STAGES = [
    ("第一阶段 · 功能定义（第 1–2 条）",
     "从四个模块的清单，细化为「课表与教室合并」「带政策、教师与电话的问答」"
     "「带图片智能匹配的失物招领」「按位置推荐教室」三项明确需求。"),
    ("第二阶段 · 实现与验证（第 3–6 条）",
     "完成全部业务逻辑、自测体系与渲染核对；产出网页版并确认其运行方式。"),
    ("第三阶段 · 形态升级（第 7–8 条、第 12–15 条）",
     "网页 → Windows 桌面软件 → 手机与电脑两用（PWA + 内网共享 + 二维码扫码）→ "
     "安卓 APK（不用 Gradle 手工构建）；每次升级都要求真跑起来，而不是停留在界面演示。"),
    ("第四阶段 · 质量复盘（第 9–11 条）",
     "对内存数据提出质疑后复核纠错，随后放弃该项优化，"
     "转而用远程调试驱动真实窗口完成端到端验收，并整理发布包。"),
    ("贯穿全程的验证原则",
     "不声称已验证，除非给出可复现的命令与结果；"
     "遇到不确定的 API 先确认真实签名再动手；每修一个缺陷补一条能捕获它的测试。"),
]


def style_run(run, east=FONT_SONG, size=11, bold=False):
    run.font.name = FONT_LATIN
    run.font.size = Pt(size)
    run.font.bold = bold
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.get_or_add_rFonts()
    rFonts.set(qn("w:eastAsia"), east)
    rFonts.set(qn("w:ascii"), FONT_LATIN)
    rFonts.set(qn("w:hAnsi"), FONT_LATIN)


def make_docx():
    doc = Document()
    s = doc.sections[0]
    s.top_margin = Cm(2.2)
    s.bottom_margin = Cm(2.2)
    s.left_margin = Cm(2.2)
    s.right_margin = Cm(2.2)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(2)
    style_run(p.add_run("校园通 CampusKit"), east=FONT_HEI, size=13)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(4)
    style_run(p.add_run("AI 指令记录"), east=FONT_HEI, size=20, bold=True)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(14)
    style_run(p.add_run("（第 %d–%d 条 · 产品开发全程）" % RANGE), size=11)

    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.45
    p.paragraph_format.first_line_indent = Pt(22)
    style_run(p.add_run(
        "本记录如实保存本项目开发过程中提出的指令及其对应的交付结果，"
        "用于说明人机协作过程。为便于核对，交付物与验证结论均写明可复现的查验方式；"
        "其中被我修正过的错误结论亦一并保留，不做美化。"))

    for idx, raw, read, deliver, verify, note in ITEMS:
        if not (RANGE[0] <= idx <= RANGE[1]):
            continue
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(12)
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.line_spacing = 1.35
        style_run(p.add_run("第 %d 条　%s" % (idx, raw)), east=FONT_HEI, size=11.5, bold=True)

        for label, text in (("需求解读", read), ("交付物", deliver), ("验证与修复", verify)):
            if not text:
                continue
            q = doc.add_paragraph()
            q.paragraph_format.left_indent = Pt(22)
            q.paragraph_format.space_after = Pt(3)
            q.paragraph_format.line_spacing = 1.4
            style_run(q.add_run("· " + label + "：" + text), size=10)
        if note:
            q = doc.add_paragraph()
            q.paragraph_format.left_indent = Pt(22)
            q.paragraph_format.space_after = Pt(3)
            q.paragraph_format.line_spacing = 1.4
            style_run(q.add_run("· 备注：" + note), size=10)

    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(16)
    p.paragraph_format.space_after = Pt(6)
    style_run(p.add_run("阶段归纳"), east=FONT_HEI, size=13, bold=True)
    for title, text in STAGES:
        q = doc.add_paragraph()
        q.paragraph_format.space_after = Pt(4)
        q.paragraph_format.line_spacing = 1.45
        style_run(q.add_run(title + "："), east=FONT_HEI, size=10.5, bold=True)
        r = doc.add_paragraph()
        r.paragraph_format.left_indent = Pt(22)
        r.paragraph_format.space_after = Pt(6)
        r.paragraph_format.line_spacing = 1.45
        style_run(r.add_run(text), size=10.5)

    q = doc.add_paragraph()
    q.paragraph_format.space_before = Pt(10)
    q.paragraph_format.line_spacing = 1.45
    style_run(q.add_run(
        "说明：本记录覆盖第 %d–%d 条，即从需求定义到安卓安装包完成的开发全程。"
        "此后的材料整理阶段（产品承诺书、AI 提示词集）不属于产品开发指令，另行成文。"
        % RANGE), size=10)

    doc.save(OUT_DOCX)
    print("DOCX: " + os.path.abspath(OUT_DOCX))


def make_md():
    out = ["# 校园通 CampusKit · AI 指令记录", "",
           "**（第 %d–%d 条 · 产品开发全程）**" % RANGE, "",
           "本记录如实保存本项目开发过程中提出的指令及其对应的交付结果，用于说明人机协作过程。"
           "交付物与验证结论均写明可复现的查验方式；其中被我修正过的错误结论亦一并保留，不做美化。", ""]
    for idx, raw, read, deliver, verify, note in ITEMS:
        if not (RANGE[0] <= idx <= RANGE[1]):
            continue
        out += ["## 第 %d 条　%s" % (idx, raw), "",
                "- **需求解读**：" + read,
                "- **交付物**：" + deliver,
                "- **验证与修复**：" + verify]
        if note:
            out.append("- **备注**：" + note)
        out.append("")
    out += ["## 阶段归纳", ""]
    for title, text in STAGES:
        out += ["- **%s**：%s" % (title, text)]
    out += ["", "> 说明：本记录覆盖第 %d–%d 条，即从需求定义到安卓安装包完成的开发全程。"
                "此后的材料整理阶段（产品承诺书、AI 提示词集）不属于产品开发指令，另行成文。" % RANGE, ""]
    with open(OUT_MD, "w", encoding="utf-8") as f:
        f.write("\n".join(out))
    print("MD:   " + os.path.abspath(OUT_MD))


if __name__ == "__main__":
    make_docx()
    make_md()
