// マップの区分。マップ選択画面での並べ方と、激ムズマップの解放条件の判定に使う。
// 区分ごとの扱いは docs/GameDesign.md「クリア状況と激ムズマップ」を参照。

/**
 * マップの区分。
 * - normal: 通常マップ。すべてクリアすると激ムズマップが解放される
 * - test: テストマップ(動作確認用)。解放条件の集計対象外
 * - extra: 激ムズマップ。通常マップをすべてクリアするまで選択画面に出さない
 *   (解放の判定は担当サイドごとに行い、出すサイドは MapEntry.side で指定する)
 */
export type MapCategory = 'normal' | 'test' | 'extra';

/** マップ区分を指定しなかった場合の既定値 */
export const DEFAULT_MAP_CATEGORY: MapCategory = 'normal';
