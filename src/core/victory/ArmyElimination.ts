// 4P マップ(3 軍以上が入り乱れるバトルロイヤル)での脱落と決着を判定する。
// Phaser には依存しない純粋なロジック。
// 2 人で遊ぶマップの勝敗は VictoryConditionChecker が担い、こちらは 4P マップ専用。
// docs/GameDesign.md「4Pモード」の「脱落と勝敗」を参照。
//
// 脱落の条件は 2 人用マップの敗北条件と同じで、「自軍の本拠地を占領される」か「全滅する」か。
// ただし相手が 1 軍とは限らないため、脱落した軍勢の後始末(ユニット・拠点の扱い)をここで決める。
//   - 本拠地を占領された: その軍勢の拠点はすべて、本拠地を占領した軍勢のものになる
//   - 全滅した: その軍勢の拠点はすべて中立に戻る
//   どちらの場合も、盤面に残っていたユニットは取り除く。
// 最後の 1 軍が残った時点で、その軍勢の勝利として決着する。

import type { GridPosition } from '@/core/map/GridPosition';
import type { MapManager } from '@/core/map/MapManager';
import type { ArmyType } from '@/core/map/TerrainType';
import { INITIAL_CAPTURE_HP } from '@/core/map/TileData';
import type { TurnArmy } from '@/core/turn/TurnManager';
import type { UnitManager } from '@/core/units/UnitManager';

/**
 * 脱落の理由。
 * - hq_captured: 自軍の本拠地を占領された
 * - annihilated: 全滅した(一度でも戦場にユニットを出したあとで、生存ユニットが 0 になった)
 */
export type EliminationReason = 'hq_captured' | 'annihilated';

/** 脱落 1 件 */
export interface Elimination {
  /** 脱落した軍勢 */
  readonly army: TurnArmy;
  /** 脱落の理由 */
  readonly reason: EliminationReason;
  /** 本拠地を占領した軍勢(全滅による脱落なら null) */
  readonly capturedBy: TurnArmy | null;
}

/** 脱落の後始末をした結果 */
export interface EliminationEffect {
  /** 盤面から取り除いたユニットの数 */
  readonly removedUnits: number;
  /** 所有者が変わった拠点の数 */
  readonly transferredBases: number;
  /** 拠点の移り先(本拠地を占領した軍勢。全滅なら中立) */
  readonly newOwner: ArmyType;
}

/**
 * 4P マップの決着状態。
 * - ongoing: まだ 2 軍以上が残っていて、プレイヤーも残っている
 * - winner: 最後の 1 軍が残った(その軍勢の勝利)
 * - humans_defeated: プレイヤーが操作する軍勢がすべて脱落した(コンピューターだけが残った)
 */
export type FourPlayerOutcome =
  | { readonly kind: 'ongoing' }
  | { readonly kind: 'winner'; readonly army: TurnArmy }
  | { readonly kind: 'humans_defeated' };

/**
 * 各軍勢の「自軍の本拠地」の位置を求める。
 * ゲーム開始時(マップ定義から作った直後)の盤面に対して呼び、そのとき各軍勢が持っている
 * 本拠地を自軍の本拠地とする。本拠地を持たない軍勢は含めない。
 *
 * 4P マップでは、よその軍勢の本拠地を占領しても自軍の本拠地が増えるわけではなく、
 * ただの拠点(生産・収入)として持つだけになる。脱落の判定はこの位置だけを見る。
 */
export function findHomeHeadquarters(map: MapManager): Map<TurnArmy, GridPosition> {
  const homes = new Map<TurnArmy, GridPosition>();
  map.forEachTile((tile) => {
    if (tile.terrainType !== 'headquarters' || tile.owner === 'neutral') {
      return;
    }
    if (!homes.has(tile.owner)) {
      homes.set(tile.owner, tile.position);
    }
  });
  return homes;
}

/**
 * 脱落した軍勢を見つけるチェッカー。
 * 全滅の判定は VictoryConditionChecker と同じく、「一度でも生存ユニットを持った軍勢が
 * 生存ユニットを失った」場合にだけ成立させる(初期ユニットの無いマップの開始直後に
 * 全軍が脱落してしまうのを防ぐ)。
 */
