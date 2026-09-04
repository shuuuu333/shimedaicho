# -*- coding: utf-8 -*-
"""B案を仕上げた画面を、暗い版と明るい版の2枚ずつ生成する。
   構造を1つのテンプレートから作るので、テーマ切替で崩れない。"""
import io

DARK = dict(
    name="dark",
    bg="#0B0D11", card="#14171E", card2="#1B1F28", line="#232833", line2="#2C323E",
    ink="#FFFFFF", ink2="#9AA5B8", ink3="#626C7D",
    cash="#4C9AFF", cardc="#9B8AFA", labor="#3DBE8B", cost="#E8A33D",
    neg="#FF5A52", good="#3DBE8B", goodbg="#10281F", accent="#4C9AFF", onaccent="#0B0D11",
    navbg="#0E1116", chip="#1B1F28", grid="#1A1E26", shadow="none",
)
LIGHT = dict(
    name="light",
    bg="#F4F5F7", card="#FFFFFF", card2="#F0F2F5", line="#E3E6EB", line2="#D5DAE2",
    ink="#14171E", ink2="#5C6779", ink3="#8A93A3",
    cash="#2563EB", cardc="#7C5CE0", labor="#0E9F6E", cost="#B4700E",
    neg="#D92D20", good="#0E9F6E", goodbg="#E7F6EF", accent="#2563EB", onaccent="#FFFFFF",
    navbg="#FFFFFF", chip="#F0F2F5", grid="#EDEFF3",
    shadow="0 1px 2px rgba(16,24,40,.05), 0 1px 3px rgba(16,24,40,.08)",
)

HEAD = """<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+JP:wght@400;500;600;700&display=swap">
  <style>
    body { margin: 0; }
    a { color: @accent@; } a:hover { opacity: .8; }
  </style>
</helmet>
<div style="width: 390px; height: 844px; background: @bg@; color: @ink@; font-family: 'IBM Plex Sans JP', 'Hiragino Kaku Gothic ProN', sans-serif; font-size: 15px; line-height: 1.5; display: flex; flex-direction: column; overflow: hidden">
"""
TAIL = """
</div>
</x-dc>
</body>
</html>
"""

def topbar(sync=True):
    return """
  <div style="display: flex; align-items: center; gap: 10px; padding: 14px 16px 10px">
    <div style="font-size: 15.5px; font-weight: 700; letter-spacing: .01em">締め台帳</div>
    <div style="flex-grow: 1"></div>
    <div style="display: flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px; background: @goodbg@">
      <div style="width: 6px; height: 6px; border-radius: 50%; background: @good@"></div>
      <div style="font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: @good@; font-weight: 500">2:14 同期</div>
    </div>
  </div>
"""

ICONS = {
    "month": '<path d="M4 19V9m5 10V5m5 14v-7m5 7V8"></path>',
    "day": '<rect x="3.5" y="4.5" width="17" height="16" rx="3.5"></rect><path d="M3.5 9.5h17M8 3v3m8-3v3"></path>',
    "cast": '<circle cx="12" cy="8" r="3.5"></circle><path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6"></path>',
    "set": '<circle cx="12" cy="12" r="3"></circle><path d="M12 3v2.2M12 18.8V21M21 12h-2.2M5.2 12H3m13.4-6.4-1.6 1.6M9.2 14.8l-1.6 1.6m10.8 0-1.6-1.6M9.2 9.2 7.6 7.6"></path>',
}
LABELS = {"month": "今月", "day": "日報", "cast": "キャスト", "set": "設定"}

def nav(active):
    cells = []
    for k in ("month", "day", "cast", "set"):
        on = k == active
        color = "@accent@" if on else "@ink3@"
        weight = "600" if on else "500"
        cells.append(
            '<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; height: 52px; color: %s">'
            '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">%s</svg>'
            '<div style="font-size: 10.5px; font-weight: %s; letter-spacing: .02em">%s</div></div>' % (color, ICONS[k], weight, LABELS[k])
        )
    return ('\n  <div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); '
            'background: @navbg@; border-top: 1px solid @line@; padding: 6px 0 14px">\n    '
            + "\n    ".join(cells) + "\n  </div>\n")

