// 敵の行動アニメ(敵軍AIの手番をどこまで描画するか)の設定値。
// ゲーム中の情報メニュー「敵の行動アニメ」から選び、MainScene の敵軍ターンの
// 進め方を切り替える。Phaser には依存しない純粋なデータ定義。
//
// - 'full'   「しっかり」: 戦闘アニメーションまで見せる想定。未実装のため今は選べない
// - 'simple' 「簡単」    : 敵ユニットの選択・移動・攻撃・生産を盤面上で描画する
// - 'instant'「超速」    : 演出を挟まず、手番の結果だけを一度に反映する(従来の挙動)

/** 敵の行動アニメの種別 */
export type EnemyAnimationMode = 'full' | 'simple' | 'instant';

/** 敵の行動アニメ 1 種別ぶんの表示データ */
export interface EnemyAnimationModeData {
  /** 種別の識別子(設定の保存に使う) */
  readonly id: EnemyAnimationMode;
  /** 選択肢としての表示名 */
  readonly label: string;
  /** 選択肢の下に出す説明(複数行) */
  readonly description: readonly string[];
  /**
   * いま選べるか。
   * 「しっかり」は戦闘アニメーションができるまで選べない(準備中)。
   */
  readonly selectable: boolean;
}

/**
 * 敵の行動アニメの一覧(ウィンドウに出す順)。
 * 描画が厚い順に並べ、上から「しっかり → 簡単 → 超速」とする。
 */
export const ENEMY_ANIMATION_MODES: readonly EnemyAnimationModeData[] = [
  {
    id: 'full',
    label: 'しっかり',
    description: ['戦闘アニメーションまで見せる', '(準備中)'],
    selectable: false,
  },
  {
    id: 'simple',
    label: '簡単',
    description: ['敵の選択・移動・攻撃・生産を', '画面を動かしながら見せる'],
    selectable: true,
  },
  {
    id: 'instant',
    label: '超速',
    description: ['演出を省き、手番の結果だけを', 'まとめて反映する'],
    selectable: true,
  },
];

/** 既定の敵の行動アニメ。敵の動きが分かる「簡単」を初期値にする */
export const DEFAULT_ENEMY_ANIMATION_MODE: EnemyAnimationMode = 'simple';

/** 値が敵の行動アニメの識別子かどうか(保存データの検証に使う) */
export function isEnemyAnimationMode(value: unknown): value is EnemyAnimationMode {
  return ENEMY_ANIMATION_MODES.some((mode) => mode.id === value);
}

/**
 * 識別子から表示データを取り出す。
 * 未知の識別子(古い設定など)や未指定の場合は既定の種別を返す。
 */
export function getEnemyAnimationMode(
  id: string | null | undefined,
): EnemyAnimationModeData {
  const found = ENEMY_ANIMATION_MODES.find((mode) => mode.id === id);
  if (found) {
    return found;
  }
  // 既定の種別は必ず一覧に含まれるが、型の上では undefined になりうるため先頭で補う
  return (
    ENEMY_ANIMATION_MODES.find((mode) => mode.id === DEFAULT_ENEMY_ANIMATION_MODE) ??
    ENEMY_ANIMATION_MODES[0]
  );
}

/** 識別子から表示名を返す(情報パネルの表示に使う) */
export function enemyAnimationModeLabel(id: string | null | undefined): string {
  return getEnemyAnimationMode(id).label;
}