export class EliminationChecker {
  /** 一度でも生存ユニットを持った軍勢 */
  private readonly deployed = new Set<TurnArmy>();

  constructor(
    private readonly map: MapManager,
    private readonly units: UnitManager,
    private readonly homes: ReadonlyMap<TurnArmy, GridPosition>,
  ) {}

  /**
   * まだ脱落していない軍勢(active)のうち、いまの盤面で脱落した軍勢を返す。
   * 本拠地の占領を全滅より先に判定する(本拠地を奪われた軍勢の拠点は、奪った軍勢へ渡すため)。
   */
  check(active: readonly TurnArmy[]): Elimination[] {
    for (const army of active) {
      if (this.units.getUnitsByArmy(army).length > 0) {
        this.deployed.add(army);
      }
    }

    const eliminations: Elimination[] = [];
    for (const army of active) {
      const capturedBy = this.headquartersCapturer(army);
      if (capturedBy !== undefined) {
        eliminations.push({ army, reason: 'hq_captured', capturedBy });
        continue;
      }
      if (this.deployed.has(army) && this.units.getUnitsByArmy(army).length === 0) {
        eliminations.push({ army, reason: 'annihilated', capturedBy: null });
      }
    }
    return eliminations;
  }

  /**
   * 自軍の本拠地を奪われていれば、奪った軍勢を返す(奪われていなければ undefined)。
   * 本拠地を持たない軍勢は、本拠地の占領では脱落しない。
   * 本拠地が中立になっている(あり得ないが)ときは、奪った軍勢なし(null)として扱う。
   */
  private headquartersCapturer(army: TurnArmy): TurnArmy | null | undefined {
    const home = this.homes.get(army);
    if (!home) {
      return undefined;
    }
    const owner = this.map.getTile(home)?.owner;
    if (owner === undefined || owner === army) {
      return undefined;
    }
    return owner === 'neutral' ? null : owner;
  }
}

/**
 * 脱落した軍勢の後始末をする。
 * 盤面のユニット(輸送中のユニットごと)を取り除き、拠点を
 * 本拠地を占領した軍勢(全滅なら中立)へ移す。脱落した軍勢が進めていた占領の途中経過も消す。
 * 拠点を受け取った軍勢が、その拠点を占領している途中だった場合も途中経過を消す
 * (すでに自分の拠点になったため)。
 */
export function applyElimination(
  elimination: Elimination,
  map: MapManager,
  units: UnitManager,
): EliminationEffect {
  const { army } = elimination;
  const removed = [...units.getUnitsByArmy(army)];
  for (const unit of removed) {
    units.removeUnit(unit);
  }

  const newOwner: ArmyType =
    elimination.reason === 'hq_captured' && elimination.capturedBy !== null
      ? elimination.capturedBy
      : 'neutral';
  let transferredBases = 0;
  map.forEachTile((tile) => {
    if (tile.owner === army) {
      tile.owner = newOwner;
      transferredBases += 1;
    }
    const staleCapture =
      tile.captureArmy === army ||
      (tile.captureArmy !== null && tile.captureArmy === tile.owner);
    if (staleCapture) {
      tile.captureArmy = null;
      tile.captureHp = INITIAL_CAPTURE_HP;
    }
  });

  return { removedUnits: removed.length, transferredBases, newOwner };
}

/**
 * 4P マップの決着を判定する。
 *
 * @param active まだ脱落していない軍勢
 * @param humans ゲーム開始時にプレイヤーが操作していた軍勢
 *   (プレイヤーが 1 人もいない観戦のゲームでは空配列)
 */
export function judgeFourPlayer(
  active: readonly TurnArmy[],
  humans: readonly TurnArmy[],
): FourPlayerOutcome {
  if (active.length === 1) {
    return { kind: 'winner', army: active[0] };
  }
  // 残り 0 軍(同時に全軍が脱落する)ことは通常起きないが、起きたらプレイヤーの敗北として終える
  if (active.length === 0) {
    return { kind: 'humans_defeated' };
  }
  if (humans.length > 0 && !active.some((army) => humans.includes(army))) {
    return { kind: 'humans_defeated' };
  }
  return { kind: 'ongoing' };
}