def render(tpl, pal):
    out = tpl
    for k, v in pal.items():
        out = out.replace("@%s@" % k, v)
    return out

# ---------- 今月 ----------
BARS_CASH = [42,54,31,62,48,67,73,35,51,58,26,64,70,44,56,79,37,49,61,75,42]
BARS_CARD = [8,11,6,12,9,10,11,7,10,11,6,10,11,9,10,9,8,9,10,9,8]
def chart(width=326, height=92, uid="m"):
    """現金とカードを1本の棒として描く。輪郭にだけ丸みを付け、
       境目には細い区切り（背景色）を入れて色の切り替わりを見やすくする。"""
    step = width / 21.0
    bw = step - 6.5
    top = 4
    base = height - 10
    span = base - top
    mx = max(c + d for c, d in zip(BARS_CASH, BARS_CARD))
    clips, bars = [], []
    for i, (c, d) in enumerate(zip(BARS_CASH, BARS_CARD)):
        x = i * step + 3.2
        hc = span * c / mx
        hd = span * d / mx
        total = hc + hd
        ytop = base - total
        cid = "bar-%s-%d" % (uid, i)
        clips.append('<clipPath id="%s"><rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="2.5"></rect></clipPath>'
                     % (cid, x, ytop, bw, total))
        gap = 1.8
        bars.append('<g clip-path="url(#%s)">'
                    '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="@cardc@"></rect>'
                    '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="@cash@"></rect>'
                    '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="@card@"></rect></g>'
                    % (cid, x, ytop, bw, hd, x, base - hc, bw, hc, x, base - hc - gap, bw, gap))
    return ('<svg viewBox="0 0 %d %d" style="display: block; width: 100%%; height: %dpx">'
            '<defs>%s</defs>'
            '<line x1="0" y1="%.1f" x2="%d" y2="%.1f" stroke="@line@" stroke-width="1"></line>'
            '%s</svg>'
            % (width, height, height, "".join(clips), base, width, base, "".join(bars)))

