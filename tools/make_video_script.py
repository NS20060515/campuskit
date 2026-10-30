# -*- coding: utf-8 -*-
"""生成《校园通 CampusKit · 演示视频脚本》：分镜脚本 + 旁白全文 + 录制注意事项 + 备用方案。
输出 DOCX（打印/照着念）与 Markdown（复制用）。

说明：文中所有数字均与产品实际实现一致；录制注意事项来自实际验收时遇到的问题
（防火墙首次授权弹窗、定位服务未开、窗口尺寸与缩放、扫码前置条件等）。
"""
import os
import sys

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt

OUT_DOCX = sys.argv[1] if len(sys.argv) > 1 else "校园通-演示视频脚本.docx"
OUT_MD = sys.argv[2] if len(sys.argv) > 2 else "演示视频脚本.md"

FONT_HEI, FONT_SONG, FONT_LATIN = "黑体", "宋体", "Times New Roman"

INFO = [
    ("项目名称", "校园通 CampusKit（一站式校园服务智能助手）"),
    ("建议时长", "2 分 40 秒（控制在 3 分钟以内）"),
    ("旁白总字数", "约 640 字，按每分钟 250 字朗读 ≈ 2 分 30 秒"),
    ("录制方式", "屏幕录制（桌面版）＋ 手机实拍或手机自带录屏（手机端）"),
    ("建议分辨率", "桌面 1920×1080；手机竖屏 1080×2340 或用浏览器设备仿真 390×844"),
    ("交付格式", "MP4 / H.264 / 1080p / 8–12 Mbps，文件名按《上传要求》命名"),
]

