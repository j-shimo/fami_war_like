// マップ上の全ユニットを管理する。Phaser には依存しない純粋なロジックとして実装し、
// 描画側(Scene)からはこのクラスを介してユニット情報にアクセスする。

import { equals, gridPosition, type GridPosition } from '@/core/map/GridPosition';
import type { MapManager } from '@/core/map/MapManager';
import { Unit } from '@/core/units/Unit';
import type { UnitType } from '@/core/units/UnitType';
import { getUnitData } from '@/data/unitData';

/** ユニットの初期配置 1 体ぶんの定義。マップデータから読み込む */
export interface UnitPlacement {
  readonly col: number;
  readonly row: number;
  readonly unitType: UnitType;
  /** 所属軍。初期配置では自軍・敵軍のみを指定する */
  readonly army: 'player' | 'enemy';
}

/** マップ上のユニット集合を保持し、参照・更新の手段を提供する */
export class UnitManager {
  private readonly units: Unit[] = [];

  /**
   * 初期配置定義から UnitManager を生成する。
   * 同一マスへの重複配置はデータ不整合として例外を投げる。
   * map を渡すとマップ範囲外・進入不可地形への配置も検証する。
   */
  static fromPlacements(
    placements: readonly UnitPlacement[],
    map?: MapManager,
  ): UnitManager {
    const manager = new UnitManager();
    const occupied = new Set<string>();

    placements.forEach((placement, index) => {
      const pos = gridPosition(placement.col, placement.row);

      if (map) {
        if (!map.isInBounds(pos)) {
          throw new Error(
            `ユニット配置がマップ範囲外です(col ${placement.col}, row ${placement.row})`,
          );
        }
        const movementType = getUnitData(placement.unitType).movementType;
        if (map.getMoveCost(pos, movementType) === null) {
          throw new Error(
            `進入不可地形にユニットが配置されています(col ${placement.col}, row ${placement.row})`,
          );
        }
      }

      const key = `${placement.col},${placement.row}`;
      if (occupied.has(key)) {
        throw new Error(
          `同一マスにユニットが重複配置されています(col ${placement.col}, row ${placement.row})`,
        );
      }
      occupied.add(key);

      manager.units.push(
        new Unit({
          id: `${placement.army}-${placement.unitType}-${index}`,
          unitType: placement.unitType,
          armyType: placement.army,
          position: pos,
        }),
      );
    });

    return manager;
  }

  /** 生存しているすべてのユニットを返す */
  getAllUnits(): readonly Unit[] {
    return this.units.filter((unit) => unit.isAlive);
  }

  /** 指定した軍の生存ユニットを返す */
  getUnitsByArmy(army: Unit['armyType']): readonly Unit[] {
    return this.units.filter((unit) => unit.isAlive && unit.armyType === army);
  }

  /** 指定座標にいる生存ユニットを返す。いなければ undefined */
  getUnitAt(pos: GridPosition): Unit | undefined {
    return this.units.find((unit) => unit.isAlive && equals(unit.position, pos));
  }

  /** ID からユニットを返す。見つからなければ undefined */
  getUnitById(id: string): Unit | undefined {
    return this.units.find((unit) => unit.id === id);
  }

  /** 指定座標にユニットがいるか */
  isOccupied(pos: GridPosition): boolean {
    return this.getUnitAt(pos) !== undefined;
  }

  /**
   * ユニットを指定マスへ移動させ、行動済み状態にする。
   * 他ユニットが占有しているマスへは移動できない(データ不整合として例外)。
   * 移動範囲の妥当性(移動力・地形コスト)は呼び出し側で MovementRange により判定する。
   */
  moveUnit(unit: Unit, dest: GridPosition): void {
    const occupant = this.getUnitAt(dest);
    if (occupant && occupant !== unit) {
      throw new Error(
        `他ユニットが占有するマスへは移動できません(col ${dest.col}, row ${dest.row})`,
      );
    }
    unit.position = gridPosition(dest.col, dest.row);
    unit.hasActed = true;
  }

  /** ユニットを管理対象から取り除く(撃破時などに使う) */
  removeUnit(unit: Unit): void {
    const index = this.units.indexOf(unit);
    if (index !== -1) {
      this.units.splice(index, 1);
    }
  }
}
