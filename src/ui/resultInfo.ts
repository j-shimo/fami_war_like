// 勝敗結果を画面表示向けの文字列へ整形する。表示ロジックのみを担い、Phaser には依存しない。
// docs/DevelopmentPlan.md Phase 8「勝利・敗北UIを表示する」を参照。

import type { PlayerSide, VersusMode } from '@/core/mode/GameMode';
import type {
  VictoryReason,
  VictoryResult,
} from '@/core/victory/VictoryConditionChecker';
import { armyLabel } from '@/ui/turnInfo';

/** 結果表示 1 件ぶんの見出しと詳細 */
export interface ResultMessage {
  /** 大見出し(勝利/敗北) */
  readonly title: string;
  /** 決着理由の説明文 */
  readonly detail: string;
}

/** 勝敗理由ごとの説明文(対 CPU。プレイヤー視点で書く) */
const REASON_DETAIL: Record<VictoryReason, string> = {
  enemy_hq_captured: '敵本拠地を占領した',
  enemy_annihilated: '敵軍を全滅させた',
  player_hq_captured: '自軍本拠地を占領された',
  player_annihilated: '自軍が全滅した',
};

/** 勝敗理由ごとの説明文(対人戦。どちらの陣営に何が起きたかで書く) */
function versusReasonDetail(reason: VictoryReason, side: PlayerSide | undefined): string {
  const options = { versus: 'human', side } as const;
  const blue = armyLabel('player', options);
  const red = armyLabel('enemy', options);
  switch (reason) {
    case 'enemy_hq_captured':
      return `${red}の本拠地が占領された`;
    case 'enemy_annihilated':
      return `${red}が全滅した`;
    case 'player_hq_captured':
      return `${blue}の本拠地が占領された`;
    case 'player_annihilated':
      return `${blue}が全滅した`;
  }
}

/**
 * 勝敗結果を見出し・詳細のメッセージへ整形する。
 * 対人戦では勝ち負けではなく、どちらの陣営が勝ったかを見出しにする。
 * 未決着('ongoing')の結果を渡すのは想定外のため例外を投げる。
 */
export function formatResultMessage(
  result: VictoryResult,
  options: { versus?: VersusMode; side?: PlayerSide } = {},
): ResultMessage {
  if (result.outcome === 'ongoing' || result.reason === null) {
    throw new Error('未決着の結果はメッセージに整形できません');
  }
  const isPlayerVictory = result.outcome === 'player_victory';
  if (options.versus === 'human') {
    const winner = armyLabel(isPlayerVictory ? 'player' : 'enemy', {
      versus: 'human',
      side: options.side,
    });
    return {
      title: `${winner} の勝利！`,
      detail: versusReasonDetail(result.reason, options.side),
    };
  }
  return {
    title: isPlayerVictory ? '勝利！' : '敗北…',
    detail: REASON_DETAIL[result.reason],
  };
}
