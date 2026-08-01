// 勝敗結果を画面表示向けの文字列へ整形する。表示ロジックのみを担い、Phaser には依存しない。
// docs/DevelopmentPlan.md Phase 8「勝利・敗北UIを表示する」を参照。

import type {
  VictoryReason,
  VictoryResult,
} from '@/core/victory/VictoryConditionChecker';

/** 結果表示 1 件ぶんの見出しと詳細 */
export interface ResultMessage {
  /** 大見出し(勝利/敗北) */
  readonly title: string;
  /** 決着理由の説明文 */
  readonly detail: string;
}

/** 勝敗理由ごとの説明文 */
const REASON_DETAIL: Record<VictoryReason, string> = {
  enemy_hq_captured: '敵本拠地を占領した',
  enemy_annihilated: '敵軍を全滅させた',
  player_hq_captured: '自軍本拠地を占領された',
  player_annihilated: '自軍が全滅した',
};

/**
 * 勝敗結果を見出し・詳細のメッセージへ整形する。
 * 未決着('ongoing')の結果を渡すのは想定外のため例外を投げる。
 */
export function formatResultMessage(result: VictoryResult): ResultMessage {
  if (result.outcome === 'ongoing' || result.reason === null) {
    throw new Error('未決着の結果はメッセージに整形できません');
  }
  return {
    title: result.outcome === 'player_victory' ? '勝利！' : '敗北…',
    detail: REASON_DETAIL[result.reason],
  };
}
