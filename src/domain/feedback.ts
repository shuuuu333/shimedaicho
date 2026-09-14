/** 「こうしてほしい」の送り先。
 *
 *  Google フォームにしてある。自前で受けると、迷惑投稿を自分で止める仕事と、
 *  受け皿を動かし続ける仕事が増える。返事は表で読めればいい。
 *
 *  ■ 使いはじめる手順
 *  1. Google フォームを作り、下の FORM_URL に「回答用の URL」を貼る
 *     （共有ボタンから出る https://docs.google.com/forms/d/e/.../viewform）
 *  2. 空のあいだは、アプリにも紹介ページにも送り口を出さない。
 *     押しても何も起きないボタンを見せるほうが、無いより悪い
 *
 *  ■ 聞くとよいこと（この順で）
 *  ・どの画面のことですか（レジ／日報／シフト／今月／キャスト／設定／全体）
 *  ・困ったこと・こうしてほしいこと（長文）
 *  ・お店の種類（キャバクラ／ガールズバー／スナック／コンカフェ／その他）
 *  ・いま使っていますか（毎日／たまに／見ただけ）
 *  ・返事がいるなら連絡先（任意）
 *
 *  3 つめと 4 つめが効く。「毎日使っている店の声」と「見ただけの人の声」は
 *  重みが違うし、業態によって当たり前が変わる。 */
export const FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLScblVZKsEVFjy1EZDFuqTV8NxesqddmPbVqiQhi1RKWuJTKgw/viewform";

// 紹介ページ（public/lp/index.html）にも同じ URL を貼る場所がある。
// あちらは素の HTML なので、この定数を読めない。id="feedback" の節にある。直すときは両方そろえる。

export const hasFeedbackForm = (): boolean => FORM_URL.trim().length > 0;
