// 1 回のゲームの戦績(撃破数・生産数・占領数など)を数える。Phaser には依存しない純粋なロジック。
// 数えた結果はエンディング(激ムズマップのクリア後)のスタッフロールに表示し、
// 中断データにも保存して、中断・再開をはさんでも通算の戦績が残るようにする。
// docs/GameDesign.md「エンディング」を参照。

import type { AttackResult } from '@/core/battle/BattleManager';
import type { CaptureResult } from '@/core/economy/CaptureSystem';
import type { ProductionResult } from '@/core/economy/ProductionManager';
import type { ArmyType } from '@/core/map/TerrainType';
import type { TurnArmy } from '@/core/turn/TurnManager';

/** 軍 1 つぶんの戦績 */
export interface ArmyStats {
  /** 攻撃した回数(反撃は数えない) */
  readonly attacks: number;
  /** 撃破した相手ユニットの数(反撃での撃破・輸送中の巻き添えも含む) */
  readonly defeated: number;
  /** 失ったユニットの数(輸送中の巻き添えも含む) */
  readonly lost: number;
  /** 生産したユニットの数 */
  readonly produced: number;
  /** 生産に使った資金の合計 */
  readonly spent: number;
  /** 占領を完了した拠点の数 */
  readonly captured: number;
}

/** 1 ゲームぶんの戦績 */
export interface BattleStats {
  /** 決着時のターン数 */
  readonly turns: number;
  readonly player: ArmyStats;
  readonly enemy: ArmyStats;
}

/** すべて 0 の戦績 */
export function emptyArmyStats(): ArmyStats {
  return { attacks: 0, defeated: 0, lost: 0, produced: 0, spent: 0, captured: 0 };
}

/** 何も起きていない状態の戦績 */
export function emptyBattleStats(): BattleStats {
  return { turns: 1, player: emptyArmyStats(), enemy: emptyArmyStats() };
}

/** 集計中の可変な戦績(記録用の内部表現) */
type MutableArmyStats = { -readonly [K in keyof ArmyStats]: ArmyStats[K] };

/** 相手の軍を返す */
function opponentOf(army: TurnArmy): TurnArmy {
  return army === 'player' ? 'enemy' : 'player';
}

/** 中立(拠点の所有者)を除いた、手番を持つ軍かどうか */
function isTurnArmy(army: ArmyType): army is TurnArmy {
  return army === 'player' || army === 'enemy';
}

/**
 * 戦闘・占領・生産の結果を受け取って戦績を数える記録係。
 *
 * 自軍の行動は MainScene が実行した結果を、敵軍の行動は敵軍AIが返した行動一覧を
 * そのまま渡して数える。どちらも「起きたこと」を渡すだけでよいように、
 * 撃破・被撃破の振り分けはここで行う。
 */
export class BattleStatsRecorder {
  private turns: number;
  private readonly armies: Record<TurnArmy, MutableArmyStats>;

  /** @param initial 中断データから再開するときに、保存されていた戦績を引き継ぐ */
  constructor(initial: BattleStats = emptyBattleStats()) {
    this.turns = initial.turns;
    this.armies = { player: { ...initial.player }, enemy: { ...initial.enemy } };
  }

  /** 撃破 1 件を、撃破した側と失った側の両方へ数える */
  private countDefeat(loser: ArmyType): void {
    if (!isTurnArmy(loser)) {
      return;
    }
    this.armies[loser].lost += 1;
    this.armies[opponentOf(loser)].defeated += 1;
  }

  /** 攻撃 1 回ぶんの結果(反撃・輸送中ユニットの巻き添えを含む)を数える */
  recordAttack(result: AttackResult): void {
    if (isTurnArmy(result.attacker.armyType)) {
      this.armies[result.attacker.armyType].attacks += 1;
    }
    if (result.defenderDefeated) {
      this.countDefeat(result.defender.armyType);
    }
    if (result.attackerDefeated) {
      this.countDefeat(result.attacker.armyType);
    }
    for (const passenger of result.lostPassengers) {
      this.countDefeat(passenger.armyType);
    }
  }

  /** 占領コマンド 1 回ぶんの結果を数える(占領が完了したときだけ数える) */
  recordCapture(result: CaptureResult): void {
    if (!result.captured || !isTurnArmy(result.unit.armyType)) {
      return;
    }
    this.armies[result.unit.armyType].captured += 1;
  }

  /** 生産 1 回ぶんの結果を数える */
  recordProduction(result: ProductionResult): void {
    if (!isTurnArmy(result.unit.armyType)) {
      return;
    }
    const stats = this.armies[result.unit.armyType];
    stats.produced += 1;
    stats.spent += result.cost;
  }

  /** 決着時のターン数を控える(手番が進むたびに呼ぶ) */
  setTurns(turns: number): void {
    this.turns = turns;
  }

  /** 現時点の戦績のスナップショットを返す */
  snapshot(): BattleStats {
    return {
      turns: this.turns,
      player: { ...this.armies.player },
      enemy: { ...this.armies.enemy },
    };
  }
}

/** 値が軍 1 つぶんの戦績として妥当か(中断データの検証に使う) */
function isArmyStats(value: unknown): value is ArmyStats {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const stats = value as Record<string, unknown>;
  return (['attacks', 'defeated', 'lost', 'produced', 'spent', 'captured'] as const).every(
    (key) => {
      const count = stats[key];
      return typeof count === 'number' && Number.isInteger(count) && count >= 0;
    },
  );
}

/** 値が 1 ゲームぶんの戦績として妥当か(中断データの検証に使う) */
export function isBattleStats(value: unknown): value is BattleStats {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const stats = value as Partial<BattleStats>;
  return (
    typeof stats.turns === 'number' &&
    Number.isInteger(stats.turns) &&
    stats.turns >= 1 &&
    isArmyStats(stats.player) &&
    isArmyStats(stats.enemy)
  );
}
