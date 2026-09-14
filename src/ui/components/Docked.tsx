import { createPortal } from "react-dom";
import type { ReactNode } from "react";

/** 画面の下に貼り付ける帯（会計バー・日報の「次へ」）と、上に重ねるもの。
 *
 *  中身を body の直下に出す。理由は position:fixed の決まりで、
 *  transform や animation の付いた親がいると、fixed はその親を基準に置かれる。
 *  タブを移るとき main は滑って入ってくるので、そのあいだだけ帯が
 *  main の箱の底を基準にしてしまい、223px 跳ね上がってから戻っていた。
 *
 *  body の直下なら、滑っている最中も画面の底のままでいられる。 */
export function Docked({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}