STORYBOARD = [
    {
        "no": "镜 1", "time": "00:00 – 00:08", "title": "片头",
        "shot": "黑底 + 居中标题：校园通 CampusKit　—　一站式校园服务智能助手；"
                "副标题：课表 · 教室 / 失物招领 / 校园问答。停留 5 秒后淡出。",
        "say": "这是校园通——把课表、空闲教室、社团活动合成一个入口，再配上带图片识别的失物招领，"
               "和能查政策、查电话的校园问答。同一套代码，电脑和手机都能用，断网也能跑。",
        "overlay": "校园通 CampusKit｜课表·教室　失物招领　校园问答",
    },
    {
        "no": "镜 2", "time": "00:08 – 00:28", "title": "课表：一屏看清本周",
        "shot": "双击「校园通.exe」→ 窗口打开即是课表页（默认第 8 周）→ 鼠标缓慢划过「今天」高亮列 → "
                "鼠标移到一张课程卡片上（不点开）→ 点顶部「空闲教室」标签。",
        "say": "打开就是本周课表，今天这一列自动高亮，每门课的地点、老师和上课周次都写在卡片上。"
               "要说明的是，课表不是孤立的一页数据——它和教室查询用的是同一套占用计算。",
        "overlay": "第 8 周 · 今天 10/22",
    },
    {
        "no": "镜 3", "time": "00:28 – 01:05", "title": "空闲教室 + 位置推荐（核心镜头）",
        "shot": "① 点「空闲教室」，停在顶部推荐卡 2 秒（3 间教室 + 距离 + 步行时间）；"
                "② 点「使用设备定位」（若已定位可直接展示状态文字）；"
                "③ 鼠标沿校园示意图上「你在这里」到教一的虚线缓慢移动；"
                "④ 下滚到教室空闲矩阵，指一下蓝色「我的课」与紫色社团活动占用；"
                "⑤ 点任意一间教室的「详情」，展示当天 5 个时段明细。",
        "say": "这是我最想让你看的一页。28 间教室、每天 5 个大节，哪些空着、哪些被占，一屏看完。"
               "更关键的是它知道你在哪——点一下定位，直接给出离你最近的 3 间空教室，"
               "距离和步行时间都算好了，地图上这条虚线就是从你的位置到那间教室。"
               "矩阵里，我自己的课标成「我的课」，社团活动用紫色标出来，"
               "所以不会出现课表说空着、走过去发现有人在活动的情况。",
        "overlay": "28 间教室 × 5 个大节｜按距离排序｜我的课 / 社团活动 明确标记",
    },
    {
        "no": "镜 4", "time": "01:05 – 01:25", "title": "手机扫码即用（跨端）",
        "shot": "① 点左下角「手机访问」，弹出二维码；② 手机提前打开相机/微信「扫一扫」，"
                "对准屏幕扫码（过程中电脑画面不要动）；③ 手机浏览器打开应用后，"
                "上下滑动一次展示单列布局与底部标签栏；④ 手机停在与电脑同一页（空闲教室）。",
        "say": "电脑上点手机访问，出来一个二维码。手机连同一个 WiFi 扫一下，就能打开同一个应用——"
               "不用安装、不用注册、不用服务器。手机上会自动变成单列布局和底部标签栏，"
               "而且看到的这些教室数据，就是刚才电脑上的那一套。",
        "overlay": "同一 WiFi 扫码即用｜无需安装 · 无需服务器",
    },
    {
        "no": "镜 5", "time": "01:25 – 01:55", "title": "失物招领：照片智能匹配（AI 核心）",
        "shot": "① 切到「失物招领 → 智能匹配」；② 点上传区选择提前放在桌面的耳机照片；"
                "③ 停 2 秒展示识别结果（图片特征：主色 黑色 · 明度 xx% · 素色物体）；"
                "④ 确认物品名称与地点，点「开始智能匹配」；"
                "⑤ 停 3 秒展示匹配结果：匹配度百分比 + 理由标签；"
                "⑥ 鼠标依次划过各条理由（同类物品 / 颜色一致 / 关键词重合 / 地点相近 / 时间接近）。",
        "say": "丢东西是最烦的事。上传一张照片，它先在你的设备上提取主色和明暗特征——照片不出本机。"
               "然后拿这些特征和广场上的帖子做加权比对，给出匹配度和理由："
               "同类物品、颜色一致、关键词重合、地点相近、时间接近。"
               "这五条理由都能自己核对，不是一句「感觉像」。确认之后直接联系拾到的人。",
        "overlay": "端侧特征匹配｜匹配度 + 可核验理由｜照片不出本机",
    },
    {
        "no": "镜 6", "time": "01:55 – 02:15", "title": "校园问答：政策与联系电话",
        "shot": "① 切到「校园问答 → 政策与指南」，点开「学生证补办流程」；"
                "② 停 3 秒展示：责任部门、联系电话、办理地点、办公时间、所需材料、办理步骤；"
                "③ 关闭弹层，切到「校园通讯录」，鼠标划过几张卡片，"
                "指一下「拨打」按钮（不要真的拨出）。",
        "say": "办事类的问题最怕白跑一趟。学生证丢了怎么补办？责任部门、联系电话、"
               "行政楼 208 的办公时间、要带的材料、几个工作日能拿到，一条一条写清楚。"
               "通讯录里 14 个部门，包括辅导员和班主任，点一下就能拨号。",
        "overlay": "政策 6 条 · 通讯录 14 条｜含责任部门与联系电话",
    },
    {
        "no": "镜 7", "time": "02:15 – 02:28", "title": "安卓版：离线安装包",
        "shot": "手机点桌面「校园通」图标启动 APK（可先开飞行模式以证明离线）→ "
                "展示打开后功能正常（翻到空闲教室页）。",
        "say": "安卓版是一个 218 KB 的安装包，装完之后完全离线也能用——"
               "因为所有资源都打包在安装包里了。",
        "overlay": "APK 218 KB｜完全离线运行",
    },
    {
        "no": "镜 8", "time": "02:28 – 02:40", "title": "收尾：技术亮点",
        "shot": "回到桌面版主界面，右侧或底部浮出要点文字（可做逐条上浮动画），"
                "停留 2 秒后淡出，最后一帧留黑底 1 秒。",
        "say": "没有服务器、没有第三方框架、不需要注册账号——纯前端三端同源，"
               "内置 33 项自动化自测。校园通，让校园里的小事一次办成。",
        "overlay": "纯前端零框架｜桌面 · 安卓 · 网页 三端同源｜33 项自动化自测｜离线可用",
    },
]

