# -*- coding: utf-8 -*-
"""填写「银移杯」诚信承诺书：仅添加作品标识，法条原文一字不改。

设计取舍：
  · 承诺条款属于对组委会的正式承诺文本，不得改写、增删；
  · 模板没有"作品名称"栏位，故在标题下补一小段标识，便于评审对应到具体作品；
  · 签名与日期保持空白，供手写。
生成后会逐段比对原文，确认承诺条款未被改动。
"""
import copy
import sys

from docx import Document
from docx.shared import Pt

TPL = sys.argv[1]
OUT = sys.argv[2]

WORK = "校园通 CampusKit"
TRACK = "智慧校园赛道"

doc = Document(TPL)
paras = doc.paragraphs
title = paras[0]          # 「诚信承诺书」
body = paras[1]           # 正文首段，取其格式作为标识段的样式来源

# 记录原文，供生成后比对
original_texts = [p.text for p in paras]


def set_text(p, text):
    for r in p.runs[1:]:
        r._element.getparent().remove(r._element)
    if p.runs:
        p.runs[0].text = text
    else:
        p.add_run(text)


def insert_after(anchor, model, text):
    """按 model 段的格式新建段落，插入到 anchor 之后"""
    from docx.text.paragraph import Paragraph
    new_el = copy.deepcopy(model._p)
    anchor._p.addnext(new_el)
    np = Paragraph(new_el, anchor._parent)
    set_text(np, text)
    return np


# ---- 在标题与正文之间插入作品标识 ----
ident = [
    "参赛作品名称：" + WORK,
    "参赛赛道：" + TRACK,
    "团队名称：＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿",
    "",
]
anchor = title
for line in ident:
    anchor = insert_after(anchor, body, line)

# 标识段用与正文一致的字号，不加粗
for i in range(1, len(ident)):
    pass

doc.save(OUT)

# ---- 校验：承诺条款必须与模板逐段一致 ----
doc2 = Document(OUT)
new_texts = [p.text for p in doc2.paragraphs]
# 去掉插入的 4 段后应与原文一致
inserted = set(ident)
stripped = [t for t in new_texts if t not in inserted or t == ""]
# 更稳妥的比对：原文每一段都必须在生成稿中原样出现且顺序不变
pos, ok = 0, True
for t in original_texts:
    try:
        idx = new_texts.index(t, pos)
    except ValueError:
        ok = False
        print("  ❌ 原文段落丢失: " + t[:40])
        break
    pos = idx + 1

print("生成: " + OUT)
print("原文段落数 %d，全部原样保留: %s" % (len(original_texts), "是" if ok else "否"))
print("新增段落 %d 段（作品标识 + 空行）" % len(ident))
if not ok:
    sys.exit(1)
