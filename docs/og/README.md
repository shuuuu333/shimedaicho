# カード画像（og.png）

X や LINE にリンクを貼ったときに出る画像。`public/lp/og.png` が本体で、
元は同じフォルダの `og.svg`。

直したら、こうして作り直す:

```bash
sips -s format png -Z 1200 docs/og/og.svg --out public/lp/og.png
```

- 大きさは 1200×630（X の summary_large_image）
- 文字は画像に焼かれるので、見る人の端末にフォントが無くても崩れない
- 日本語は Hiragino Sans、英数字は Helvetica を指定している。
  指定を外すと sips が明朝で描くことがある
