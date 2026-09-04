# -*- coding: utf-8 -*-
exec(open("build.py", encoding="utf-8").read().split("# ---------- 今月 ----------")[0])

def arrow(dir_):
    d = "M15 5l-7 7 7 7" if dir_ == "l" else "M9 5l7 7-7 7"
    return ('<div style="width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; background: @chip@; border-radius: 11px">'
            '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="@ink2@" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="%s"></path></svg></div>' % d)

def castrow(initial, name, sub, gross, unpaid, last=False):
    right = ('<div style="font-size: 11.5px; color: @cost@; font-weight: 500">未払い %s</div>' % unpaid) if unpaid else \
            '<div style="font-size: 11.5px; color: @good@; font-weight: 500">支払い済み</div>'
    mb = "" if last else " margin-bottom: 9px;"
    return ('<div style="display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: @card@; border: 1px solid @line@; border-radius: 14px;%s box-shadow: @shadow@">'
            '<div style="width: 38px; height: 38px; border-radius: 999px; background: @chip@; color: @ink2@; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 600">%s</div>'
            '<div style="flex-grow: 1"><div style="font-size: 15.5px; font-weight: 600">%s</div>'
            '<div style="font-family: \'IBM Plex Mono\', monospace; font-size: 11.5px; color: @ink3@">%s</div></div>'
            '<div style="text-align: right"><div style="font-family: \'IBM Plex Mono\', monospace; font-size: 17px; font-weight: 600">%s</div>%s</div>'
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="@ink3@" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"></path></svg></div>'
            % (mb, initial, name, sub, gross, right))

def settlerow(name, amount, last=False):
    mb = "" if last else " margin-bottom: 8px;"
    return ('<div style="display: flex; align-items: center; gap: 12px; padding: 10px 12px 10px 14px; background: @card@; border: 1px solid @line@; border-radius: 14px;%s box-shadow: @shadow@">'
            '<div style="flex-grow: 1; font-size: 15px; font-weight: 600">%s</div>'
            '<div style="font-family: \'IBM Plex Mono\', monospace; font-size: 16px; font-weight: 600">%s</div>'
            '<div style="display: flex; align-items: center; justify-content: center; height: 36px; padding: 0 15px; background: @accent@; color: @onaccent@; border-radius: 10px; font-size: 13px; font-weight: 600">渡した</div></div>'
            % (mb, name, amount))

CAST = HEAD + topbar() + """
  <div style="display: flex; align-items: center; gap: 10px; padding: 2px 16px 14px">
    __ARROW_L__
    <div style="font-size: 21px; font-weight: 700">9月</div>
    __ARROW_R__
    <div style="flex-grow: 1"></div>
    <div style="text-align: right">
      <div style="font-size: 10.5px; color: @ink3@; font-weight: 500">未払い計</div>
      <div style="font-family: 'IBM Plex Mono', monospace; font-size: 19px; font-weight: 600; color: @cost@">¥318,000</div>
    </div>
  </div>

  <div style="display: flex; align-items: center; gap: 8px; padding: 0 16px 10px">
    <div style="font-size: 12px; color: @ink2@; font-weight: 600">キャスト別の給料</div>
    <div style="flex-grow: 1; height: 1px; background: @line@"></div>
    <div style="font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; color: @ink3@">4名 · 43日</div>
  </div>

  <div style="padding: 0 16px">
    __ROWS__
  </div>

  <div style="display: flex; align-items: center; gap: 8px; padding: 20px 16px 10px">
    <div style="font-size: 12px; color: @ink2@; font-weight: 600">未払いの精算</div>
    <div style="flex-grow: 1; height: 1px; background: @line@"></div>
    <div style="font-size: 11px; color: @ink3@">今日の日報に記録されます</div>
  </div>

  <div style="padding: 0 16px">
    __SETTLE__
  </div>

  <div style="flex-grow: 1"></div>

  <div style="padding: 0 16px 12px">
    <div style="display: flex; align-items: center; gap: 12px; height: 52px; padding: 0 16px; border: 1px solid @line2@; border-radius: 14px">
      <div style="font-size: 14.5px; font-weight: 600; color: @ink2@">全員分をまとめて渡した</div>
      <div style="flex-grow: 1"></div>
      <div style="font-family: 'IBM Plex Mono', monospace; font-size: 17px; font-weight: 600; color: @cost@">¥159,000</div>
    </div>
  </div>
""" + nav("cast") + TAIL
CAST = CAST.replace("__ARROW_L__", arrow("l")).replace("__ARROW_R__", arrow("r"))
CAST = CAST.replace("__ROWS__", "\n    ".join([
    castrow("あ", "あい", "15日 · 82.5h · 312,000", "312,000", "45,000"),
    castrow("み", "みく", "12日 · 64.0h · 268,400", "268,400", "86,000"),
    castrow("れ", "れな", "9日 · 48.5h · 184,200", "184,200", None),
    castrow("ゆ", "ゆき（派遣）", "2日 · 日給 15,000", "31,400", "28,000", last=True)]))
CAST = CAST.replace("__SETTLE__", "\n    ".join([
    settlerow("あい", "¥45,000"), settlerow("みく", "¥86,000", last=True)]))

