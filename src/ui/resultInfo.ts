// 勝敗結果を画面表示向けの文字列へ整形する。表示ロジックのみを担い、Phaser には依存しない。
// docs/DevelopmentPlan.md Phase 8「勝利・敗北UIを表示する」を参照。

import type { PlayerSide, VersusMode } from '@/core/mode/GameMode';
import type { TurnArmy } from '@/core/turn/TurnManager';
import type { Elimination, FourPlayerOutcome } from '@/core/victory/ArmyElimination';
import type {
  VictoryReason,
  VictoryResult,
} from '@/core/victory/VictoryConditionChecker';
import { armyLabel, type ArmyLabelOptions } from '@/ui/turnInfo';

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

/** 4P マップの結果表示。見出し・詳細に加えて、プレイヤーにとって勝利かどうかを持つ */
export interface FourPlayerResultMessage extends ResultMessage {
  /**
   * プレイヤーにとっての勝利か(勝利・敗北のジングルと見出しの色の切り替えに使う)。
   * プレイヤーの軍勢が勝ち残ったとき、またはプレイヤーのいない観戦のゲームが決着したときに true。
   */
  readonly isVictory: boolean;
}

/**
 * 4P マップの決着を見出し・詳細のメッセージへ整形する。
 * 勝ち残った軍勢があればその番号を見出しにし、プレイヤーが全員脱落したときは敗北とする。
 *
 * @param humans ゲーム開始時にプレイヤーが操作していた軍勢
 */
export function formatFourPlayerResult(
  outcome: Exclude<FourPlayerOutcome, { kind: 'ongoing' }>,
  humans: readonly TurnArmy[],
  options: ArmyLabelOptions = {},
): FourPlayerResultMessage {
  const labelOptions = { ...options, fourPlayer: true };
  if (outcome.kind === 'winner') {
    return {
      title: `${armyLabel(outcome.army, labelOptions)} の勝利！`,
      detail: 'ほかの軍勢をすべて脱落させた',
      isVictory: humans.length === 0 || humans.includes(outcome.army),
    };
  }
  return {
    title: '敗北…',
    detail:
      humans.length === 1
        ? `${armyLabel(humans[0], labelOptions)}が脱落した`
        : 'プレイヤーの軍勢がすべて脱落した',
    isVictory: false,
  };
}

/** 4P マップで軍勢が脱落したときの表示 */
export interface EliminationMessage extends ResultMessage {
  /**
   * 情報パネルに出す行(見出し・理由・拠点の行き先)。
   * 情報パネルは日本語を自動では折り返せないため、あらかじめ行を分けておく。
   */
  readonly lines: readonly string[];
}

/**
 * 4P マップで軍勢が脱落したことを、バナー・情報パネル向けの見出しと詳細へ整形する。
 * 本拠地を占領された場合は拠点が占領した軍勢へ、全滅した場合は中立へ移ることも添える。
 */
export function formatEliminationMessage(
  elimination: Elimination,
  options: ArmyLabelOptions = {},
): EliminationMessage {
  const labelOptions = { ...options, fourPlayer: true };
  const title = `${armyLabel(elimination.army, labelOptions)} 脱落！`;
  let reason: string;
  let aftermath: string;
  if (elimination.reason === 'hq_captured' && elimination.capturedBy !== null) {
    const captor = armyLabel(elimination.capturedBy, labelOptions);
    reason = `本拠地を${captor}に占領された`;
    aftermath = `拠点は${captor}へ`;
  } else if (elimination.reason === 'hq_captured') {
    reason = '本拠地を失った';
    aftermath = '拠点は中立へ';
  } else {
    reason = '全滅した';
    aftermath = '拠点は中立へ';
  }
  return { title, detail: `${reason}(${aftermath})`, lines: [title, reason, aftermath] };
}