MONTH = HEAD + topbar() + """
  <div style="display: flex; align-items: flex-end; gap: 10px; padding: 2px 16px 14px">
    <div>
      <div style="font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: @ink3@; font-weight: 500">2026</div>
      <div style="display: flex; align-items: center; gap: 8px; margin-top: -2px">
        <div style="font-size: 30px; font-weight: 700; letter-spacing: -.01em">9月</div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="@ink3@" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg>
      </div>
    </div>
    <div style="flex-grow: 1"></div>
    <div style="display: flex; background: @chip@; border-radius: 9px; padding: 3px; margin-bottom: 4px">
      <div style="padding: 6px 15px; border-radius: 7px; background: @card@; color: @ink@; font-size: 12.5px; font-weight: 600; box-shadow: @shadow@">月</div>
      <div style="padding: 6px 15px; font-size: 12.5px; color: @ink3@; font-weight: 500">年</div>
    </div>
  </div>

  <div style="margin: 0 16px; padding: 16px 16px 14px; background: @card@; border: 1px solid @line@; border-radius: 16px; box-shadow: @shadow@">
    <div style="display: flex; align-items: center; gap: 8px">
      <div style="font-size: 12px; color: @ink2@; font-weight: 500">営業利益</div>
      <div style="flex-grow: 1"></div>
      <div style="display: flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 999px; background: @goodbg@; color: @good@; font-size: 11.5px; font-weight: 600">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"></path></svg>
        <span style="font-family: 'IBM Plex Mono', monospace">12.4%</span>
      </div>
    </div>
    <div style="font-family: 'IBM Plex Mono', monospace; font-size: 38px; font-weight: 600; letter-spacing: -.03em; margin: 2px 0 14px">¥1,284,000</div>
    <div style="display: flex; height: 8px; border-radius: 999px; overflow: hidden; gap: 2px">
      <div style="width: 50.5%; background: @labor@"></div>
      <div style="width: 22.8%; background: @cost@"></div>
      <div style="flex-grow: 1; background: @cash@"></div>
    </div>
    <div style="display: flex; gap: 13px; margin-top: 10px; font-size: 11px; color: @ink2@">
      <div style="display: flex; align-items: center; gap: 5px"><div style="width: 8px; height: 8px; border-radius: 2px; background: @labor@"></div>人件費 <span style="font-family: 'IBM Plex Mono', monospace; color: @ink@; font-weight: 500">50.5%</span></div>
      <div style="display: flex; align-items: center; gap: 5px"><div style="width: 8px; height: 8px; border-radius: 2px; background: @cost@"></div>経費 <span style="font-family: 'IBM Plex Mono', monospace; color: @ink@; font-weight: 500">22.8%</span></div>
      <div style="display: flex; align-items: center; gap: 5px"><div style="width: 8px; height: 8px; border-radius: 2px; background: @cash@"></div>利益 <span style="font-family: 'IBM Plex Mono', monospace; color: @ink@; font-weight: 500">26.7%</span></div>
    </div>
  </div>

  <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 10px 16px 0">
    <div style="padding: 12px 14px; background: @card@; border: 1px solid @line@; border-radius: 14px; box-shadow: @shadow@">
      <div style="display: flex; align-items: center; gap: 6px">
        <div style="font-size: 11.5px; color: @ink2@; font-weight: 500">未払いの給料</div>
        <div style="flex-grow: 1"></div>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="@ink3@" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"></path></svg>
      </div>
      <div style="font-family: 'IBM Plex Mono', monospace; font-size: 20px; font-weight: 600; margin-top: 2px">¥318,000</div>
      <div style="font-size: 11px; color: @ink3@">3名分</div>
    </div>
    <div style="padding: 12px 14px; background: @card@; border: 1px solid @line@; border-radius: 14px; box-shadow: @shadow@">
      <div style="display: flex; align-items: center; gap: 6px">
        <div style="font-size: 11.5px; color: @ink2@; font-weight: 500">手元の現金</div>
        <div style="flex-grow: 1"></div>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="@ink3@" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"></path></svg>
      </div>
      <div style="font-family: 'IBM Plex Mono', monospace; font-size: 20px; font-weight: 600; margin-top: 2px">¥642,500</div>
      <div style="font-size: 11px; color: @good@">実査と一致</div>
    </div>
  </div>

  <div style="margin: 10px 16px 0; padding: 14px 16px 10px; background: @card@; border: 1px solid @line@; border-radius: 16px; box-shadow: @shadow@">
    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px">
      <div style="font-size: 13px; font-weight: 600">日別の売上</div>
      <div style="flex-grow: 1"></div>
      <div style="display: flex; gap: 11px; font-size: 10.5px; color: @ink2@">
        <div style="display: flex; align-items: center; gap: 5px"><div style="width: 8px; height: 8px; border-radius: 2px; background: @cash@"></div>現金</div>
        <div style="display: flex; align-items: center; gap: 5px"><div style="width: 8px; height: 8px; border-radius: 2px; background: @cardc@"></div>カード</div>
      </div>
    </div>
    __CHART__
    <div style="display: flex; justify-content: space-between; font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; color: @ink3@; margin-top: 2px">
      <div>1</div><div>7</div><div>14</div><div>21</div>
    </div>
  </div>

  <div style="flex-grow: 1"></div>

  <div style="padding: 0 16px 12px">
    <div style="display: flex; align-items: center; justify-content: center; gap: 9px; height: 52px; background: @accent@; color: @onaccent@; border-radius: 14px; font-size: 15.5px; font-weight: 600">
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"></path></svg>
      今日の日報をつける
    </div>
  </div>
""" + nav("month") + TAIL
MONTH = MONTH.replace("__CHART__", chart())

open("Main.dc.html", "w", encoding="utf-8").write(render(MONTH, DARK))
open("MainLight.dc.html", "w", encoding="utf-8").write(render(MONTH, LIGHT))
print("month ok")
