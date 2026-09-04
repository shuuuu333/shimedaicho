# -*- coding: utf-8 -*-
exec(open("build.py", encoding="utf-8").read().split("# ---------- 今月 ----------")[0])

def arrow(dir_):
    d = "M15 5l-7 7 7 7" if dir_ == "l" else "M9 5l7 7-7 7"
    return ('<div style="width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; background: @chip@; border-radius: 11px">'
            '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="@ink2@" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="%s"></path></svg></div>' % d)

# ---------- 日報 ----------
def step(n, label, state):
    if state == "done":
        bar, col, w = "@accent@", "@ink2@", "500"
    elif state == "now":
        bar, col, w = "@accent@", "@accent@", "600"
    else:
        bar, col, w = "@line2@", "@ink3@", "500"
    return ('<div style="text-align: center"><div style="height: 3px; border-radius: 2px; background: %s"></div>'
            '<div style="font-size: 10px; color: %s; font-weight: %s; margin-top: 6px">%s</div></div>' % (bar, col, w, label))

def crow(name, on):
    if on:
        return ('<div style="display: flex; align-items: center; gap: 6px; height: 40px; padding: 0 16px; border-radius: 999px; background: @accent@; color: @onaccent@; font-size: 14.5px; font-weight: 600">'
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5.5 5.5L20 6.5"></path></svg>%s</div>' % name)
    return ('<div style="display: flex; align-items: center; height: 40px; padding: 0 16px; border-radius: 999px; background: @chip@; color: @ink2@; font-size: 14.5px; font-weight: 500">%s</div>' % name)

DAY = HEAD + topbar() + """
  <div style="display: flex; align-items: center; gap: 10px; padding: 2px 16px 12px">
    __ARROW_L__
    <div style="flex-grow: 1; text-align: center">
      <div style="font-size: 19px; font-weight: 700">9月21日（月）</div>
      <div style="font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: @ink3@; margin-top: -2px">今日</div>
    </div>
    __ARROW_R__
  </div>

  <div style="display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; padding: 0 16px 14px">
    __STEPS__
  </div>

  <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0 16px; padding: 11px 14px; background: @card@; border: 1px solid @line@; border-radius: 14px; box-shadow: @shadow@">
    <div>
      <div style="font-size: 10.5px; color: @ink3@; font-weight: 500">売上</div>
      <div style="font-family: 'IBM Plex Mono', monospace; font-size: 16px; font-weight: 600">248,000</div>
    </div>
    <div>
      <div style="font-size: 10.5px; color: @ink3@; font-weight: 500">人件費</div>
      <div style="font-family: 'IBM Plex Mono', monospace; font-size: 16px; font-weight: 600">86,400</div>
    </div>
    <div>
      <div style="font-size: 10.5px; color: @ink3@; font-weight: 500">差引</div>
      <div style="font-family: 'IBM Plex Mono', monospace; font-size: 16px; font-weight: 600; color: @good@">149,600</div>
    </div>
  </div>

  <div style="display: flex; align-items: baseline; gap: 9px; padding: 20px 16px 12px">
    <div style="font-size: 21px; font-weight: 700">出勤</div>
    <div style="font-size: 12px; color: @ink3@">出た子をタップ</div>
  </div>

  <div style="display: flex; flex-wrap: wrap; gap: 8px; padding: 0 16px 16px">
    __CHIPS__
  </div>

  <div style="padding: 0 16px">
    <div style="display: flex; align-items: center; gap: 12px; padding: 13px 14px; background: @card@; border: 1px solid @line@; border-radius: 14px; margin-bottom: 9px; box-shadow: @shadow@">
      <div style="width: 38px; height: 38px; border-radius: 999px; background: @chip@; color: @ink2@; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 600">あ</div>
      <div style="flex-grow: 1">
        <div style="font-size: 15.5px; font-weight: 600">あい</div>
        <div style="font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; color: @ink3@">20:30-01:00 · 4.5h · バック 7,500</div>
      </div>
      <div style="font-family: 'IBM Plex Mono', monospace; font-size: 17px; font-weight: 600">15,600</div>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="@ink3@" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"></path></svg>
    </div>
    <div style="display: flex; align-items: center; gap: 12px; padding: 13px 14px; background: @card@; border: 1px solid @neg@; border-radius: 14px; box-shadow: @shadow@">
      <div style="width: 38px; height: 38px; border-radius: 999px; background: @chip@; color: @ink2@; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 600">み</div>
      <div style="flex-grow: 1">
        <div style="font-size: 15.5px; font-weight: 600">みく</div>
        <div style="font-size: 11.5px; color: @neg@; font-weight: 500">本数がまだ入っていません</div>
      </div>
      <div style="font-family: 'IBM Plex Mono', monospace; font-size: 17px; font-weight: 600">12,500</div>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="@ink3@" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"></path></svg>
    </div>
  </div>

  <div style="display: flex; align-items: center; gap: 10px; padding: 12px 16px 0">
    <div style="display: flex; align-items: center; gap: 7px; height: 38px; padding: 0 14px; background: @chip@; border-radius: 10px; font-size: 12.5px; color: @ink2@; font-weight: 500">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="3"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg>
      前回の出勤をコピー
    </div>
    <div style="flex-grow: 1"></div>
    <div style="text-align: right">
      <div style="font-size: 10.5px; color: @ink3@">在籍 2名の給料計</div>
      <div style="font-family: 'IBM Plex Mono', monospace; font-size: 16px; font-weight: 600">28,100</div>
    </div>
  </div>

  <div style="flex-grow: 1"></div>

  <div style="display: flex; gap: 9px; padding: 0 16px 12px">
    <div style="display: flex; align-items: center; justify-content: center; width: 88px; height: 52px; background: @chip@; border-radius: 14px; font-size: 15px; font-weight: 600; color: @ink2@">戻る</div>
    <div style="flex-grow: 1; display: flex; align-items: center; justify-content: center; gap: 8px; height: 52px; background: @accent@; color: @onaccent@; border-radius: 14px; font-size: 15.5px; font-weight: 600">
      次へ：派遣
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"></path></svg>
    </div>
  </div>
""" + nav("day") + TAIL
DAY = DAY.replace("__ARROW_L__", arrow("l")).replace("__ARROW_R__", arrow("r"))
DAY = DAY.replace("__STEPS__", "\n    ".join([
    step(1, "売上", "done"), step(2, "出勤", "now"), step(3, "派遣", "todo"),
    step(4, "経費", "todo"), step(5, "締め", "todo")]))
DAY = DAY.replace("__CHIPS__", "\n    ".join([
    crow("あい", True), crow("みく", True), crow("れな", False), crow("さら", False), crow("ひな", False)]))

open("Day.dc.html", "w", encoding="utf-8").write(render(DAY, DARK))
open("DayLight.dc.html", "w", encoding="utf-8").write(render(DAY, LIGHT))
print("day ok")
