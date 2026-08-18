// マップ上の全ユニットを管理する。Phaser には依存しない純粋なロジックとして実装し、
// 描画側(Scene)からはこのクラスを介してユニット情報にアクセスする。

import { equals, gridPosition, type GridPosition } from '@/core/map/GridPosition';
import type { MapManager } from '@/core/map/MapManager';
import { Unit } from '@/core/units/Unit';
import { canMerge, mergedHp } from '@/core/units/merge';
import { canCarry } from '@/core/units/transport';
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

/** 生産で新規ユニットを生成するためのパラメータ */
export interface SpawnParams {
  readonly unitType: UnitType;
  /** 所属軍。生産できるのは自軍・敵軍のみ */
  readonly army: 'player' | 'enemy';
  readonly position: GridPosition;
  /** 生成時に行動済みにするか(生産直後は行動できないため通常 true) */
  readonly hasActed?: boolean;
}

/** マップ上のユニット集合を保持し、参照・更新の手段を提供する */
export class UnitManager {
  private readonly units: Unit[] = [];
  /** 生産で生成したユニットに一意な ID を振るための連番 */
  private spawnSequence = 0;

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

  /**
   * 既存の Unit 群から UnitManager を生成する(中断データからの復元に使う)。
   * 通常のゲーム開始は fromPlacements を使い、このメソッドは復元専用とする。
   * 同一マスへの重複配置、および map を渡した場合のマップ範囲外はデータ不整合として例外を投げる。
   * spawnCounter には保存時点の連番を渡し、復元後に生産したユニットの ID が
   * 既存ユニットと衝突しないようにする。
   */
  static fromUnits(
    units: readonly Unit[],
    options?: { spawnCounter?: number; map?: MapManager },
  ): UnitManager {
    const manager = new UnitManager();
    const occupied = new Set<string>();

    for (const unit of units) {
      if (options?.map && !options.map.isInBounds(unit.position)) {
        throw new Error(
          `ユニット位置がマップ範囲外です(col ${unit.position.col}, row ${unit.position.row})`,
        );
      }
      const key = `${unit.position.col},${unit.position.row}`;
      if (occupied.has(key)) {
        throw new Error(
          `同一マスにユニットが重複しています(col ${unit.position.col}, row ${unit.position.row})`,
        );
      }
      occupied.add(key);
      manager.units.push(unit);
    }

    manager.spawnSequence = options?.spawnCounter ?? 0;
    return manager;
  }

  /**
   * 生産で生成したユニット数(次に振る ID の連番)。
   * 中断データへ書き出し、復元時に fromUnits へ渡して ID の衝突を防ぐ。
   */
  get spawnCounter(): number {
    return this.spawnSequence;
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
   * ユニットを指定マスへ移動させる。
   * 既定では移動後に行動済み状態にするが、移動後に占領などの追加コマンドを
   * 選ばせたい場合は markActed を false にして行動済み化を保留できる。
   * 他ユニットが占有しているマスへは移動できない(データ不整合として例外)。
   * 移動範囲の妥当性(移動力・地形コスト)は呼び出し側で MovementRange により判定する。
   */
  moveUnit(unit: Unit, dest: GridPosition, options?: { markActed?: boolean }): void {
    const occupant = this.getUnitAt(dest);
    if (occupant && occupant !== unit) {
      throw new Error(
        `他ユニットが占有するマスへは移動できません(col ${dest.col}, row ${dest.row})`,
      );
    }
    unit.position = gridPosition(dest.col, dest.row);
    if (options?.markActed ?? true) {
      unit.hasActed = true;
    }
  }

  /**
   * 生産により新規ユニットを生成し、管理対象に加える。
   * 生成先マスが埋まっている場合はデータ不整合として例外を投げる。
   */
  spawnUnit(params: SpawnParams): Unit {
    if (this.isOccupied(params.position)) {
      throw new Error(
        `ユニットのいるマスには生産できません(col ${params.position.col}, row ${params.position.row})`,
      );
    }
    const unit = new Unit({
      id: `spawn-${params.army}-${this.spawnSequence++}`,
      unitType: params.unitType,
      armyType: params.army,
      position: params.position,
      hasActed: params.hasActed ?? true,
    });
    this.units.push(unit);
    return unit;
  }

  /**
   * source を target に合流させる。
   * target の HP に source の HP を加算(最大 HP で頭打ち)し、target を行動済み(待機)にして、
   * source を盤面から取り除く。合流後は target 1 体だけが残る。
   * 合流できない組み合わせ(異なる軍・種別、同一ユニット、いずれかが満タン)は
   * データ不整合として例外を投げる(呼び出し側で canMerge により事前判定する想定)。
   */
  mergeUnit(source: Unit, target: Unit): void {
    if (!canMerge(source, target)) {
      throw new Error('合流できない組み合わせのユニットです');
    }
    target.currentHp = mergedHp(source, target);
    target.hasActed = true;
    this.removeUnit(source);
  }

  /**
   * passenger を transport に搭乗させる。
   * passenger を盤面(管理対象)から取り除いて transport.carried に保持する。
   * 搭乗した passenger は行動済み(このターンは行動できない)にする。
   * 搭乗できない組み合わせはデータ不整合として例外を投げる
   * (呼び出し側で canCarry により事前判定する想定)。
   */
  carryUnit(transport: Unit, passenger: Unit): void {
    if (!canCarry(transport, passenger)) {
      throw new Error('このユニットは搭乗できません');
    }
    passenger.hasActed = true;
    transport.carried = passenger;
    this.removeUnit(passenger);
  }

  /**
   * transport が運んでいるユニットを dest マスへ降ろす。
   * 降車したユニットを盤面へ戻して行動済み(このターンは行動できない)にし、
   * transport も行動済みにする。降ろしたユニットを返す。
   * 何も運んでいない、または降車先が埋まっている場合はデータ不整合として例外を投げる。
   */
  dropUnit(transport: Unit, dest: GridPosition): Unit {
    const passenger = transport.carried;
    if (!passenger) {
      throw new Error('搭乗しているユニットがいません');
    }
    if (this.isOccupied(dest)) {
      throw new Error(
        `ユニットのいるマスには降ろせません(col ${dest.col}, row ${dest.row})`,
      );
    }
    passenger.position = gridPosition(dest.col, dest.row);
    passenger.hasActed = true;
    transport.carried = null;
    transport.hasActed = true;
    this.units.push(passenger);
    return passenger;
  }

  /** ユニットを管理対象から取り除く(撃破時などに使う) */
  removeUnit(unit: Unit): void {
    const index = this.units.indexOf(unit);
    if (index !== -1) {
      this.units.splice(index, 1);
    }
  }
}
