// マップ上に配置されるユニット 1 体の状態を表す。Phaser には依存しない純粋なロジック。
// 静的パラメータ(最大 HP・移動力など)は unitData から参照し、
// このクラスは可変な状態(位置・現在 HP・行動済みフラグ)を保持する。

import { gridPosition, type GridPosition } from '@/core/map/GridPosition';
import type { ArmyType, MovementType } from '@/core/map/TerrainType';
import type { UnitType } from '@/core/units/UnitType';
import { getUnitData, type UnitData } from '@/data/unitData';

/** Unit を生成するためのパラメータ */
export interface UnitParams {
  /** ユニットを一意に識別する ID */
  readonly id: string;
  /** ユニット種別 */
  readonly unitType: UnitType;
  /** 所属軍 */
  readonly armyType: ArmyType;
  /** 現在位置 */
  readonly position: GridPosition;
  /** 現在 HP(省略時は最大 HP) */
  readonly currentHp?: number;
  /** 行動済みか(省略時は false) */
  readonly hasActed?: boolean;
}

/** マップ上に配置されるユニット 1 体 */
export class Unit {
  /** ユニットを一意に識別する ID */
  readonly id: string;
  /** ユニット種別 */
  readonly unitType: UnitType;
  /** 所属軍 */
  readonly armyType: ArmyType;
  /** 現在位置 */
  position: GridPosition;
  /** 現在 HP */
  currentHp: number;
  /** 行動済みか。ターン内に移動・攻撃を終えると true になる */
  hasActed: boolean;

  constructor(params: UnitParams) {
    this.id = params.id;
    this.unitType = params.unitType;
    this.armyType = params.armyType;
    this.position = gridPosition(params.position.col, params.position.row);
    this.currentHp = params.currentHp ?? this.data.maxHp;
    this.hasActed = params.hasActed ?? false;
  }

  /** このユニットの静的パラメータ */
  get data(): UnitData {
    return getUnitData(this.unitType);
  }

  /** 表示名 */
  get unitName(): string {
    return this.data.unitName;
  }

  /** 最大 HP */
  get maxHp(): number {
    return this.data.maxHp;
  }

  /** 移動力 */
  get movement(): number {
    return this.data.movement;
  }

  /** 移動タイプ */
  get movementType(): MovementType {
    return this.data.movementType;
  }

  /** 最小射程 */
  get minAttackRange(): number {
    return this.data.minAttackRange;
  }

  /** 最大射程 */
  get maxAttackRange(): number {
    return this.data.maxAttackRange;
  }

  /** 拠点を占領できるか */
  get canCapture(): boolean {
    return this.data.canCapture;
  }

  /** 生存しているか(HP が 1 以上) */
  get isAlive(): boolean {
    return this.currentHp > 0;
  }
}
