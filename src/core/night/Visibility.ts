// 夜戦の視界(どのマスが明るく、どの敵ユニットが見えているか)を計算する。
// Phaser には依存しない純粋なロジックとして実装し、描画側(Scene)と敵AIの双方から使う。
// 詳細な仕様は docs/GameDesign.md「夜戦」を参照。
//
// 夜戦のルール:
// - 「暗い」マスは、そのマスに敵ユニットがいるかどうかが見えない状態を指す(地形は見える)。
// - 明るいマスは「自軍が所有する拠点マス」と「自軍ユニットの視界(vision)の範囲」の和集合。
// - 潜水艦(nightStealth)は視界内にいても、自軍ユニットが隣接するまで見えない。
// - 昼戦(通常戦闘)ではマップ全体が明るく、すべての敵ユニットが見える。

import { manhattanDistance, type GridPosition } from '@/core/map/GridPosition';
import type { MapManager } from '@/core/map/MapManager';
import type { ArmyType } from '@/core/map/TerrainType';
import type { Unit } from '@/core/units/Unit';
import type { UnitManager } from '@/core/units/UnitManager';
import { getTerrainData } from '@/data/terrainData';

/** 隠密ユニット(潜水艦)を発見できる距離。隣接(マンハッタン距離 1)まで近づく必要がある */
export const STEALTH_REVEAL_DISTANCE = 1;

/** マップキー(座標を一意な文字列にする) */
function toKey(pos: GridPosition): string {
  return `${pos.col},${pos.row}`;
}

/**
 * ある軍から見た視界の状態。
 * 「明るいマス」の集合と「見えている敵ユニット」の集合を保持し、
 * 描画・攻撃対象の絞り込み・移動時の強制待機判定に使う。
 */
export class Visibility {
  /** 昼戦(すべてが見える)かどうか。true なら判定はすべて true を返す */
  private readonly daylight: boolean;
  /** 明るいマスのキー集合(昼戦では空) */
  private readonly litTiles: ReadonlySet<string>;
  /** 見えている敵ユニットの ID 集合(昼戦では空) */
  private readonly visibleUnitIds: ReadonlySet<string>;
  /** 視界を計算した軍(自軍ユニットは常に見える) */
  readonly army: ArmyType;

  private constructor(
    army: ArmyType,
    daylight: boolean,
    litTiles: ReadonlySet<string>,
    visibleUnitIds: ReadonlySet<string>,
  ) {
    this.army = army;
    this.daylight = daylight;
    this.litTiles = litTiles;
    this.visibleUnitIds = visibleUnitIds;
  }

  /**
   * 昼戦(通常戦闘)用の視界を返す。マップ全体が明るく、すべてのユニットが見える。
   * 夜戦かどうかで分岐せずに済むよう、昼戦でもこのオブジェクトを介して判定する。
   */
  static daylightFor(army: ArmyType): Visibility {
    return new Visibility(army, true, new Set(), new Set());
  }

  /** 夜戦用の視界を組み立てる(computeVisibility から使う) */
  static night(
    army: ArmyType,
    litTiles: ReadonlySet<string>,
    visibleUnitIds: ReadonlySet<string>,
  ): Visibility {
    return new Visibility(army, false, litTiles, visibleUnitIds);
  }

  /** 昼戦(マップ全体が明るい状態)かどうか */
  get isDaylight(): boolean {
    return this.daylight;
  }

  /** 指定マスが明るいか(暗いマスでは敵ユニットの有無が分からない) */
  isLit(pos: GridPosition): boolean {
    return this.daylight || this.litTiles.has(toKey(pos));
  }

  /**
   * 指定ユニットが見えているか。
   * 自軍のユニットは常に見え、敵軍のユニットは夜戦では発見できたものだけが見える。
   */
  isUnitVisible(unit: Unit): boolean {
    return (
      this.daylight || unit.armyType === this.army || this.visibleUnitIds.has(unit.id)
    );
  }

  /** 指定ユニットが「見えていない敵」か(移動時の強制待機・攻撃対象の除外に使う) */
  isUnitHidden(unit: Unit): boolean {
    return !this.isUnitVisible(unit);
  }
}

/**
 * 夜戦での 1 ユニットぶんの視界(マス数)を返す。
 * 歩兵は山の上にいるとき、高所から見渡せるぶん視界が広がる(mountainVisionBonus)。
 */
export function unitVision(unit: Unit, map: MapManager): number {
  const bonus =
    unit.mountainVisionBonus > 0 && map.getTile(unit.position)?.terrainType === 'mountain'
      ? unit.mountainVisionBonus
      : 0;
  return unit.vision + bonus;
}

/**
 * 指定した軍から見た視界を計算する。
 *
 * @param map マップ(地形・拠点の所有者を参照する)
 * @param units 盤面のユニット
 * @param army 視界を計算する軍
 * @param nightBattle 夜戦かどうか。false(昼戦)ならすべてが見える視界を返す
 */
export function computeVisibility(
  map: MapManager,
  units: UnitManager,
  army: ArmyType,
  nightBattle: boolean,
): Visibility {
  if (!nightBattle) {
    return Visibility.daylightFor(army);
  }

  const lit = new Set<string>();
  const own = units.getUnitsByArmy(army);

  // ④ 自軍が統治している拠点マスは常に明るい(開始時はここだけが明るい)
  map.forEachTile((tile) => {
    if (tile.owner === army && getTerrainData(tile.terrainType).canCapture) {
      lit.add(toKey(tile.position));
    }
  });

  // ⑦ 自軍ユニットの周囲を、そのユニットの視界のぶんだけ明るくする
  for (const unit of own) {
    const vision = unitVision(unit, map);
    for (let dc = -vision; dc <= vision; dc++) {
      const rest = vision - Math.abs(dc);
      for (let dr = -rest; dr <= rest; dr++) {
        const pos = { col: unit.position.col + dc, row: unit.position.row + dr };
        if (map.isInBounds(pos)) {
          lit.add(toKey(pos));
        }
      }
    }
  }

  // 明るいマスにいる敵ユニットを「見えている」とする。
  // ⑤ 潜水艦などの隠密ユニットだけは、視界内にいても隣接するまで発見できない。
  const visible = new Set<string>();
  for (const unit of units.getAllUnits()) {
    if (unit.armyType === army) {
      continue;
    }
    if (unit.nightStealth) {
      const adjacent = own.some(
        (watcher) =>
          manhattanDistance(watcher.position, unit.position) <= STEALTH_REVEAL_DISTANCE,
      );
      if (adjacent) {
        visible.add(unit.id);
      }
      continue;
    }
    if (lit.has(toKey(unit.position))) {
      visible.add(unit.id);
    }
  }

  return Visibility.night(army, lit, visible);
}