open("Cast.dc.html", "w", encoding="utf-8").write(render(CAST, DARK))
open("CastLight.dc.html", "w", encoding="utf-8").write(render(CAST, LIGHT))

# ---------- 設定（テーマ切替） ----------
def seg(label, on):
    if on:
        return ('<div style="flex-grow: 1; display: flex; align-items: center; justify-content: center; gap: 6px; height: 40px; border-radius: 9px; background: @card@; color: @ink@; font-size: 13px; font-weight: 600; box-shadow: @shadow@">%s</div>' % label)
    return ('<div style="flex-grow: 1; display: flex; align-items: center; justify-content: center; gap: 6px; height: 40px; font-size: 13px; color: @ink3@; font-weight: 500">%s</div>' % label)

def setrow(title, sub, last=False):
    bb = "" if last else " border-bottom: 1px solid @line@;"
    return ('<div style="display: flex; align-items: center; gap: 12px; padding: 13px 14px;%s">'
            '<div style="flex-grow: 1"><div style="font-size: 15px; font-weight: 500">%s</div>'
            '<div style="font-size: 11.5px; color: @ink3@; margin-top: -1px">%s</div></div>'
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="@ink3@" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"></path></svg></div>'
            % (bb, title, sub))

SUN = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M22 12h-2M4 12H2m15.1-7.1-1.4 1.4M8.3 15.7l-1.4 1.4m10.2 0-1.4-1.4M8.3 8.3 6.9 6.9"></path></svg>'
MOON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"></path></svg>'
AUTO = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2.5" width="14" height="19" rx="3"></rect><path d="M10.5 18.5h3"></path></svg>'

SETTINGS = HEAD + topbar() + """
  <div style="padding: 2px 16px 16px">
    <div style="font-size: 26px; font-weight: 700">設定</div>
  </div>

  <div style="padding: 0 16px">
    <div style="font-size: 12px; color: @ink2@; font-weight: 600; margin-bottom: 8px">見た目</div>
    <div style="display: flex; gap: 3px; padding: 4px; background: @chip@; border-radius: 12px">
      __SEGS__
    </div>
    <div style="font-size: 11.5px; color: @ink3@; margin-top: 8px">「端末に合わせる」にすると、スマホの設定が暗い時だけ暗くなります。</div>
  </div>

  <div style="padding: 22px 16px 0">
    <div style="font-size: 12px; color: @ink2@; font-weight: 600; margin-bottom: 8px">店舗</div>
    <div style="background: @card@; border: 1px solid @line@; border-radius: 14px; overflow: hidden; box-shadow: @shadow@">
      __SHOPROWS__
    </div>
  </div>

  <div style="padding: 20px 16px 0">
    <div style="font-size: 12px; color: @ink2@; font-weight: 600; margin-bottom: 8px">クラウド同期</div>
    <div style="background: @card@; border: 1px solid @line@; border-radius: 14px; overflow: hidden; box-shadow: @shadow@">
      <div style="display: flex; align-items: center; gap: 12px; padding: 13px 14px; border-bottom: 1px solid @line@">
        <div style="flex-grow: 1">
          <div style="font-size: 15px; font-weight: 500">チャンス</div>
          <div style="font-size: 11.5px; color: @good@; margin-top: -1px">同期済み 2:14 ・ オーナー</div>
        </div>
        <div style="display: flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px; background: @goodbg@">
          <div style="width: 6px; height: 6px; border-radius: 50%; background: @good@"></div>
          <div style="font-size: 11px; color: @good@; font-weight: 600">接続中</div>
        </div>
      </div>
      __CLOUDROWS__
    </div>
  </div>

  <div style="flex-grow: 1"></div>

  <div style="padding: 0 16px 14px; text-align: center">
    <div style="font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: @ink3@">締め台帳 v0.2.0</div>
  </div>
""" + nav("set") + TAIL
def segs_for(theme):
    return "\n      ".join([
        seg(AUTO + "端末に合わせる", False),
        seg(SUN + "明るい", theme == "light"),
        seg(MOON + "暗い", theme == "dark")])
SETTINGS = SETTINGS.replace("__SHOPROWS__", "\n      ".join([
    setrow("基本時給・カード手数料", "時給 ¥2,000 ／ 手数料 5% ／ 派遣日給 ¥15,000"),
    setrow("バックの単価", "ドリンク S・M・L 他3件"),
    setrow("現金の起点", "2026-09-01 に ¥250,000"),
    setrow("月の固定費", "固定人件費 ¥300,000 ／ 家賃など ¥200,000", last=True)]))
SETTINGS = SETTINGS.replace("__CLOUDROWS__", "\n      ".join([
    setrow("メンバー", "2名 ・ スタッフは日報のみ入力できます"),
    setrow("バックアップ", "最後の書き出し 3日前", last=True)]))

open("Settings.dc.html", "w", encoding="utf-8").write(render(SETTINGS.replace("__SEGS__", segs_for("dark")), DARK))
open("SettingsLight.dc.html", "w", encoding="utf-8").write(render(SETTINGS.replace("__SEGS__", segs_for("light")), LIGHT))
print("cast + settings ok")
