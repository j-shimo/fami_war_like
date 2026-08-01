// 各軍の資金と、ターン開始時の収入を管理する。Phaser には依存しない純粋なロジック。
// 所有する占領拠点の数に応じて収入を加算する。
// docs/DevelopmentPlan.md Phase 7、docs/GameDesign.md「収入」を参照。

import type { MapManager } from '@/core/map/MapManager';
import { INCOME_PER_BASE, INITIAL_FUNDS } from '@/data/economyConfig';
import { getTerrainData } from '@/data/terrainData';

/** 資金を持つ軍勢。MVP では中立は資金を持たず、自軍・敵軍のみ */
export type EconomyArmy = 'player' | 'enemy';

/** EconomyManager の生成オプション(省略時は economyConfig の既定値を使う) */
export interface EconomyOptions {
  /** 各軍の初期資金 */
  readonly initialFunds?: number;
  /** 拠点 1 つあたりの収入 */
  readonly incomePerBase?: number;
}

/** 各軍の資金と収入を管理するマネージャ */
export class EconomyManager {
  private readonly funds: Record<EconomyArmy, number>;
  private readonly incomePerBase: number;

  constructor(options?: EconomyOptions) {
    const initial = options?.initialFunds ?? INITIAL_FUNDS;
    this.incomePerBase = options?.incomePerBase ?? INCOME_PER_BASE;
    this.funds = { player: initial, enemy: initial };
  }

  /** 指定した軍の現在の資金を返す */
  getFunds(army: EconomyArmy): number {
    return this.funds[army];
  }

  /** 指定した軍に資金を加算する(負の額は不正) */
  addFunds(army: EconomyArmy, amount: number): void {
    if (amount < 0) {
      throw new Error('加算する資金は 0 以上である必要があります');
    }
    this.funds[army] += amount;
  }

  /** 指定した軍が cost を支払えるか */
  canAfford(army: EconomyArmy, cost: number): boolean {
    return this.funds[army] >= cost;
  }

  /** 指定した軍から cost を支払う。残高不足・負の額は例外を投げる */
  spend(army: EconomyArmy, cost: number): void {
    if (cost < 0) {
      throw new Error('支払う資金は 0 以上である必要があります');
    }
    if (!this.canAfford(army, cost)) {
      throw new Error('資金が不足しています');
    }
    this.funds[army] -= cost;
  }

  /** 指定した軍が所有している占領可能拠点の数を数える */
  countBases(army: EconomyArmy, map: MapManager): number {
    let count = 0;
    map.forEachTile((tile) => {
      if (tile.owner === army && getTerrainData(tile.terrainType).canCapture) {
        count += 1;
      }
    });
    return count;
  }

  /**
   * ターン開始時の収入を計算して加算し、加算した金額を返す。
   * 収入 = 所有拠点数 × 拠点あたり収入。
   */
  collectIncome(army: EconomyArmy, map: MapManager): number {
    const income = this.countBases(army, map) * this.incomePerBase;
    this.funds[army] += income;
    return income;
  }
}
