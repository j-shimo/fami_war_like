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
  /**
   * 輸送中のユニット(輸送ヘリが歩兵を、輸送艦が地上ユニットを運んでいるときの搭乗ユニット)。
   * 搭乗中のユニットは盤面(UnitManager)からは取り除かれ、この配列の参照だけが保持される。
   * 何も運んでいない場合は空配列。乗せられる数は capacity で決まる(輸送ヘリ 1・輸送艦 2)。
   */
  carried: Unit[] = [];

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

  /**
   * 間接攻撃(遠距離)ユニットかどうか。最小射程が 2 以上なら true。
   * 間接攻撃ユニットは移動した後は攻撃できない(その場からのみ攻撃可)。
   */
  get isIndirect(): boolean {
    return this.data.minAttackRange >= 2;
  }

  /** 拠点を占領できるか */
  get canCapture(): boolean {
    return this.data.canCapture;
  }

  /** 攻撃できるユニットか(最大射程が 1 以上)。輸送ヘリ・輸送艦は false */
  get canAttack(): boolean {
    return this.data.maxAttackRange >= 1;
  }

  /** 輸送できるユニット数(輸送ヘリは 1・輸送艦は 2。輸送しないユニットは 0) */
  get capacity(): number {
    return this.data.capacity;
  }

  /** 現在ユニットを 1 体以上運んでいるか */
  get isCarrying(): boolean {
    return this.carried.length > 0;
  }

  /** あと何体乗せられるか(空き枠の数) */
  get freeCapacity(): number {
    return this.capacity - this.carried.length;
  }

  /**
   * 夜戦で敵を発見できる視界(マス数)。護衛艦がもっとも広い(5)。
   * 地形による補正込みの値は Visibility の unitVision() で求める。
   * 昼戦(通常戦闘)ではマップ全体が明るいため参照しない。
   */
  get vision(): number {
    return this.data.vision;
  }

  /**
   * 山の上にいるときに視界へ加算するマス数(歩兵のみ 3、それ以外は 0)。
   * 夜戦でのみ参照する。
   */
  get mountainVisionBonus(): number {
    return this.data.mountainVisionBonus;
  }

  /**
   * 夜戦で隣接マスまで近づかないと発見できない隠密ユニットか(潜水艦のみ true)。
   * 昼戦(通常戦闘)では参照しない。
   */
  get nightStealth(): boolean {
    return this.data.nightStealth;
  }

  /** 生存しているか(HP が 1 以上) */
  get isAlive(): boolean {
    return this.currentHp > 0;
  }
}