NARRATION = [
    "（00:00）这是校园通——把课表、空闲教室、社团活动合成一个入口，再配上带图片识别的失物招领，"
    "和能查政策、查电话的校园问答。同一套代码，电脑和手机都能用，断网也能跑。",

    "（00:08）打开就是本周课表，今天这一列自动高亮，每门课的地点、老师和上课周次都写在卡片上。"
    "要说明的是，课表不是孤立的一页数据——它和教室查询用的是同一套占用计算。",

    "（00:28）这是我最想让你看的一页。28 间教室、每天 5 个大节，哪些空着、哪些被占，一屏看完。"
    "更关键的是它知道你在哪——点一下定位，直接给出离你最近的 3 间空教室，"
    "距离和步行时间都算好了，地图上这条虚线就是从你的位置到那间教室。"
    "矩阵里，我自己的课标成「我的课」，社团活动用紫色标出来，"
    "所以不会出现课表说空着、走过去发现有人在活动的情况。",

    "（01:05）电脑上点手机访问，出来一个二维码。手机连同一个 WiFi 扫一下，就能打开同一个应用——"
    "不用安装、不用注册、不用服务器。手机上会自动变成单列布局和底部标签栏，"
    "而且看到的这些教室数据，就是刚才电脑上的那一套。",

    "（01:25）丢东西是最烦的事。上传一张照片，它先在你的设备上提取主色和明暗特征——照片不出本机。"
    "然后拿这些特征和广场上的帖子做加权比对，给出匹配度和理由："
    "同类物品、颜色一致、关键词重合、地点相近、时间接近。"
    "这五条理由都能自己核对，不是一句「感觉像」。确认之后直接联系拾到的人。",

    "（01:55）办事类的问题最怕白跑一趟。学生证丢了怎么补办？责任部门、联系电话、"
    "行政楼 208 的办公时间、要带的材料、几个工作日能拿到，一条一条写清楚。"
    "通讯录里 14 个部门，包括辅导员和班主任，点一下就能拨号。",

    "（02:15）安卓版是一个 218 KB 的安装包，装完之后完全离线也能用——因为所有资源都打包在安装包里了。",

    "（02:28）没有服务器、没有第三方框架、不需要注册账号——纯前端三端同源，"
    "内置 33 项自动化自测。校园通，让校园里的小事一次办成。",
]

PREP = [
    ("环境准备", [
        "关闭微信、QQ、邮件等会弹窗通知的程序，避免录制中被打断；",
        "桌面只留「校园通.exe」和一张用于失物匹配的耳机照片，不要露出私人文件；",
        "分辨率设为 1920×1080，显示缩放 100% 或 125%，避免窗口被裁切；",
        "打开 Windows 定位服务（设置 → 隐私和安全性 → 位置），并允许桌面应用访问。",
    ]),
    ("关键一步：提前放行防火墙", [
        "桌面版第一次点「手机访问」时，Windows 会弹出防火墙授权窗口；",
        "务必在录制前先点一次、勾选「专用网络」并允许；",
        "否则录屏时这个弹窗会突然出现，打断画面（这是最常见的返工原因）。",
    ]),
    ("预演与手机准备", [
        "空跑一遍全部操作，记住四个按钮的位置：使用设备定位、智能匹配、手机访问、我要提问；",
        "手机提前连上与电脑相同的 WiFi，并实测能打开该局域网地址；",
        "手机端建议用系统自带录屏单独录一段，后期做成画中画，比拍屏更清楚。",
    ]),
]

TIPS = [
    "录屏工具用 Windows 自带的 Xbox Game Bar（Win+G）或 OBS，30fps 足够，不必强求 60fps。",
    "鼠标移动放慢，点击前停顿约 0.5 秒，避免给人「手忙脚乱」的观感。",
    "关键结果（匹配度、距离与步行时间、联系电话）要停留 2 秒以上，给评委看清的时间。",
    "不要出现真实手机号、聊天窗口、桌面上的私人文件；演示数据中的电话本身就是虚构的，不必担心。",
    "旁白音量保持在 -6 dB 左右；背景音乐最多 -24 dB 或干脆不用，不要盖过人声。",
    "若某个功能连续两次录不好，改用「结果画面 + 旁白说明」的方式，不要在现场反复试。",
    "导出后再看一遍：确认没有电话铃声、没有通知横幅、没有鼠标停在输入框上的闪烁光标。",
]

