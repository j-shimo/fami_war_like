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
 *
 * 全滅判定は「一度でも戦場にユニットを出した軍が、生存ユニットを失った」場合に成立する。
 * 初期ユニットを配置しないマップ(生産で戦力を用意するマップ)では、ゲーム開始直後は
 * 両軍ともユニット 0 だが、まだ戦場にユニットを出していないため全滅とはみなさない。
 * これにより、開始直後や生産前の状態で誤って決着してしまうのを防ぐ。
 */
export class VictoryConditionChecker {
  /** その軍が一度でも生存ユニットを持ったか。全滅判定の前提として使う */
  private readonly hasDeployed: Record<'player' | 'enemy', boolean> = {
    player: false,
    enemy: false,
  };

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
    // ユニットを持っている軍を「配備済み」として記録しておく(全滅判定の前提)
    this.updateDeployment();

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

  /** 各軍の生存ユニットの有無を見て、配備済みフラグを更新する */
  private updateDeployment(): void {
    for (const army of ['player', 'enemy'] as const) {
      if (this.units.getUnitsByArmy(army).length > 0) {
        this.hasDeployed[army] = true;
      }
    }
  }

  /**
   * 指定軍が全滅したか(戦場から一掃されたか)を判定する。
   * 一度でもユニットを配備した軍が、生存ユニットを 1 体も持たなくなった場合に true。
   * まだ一度もユニットを持っていない軍(初期0ユニットのマップの開始直後など)は、
   * これから生産で戦力を用意できるため全滅とはみなさない。
   */
  private isArmyAnnihilated(army: 'player' | 'enemy'): boolean {
    return this.hasDeployed[army] && this.units.getUnitsByArmy(army).length === 0;
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
