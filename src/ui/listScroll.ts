// 縦に並ぶリスト(マップ選択のカード一覧など)のスクロール量とスクロールバーの見た目を計算する。
// 表示ロジックのみを担い、Phaser には依存しない純粋な関数。

/**
 * スクロールできる最大量(px)。
 * 内容(contentHeight)が表示領域(viewportHeight)に収まっていれば 0 を返し、
 * このとき呼び出し側はスクロール操作もスクロールバーも不要と判断できる。
 */
export function maxScrollOffset(contentHeight: number, viewportHeight: number): number {
  return Math.max(0, contentHeight - viewportHeight);
}

/**
 * スクロール量を有効な範囲に丸める。
 * スクロール量は「内容を上へずらす量」を負の値で表す(0 が先頭、下ほど負)。
 * 範囲は -maxScrollOffset 〜 0 で、行き過ぎたぶんは端で止める。
 */
export function clampScrollOffset(
  offset: number,
  contentHeight: number,
  viewportHeight: number,
): number {
  const max = maxScrollOffset(contentHeight, viewportHeight);
  const clamped = Math.min(0, Math.max(-max, offset));
  // 0 と -0 が混ざらないよう正規化する
  return clamped === 0 ? 0 : clamped;
}

/** スクロールバーのつまみの位置と長さ(表示領域の上端を 0 とした相対座標) */
export interface ScrollbarMetrics {
  /** つまみの上端 */
  readonly thumbTop: number;
  /** つまみの長さ */
  readonly thumbHeight: number;
}

/**
 * スクロールバーのつまみの位置と長さを求める。
 * 内容が表示領域に収まっていてスクロールが不要なら null を返す(バーを描かない)。
 * つまみの長さは「表示できている割合」に比例させ、短くなりすぎないよう minThumbHeight で下限を設ける。
 */
export function scrollbarMetrics(
  offset: number,
  contentHeight: number,
  viewportHeight: number,
  minThumbHeight = 24,
): ScrollbarMetrics | null {
  const max = maxScrollOffset(contentHeight, viewportHeight);
  if (max === 0) {
    return null;
  }
  const ratio = viewportHeight / contentHeight;
  const thumbHeight = Math.max(
    Math.min(minThumbHeight, viewportHeight),
    Math.round(viewportHeight * ratio),
  );
  // スクロール量の進捗(0: 先頭 〜 1: 末尾)を、つまみが動ける範囲へ割り当てる
  const progress = -clampScrollOffset(offset, contentHeight, viewportHeight) / max;
  const thumbTop = Math.round(progress * (viewportHeight - thumbHeight));
  return { thumbTop: thumbTop === 0 ? 0 : thumbTop, thumbHeight };
}
