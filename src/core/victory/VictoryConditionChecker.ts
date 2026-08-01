// ステージの勝敗を判定する。Phaser には依存しない純粋なロジックとして実装する。
// 敵本拠地の占領・敵軍の全滅で勝利、自軍本拠地の占領・自軍の全滅で敗北とする。
// docs/DevelopmentPlan.md Phase 8、docs/GameDesign.md「勝利条件」「敗北条件」を参照。

import type { MapManager } from '@/core/map/MapManager';
import type { UnitManager } from '@/core/units/UnitManager';

/** ステージの決着状態。MVP は自軍(player)視点で勝敗を表す */
export type GameOutcome = 'player_victory' | 'player_defeat' | 'ongoing';

/**
 * 勝敗が決した理由。
 * - enemy_hq_captured: 敵本拠地を占領した(勝利)
 * - enemy_annihilated: 敵軍を全滅させた(勝利)
 * - player_hq_captured: 自軍本拠地を占領された(敗北)
 * - player_annihilated: 自軍が全滅した(敗北)
 */
export type VictoryReason =
  'enemy_hq_captured' | 'enemy_annihilated' | 'player_hq_captured' | 'player_annihilated';

/** 勝敗判定 1 回ぶんの結果 */
export interface VictoryResult {
  /** 決着状態。未決着なら 'ongoing' */
  readonly outcome: GameOutcome;
  /** 勝敗が決した理由。未決着なら null */
  readonly reason: VictoryReason | null;
}

/** 未決着を表す共通の結果値 */
const ONGOING: VictoryResult = { outcome: 'ongoing', reason: null };

/**
 * 勝敗条件を判定するチェッカー。
 * MVP は自軍 vs 敵軍の 1 ステージを対象とし、自軍視点で勝敗を返す。
 *
 * 本拠地の占領判定は「その軍が本拠地を 1 つも所有していない」ことをもって
 * 本拠地を奪われたとみなす。各軍は開始時に自陣の本拠地を所有している前提。
 */
export class VictoryConditionChecker {
  constructor(
    private readonly map: MapManager,
    private readonly units: UnitManager,
  ) {}

  /**
   * 現在の盤面から勝敗を判定する。
   * 勝利条件(敵本拠地占領 → 敵軍全滅)を先に、続いて敗北条件を判定する。
   * 占領には生存した敵ユニットが必要なため、勝敗が同時に成立することはない。
   */
  check(): VictoryResult {
    // 勝利: 敵本拠地を占領した
    if (this.isHeadquartersLost('enemy')) {
      return { outcome: 'player_victory', reason: 'enemy_hq_captured' };
    }
    // 勝利: 敵軍を全滅させた
    if (this.isArmyAnnihilated('enemy')) {
      return { outcome: 'player_victory', reason: 'enemy_annihilated' };
    }
    // 敗北: 自軍本拠地を占領された
    if (this.isHeadquartersLost('player')) {
      return { outcome: 'player_defeat', reason: 'player_hq_captured' };
    }
    // 敗北: 自軍が全滅した
    if (this.isArmyAnnihilated('player')) {
      return { outcome: 'player_defeat', reason: 'player_annihilated' };
    }
    return ONGOING;
  }

  /** 指定軍の生存ユニットが 1 体もいないか */
  private isArmyAnnihilated(army: 'player' | 'enemy'): boolean {
    return this.units.getUnitsByArmy(army).length === 0;
  }

  /**
   * 指定軍が本拠地を奪われたか(本拠地を 1 つも所有していないか)を判定する。
   * マップに本拠地が 1 つもない場合は判定対象外とし、常に false を返す。
   */
  private isHeadquartersLost(army: 'player' | 'enemy'): boolean {
    let total = 0;
    let owned = 0;
    this.map.forEachTile((tile) => {
      if (tile.terrainType !== 'headquarters') {
        return;
      }
      total += 1;
      if (tile.owner === army) {
        owned += 1;
      }
    });
    // 本拠地が存在しないマップでは占領による勝敗判定を行わない
    return total > 0 && owned === 0;
  }
}