BACKUP = [
    ["定位不可用", "点「使用设备定位」提示失败", "改用手动选择位置（下拉选「图书馆」）；推荐逻辑完全一致，"
                                            "旁白改成「我手动选一下位置」即可"],
    ["手机扫码失败", "手机打不开该地址", "直接手输地址；或把二维码截图放大展示，说明是同一 WiFi 下扫码"],
    ["防火墙弹窗", "录制中突然弹出授权框", "暂停录制 → 允许 → 重录该镜（或提前按准备清单放行）"],
    ["匹配结果为空", "智能匹配返回 0 条", "换一张电子类（黑色）物品照片；或先发布一条招领帖再匹配，"
                                        "顺带演示发布流程"],
    ["手机浏览器不兼容", "页面错乱", "改用 Chrome / Edge / 系统浏览器；项目已适配 Chromium 86 及以上内核"],
    ["录屏卡顿", "画面掉帧", "关闭其他程序；桌面版窗口不要开太大，1280×800 足够清晰"],
]

EXTRA = [
    "在镜 3 结尾加 2 秒「教室详情」（展示当天 5 个时段明细），强化数据完整度。",
    "在镜 5 之后加 3 秒「发布寻物帖」，展示发布能力（同时可解决匹配为空的情况）。",
    "结尾加 3 秒自测画面：在网页地址后加 ?selftest=1，标题栏显示 33 项全部通过——用可验证性加分。",
    "若总时长超出，优先压缩镜 2（课表）与镜 6（问答），核心镜头镜 3 与镜 5 不要动。",
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
    p.paragraph_format.space_after = Pt(14)
    style_run(p.add_run("演示视频脚本"), east=FONT_HEI, size=20, bold=True)

    def head1(text):
        q = doc.add_paragraph()
        q.paragraph_format.space_before = Pt(14)
        q.paragraph_format.space_after = Pt(6)
        style_run(q.add_run(text), east=FONT_HEI, size=14, bold=True)

    def head2(text):
        q = doc.add_paragraph()
        q.paragraph_format.space_before = Pt(10)
        q.paragraph_format.space_after = Pt(4)
        style_run(q.add_run(text), east=FONT_HEI, size=12, bold=True)

    def body(text, size=11, indent=True):
        q = doc.add_paragraph()
        q.paragraph_format.space_after = Pt(4)
        q.paragraph_format.line_spacing = 1.45
        if indent:
            q.paragraph_format.first_line_indent = Pt(size * 2)
        style_run(q.add_run(text), size=size)
        return q

    def bullet(text, size=10.5):
        q = doc.add_paragraph()
        q.paragraph_format.left_indent = Pt(21)
        q.paragraph_format.first_line_indent = Pt(-10.5)
        q.paragraph_format.space_after = Pt(2)
        q.paragraph_format.line_spacing = 1.4
        style_run(q.add_run("· " + text), size=size)
        return q

    # 基本信息表
    t = doc.add_table(rows=0, cols=2)
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for k, v in INFO:
        cells = t.add_row().cells
        for i, val in enumerate((k, v)):
            cells[i].text = ""
            cp = cells[i].paragraphs[0]
            cp.paragraph_format.space_after = Pt(2)
            cp.paragraph_format.line_spacing = 1.25
            style_run(cp.add_run(val), east=FONT_HEI if i == 0 else FONT_SONG, size=10, bold=(i == 0))
        cells[0].width = Cm(3.2)
        cells[1].width = Cm(13.4)
    for r in t.rows:
        r._tr.get_or_add_trPr().append(OxmlElement("w:cantSplit"))
    doc.add_paragraph()

    # 一、录制前准备
    head1("一、录制前准备（先做这几件事，否则容易返工）")
    for title, items in PREP:
        head2(title)
        for it in items:
            bullet(it)

    # 二、分镜脚本
    head1("二、分镜脚本（共 8 镜，总时长约 2 分 40 秒）")
    body("每镜按「画面与操作 → 讲解词 → 屏幕字幕」给出，可对照逐镜录制。", size=10.5, indent=False)
    for sb in STORYBOARD:
        q = doc.add_paragraph()
        q.paragraph_format.space_before = Pt(12)
        q.paragraph_format.space_after = Pt(3)
        style_run(q.add_run("%s　%s　｜　%s" % (sb["no"], sb["time"], sb["title"])),
                  east=FONT_HEI, size=12, bold=True)

        q = doc.add_paragraph()
        q.paragraph_format.left_indent = Pt(21)
        q.paragraph_format.space_after = Pt(3)
        q.paragraph_format.line_spacing = 1.4
        style_run(q.add_run("画面与操作：" + sb["shot"]), size=10)

        q = doc.add_paragraph()
        q.paragraph_format.left_indent = Pt(21)
        q.paragraph_format.space_after = Pt(3)
        q.paragraph_format.line_spacing = 1.45
        style_run(q.add_run("讲解词：" + sb["say"]), size=10.5)

        q = doc.add_paragraph()
        q.paragraph_format.left_indent = Pt(21)
        q.paragraph_format.space_after = Pt(3)
        style_run(q.add_run("屏幕字幕：" + sb["overlay"]), size=9.5)

    # 三、旁白全文
    head1("三、旁白全文（连贯朗读版）")
    body("共约 640 字。建议先按此稿读顺，再对着画面微调停顿；括号内为对应镜号的时间点。",
         size=10.5, indent=False)
    for para in NARRATION:
        q = doc.add_paragraph()
        q.paragraph_format.space_after = Pt(6)
        q.paragraph_format.line_spacing = 1.6
        q.paragraph_format.first_line_indent = Pt(21)
        style_run(q.add_run(para), size=11)

    # 四、录制与剪辑
    head1("四、录制与剪辑注意事项")
    for it in TIPS:
        bullet(it)

    # 五、备用方案
    head1("五、常见问题与备用方案")
    body("现场演示最怕卡住。下表每种情况都准备了不影响结论的替代路径。", size=10.5, indent=False)
    t2 = doc.add_table(rows=1, cols=3)
    t2.style = "Table Grid"
    t2.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, h in enumerate(["风险", "可能现象", "备用方案"]):
        c = t2.rows[0].cells[i]
        c.text = ""
        cp = c.paragraphs[0]
        cp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        cp.paragraph_format.space_after = Pt(2)
        style_run(cp.add_run(h), east=FONT_HEI, size=9.5, bold=True)
    for row in BACKUP:
        cells = t2.add_row().cells
        for i, v in enumerate(row):
            cells[i].text = ""
            cp = cells[i].paragraphs[0]
            cp.paragraph_format.space_after = Pt(2)
            cp.paragraph_format.line_spacing = 1.25
            style_run(cp.add_run(v), size=9.5)
    widths = [2.6, 4.6, 9.4]
    for r in t2.rows:
        for i, w in enumerate(widths):
            r.cells[i].width = Cm(w)
        r._tr.get_or_add_trPr().append(OxmlElement("w:cantSplit"))
    doc.add_paragraph()

    # 六、可选加分项
    head1("六、可选加分项")
    for it in EXTRA:
        bullet(it)

    doc.save(OUT_DOCX)
    print("DOCX: " + os.path.abspath(OUT_DOCX))


def make_md():
    out = ["# 校园通 CampusKit · 演示视频脚本", ""]
    out += ["| 项目 | 内容 |", "|---|---|"]
    for k, v in INFO:
        out.append("| %s | %s |" % (k, v))
    out += ["", "## 一、录制前准备（先做这几件事，否则容易返工）", ""]
    for title, items in PREP:
        out += ["### " + title, ""]
        out += ["- " + x for x in items]
        out.append("")
    out += ["## 二、分镜脚本（共 8 镜，总时长约 2 分 40 秒）", ""]
    for sb in STORYBOARD:
        out += ["### %s　%s　｜　%s" % (sb["no"], sb["time"], sb["title"]), "",
                "- **画面与操作**：" + sb["shot"],
                "- **讲解词**：" + sb["say"],
                "- **屏幕字幕**：" + sb["overlay"], ""]
    out += ["## 三、旁白全文（连贯朗读版）", "",
            "共约 640 字。建议先按此稿读顺，再对着画面微调停顿。", ""]
    out += [x + "\n" for x in NARRATION]
    out += ["## 四、录制与剪辑注意事项", ""]
    out += ["- " + x for x in TIPS]
    out += ["", "## 五、常见问题与备用方案", "",
            "| 风险 | 可能现象 | 备用方案 |", "|---|---|---|"]
    for row in BACKUP:
        out.append("| " + " | ".join(row) + " |")
    out += ["", "## 六、可选加分项", ""]
    out += ["- " + x for x in EXTRA]
    out.append("")
    with open(OUT_MD, "w", encoding="utf-8") as f:
        f.write("\n".join(out))
    print("MD:   " + os.path.abspath(OUT_MD))


if __name__ == "__main__":
    make_docx()
    make_md()
