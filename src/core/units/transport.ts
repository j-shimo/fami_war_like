// ユニットの輸送(輸送ヘリが歩兵を、輸送艦が地上ユニットを運ぶ)に関する純粋なロジック。
// Phaser には依存しない。輸送ユニットに他ユニットを「乗せる(搭乗)」ときの可否判定を提供する。
// 実際の搭乗・降車の状態更新は UnitManager が行う。詳細は docs/UnitSpec.md「輸送」を参照。
// 積み降ろしできる地形の制限(列車砲は駅だけ)は canLoadOn が受け持つ。

import type { TerrainType } from '@/core/map/TerrainType';
import type { Unit } from '@/core/units/Unit';

/**
 * transport(輸送ユニット)が passenger を搭乗させられるかを判定する。
 *
 * 条件:
 * - 別個体であること
 * - 同じ軍であること
 * - transport が輸送能力を持つ(capacity >= 1)こと
 * - transport にまだ空き枠がある(輸送ヘリは 1 体・輸送艦は 2 体まで)こと
 * - passenger の種別が transport の輸送可能種別に含まれること
 * - passenger 自身が何も運んでいない(運搬中のユニットを積み替えない)こと
 */
export function canCarry(transport: Unit, passenger: Unit): boolean {
  return (
    transport !== passenger &&
    transport.armyType === passenger.armyType &&
    transport.capacity >= 1 &&
    transport.freeCapacity >= 1 &&
    transport.data.carriableTypes.includes(passenger.unitType) &&
    !passenger.isCarrying
  );
}

/**
 * transport が terrainType のマスで積み降ろし(搭乗・降車)を行えるかを判定する。
 *
 * 輸送ヘリ・輸送車・輸送艦は停まっている地形を問わず積み降ろしできる。
 * 列車砲だけは loadingTerrainTypes に駅(station)を持ち、
 * 駅に停車しているあいだしか乗せることも降ろすこともできない
 * (線路の上に停まっていても積み降ろしはできない)。
 *
 * terrainType が未定義(マップ範囲外のマス)なら、制限のあるユニットは積み降ろしできない。
 */
export function canLoadOn(
  transport: Unit,
  terrainType: TerrainType | undefined,
): boolean {
  const allowed = transport.data.loadingTerrainTypes;
  if (!allowed) {
    return true;
  }
  return terrainType !== undefined && allowed.includes(terrainType);
}
