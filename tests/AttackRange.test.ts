import { describe, expect, it } from 'vitest';
import { gridPosition } from '@/core/map/GridPosition';
import {
  calculateAttackableTiles,
  findAttackableTargets,
  isWithinAttackRange,
} from '@/core/battle/AttackRange';
import { UnitManager } from '@/core/units/UnitManager';

/** テスト用に単一ユニットを配置した UnitManager を作る */
function makeUnits(
  placements: Parameters<typeof UnitManager.fromPlacements>[0],
): UnitManager {
  return UnitManager.fromPlacements(placements);
}

describe('isWithinAttackRange', () => {
  it('直接攻撃(射程1)は隣接マスのみ射程内', () => {
    const units = makeUnits([{ col: 2, row: 2, unitType: 'tank', army: 'player' }]);
    const tank = units.getUnitAt(gridPosition(2, 2))!;
    expect(isWithinAttackRange(tank, gridPosition(2, 3))).toBe(true); // 距離1
    expect(isWithinAttackRange(tank, gridPosition(2, 2))).toBe(false); // 距離0(自マス)
    expect(isWithinAttackRange(tank, gridPosition(2, 4))).toBe(false); // 距離2
  });

  it('間接攻撃(射程2-3)は最小射程未満の隣接マスを攻撃できない', () => {
    const units = makeUnits([{ col: 5, row: 5, unitType: 'artillery', army: 'player' }]);
    const artillery = units.getUnitAt(gridPosition(5, 5))!;
    expect(isWithinAttackRange(artillery, gridPosition(5, 6))).toBe(false); // 距離1
    expect(isWithinAttackRange(artillery, gridPosition(5, 7))).toBe(true); // 距離2
    expect(isWithinAttackRange(artillery, gridPosition(5, 8))).toBe(true); // 距離3
    expect(isWithinAttackRange(artillery, gridPosition(5, 9))).toBe(false); // 距離4
  });
});

describe('calculateAttackableTiles', () => {
  it('射程1の攻撃範囲は隣接4マス', () => {
    const units = makeUnits([{ col: 2, row: 2, unitType: 'tank', army: 'player' }]);
    const tank = units.getUnitAt(gridPosition(2, 2))!;
    const tiles = calculateAttackableTiles(tank);
    expect(tiles).toHaveLength(4);
  });

  it('射程2-3の攻撃範囲は最小射程未満のマスを含まない', () => {
    const units = makeUnits([{ col: 5, row: 5, unitType: 'artillery', army: 'player' }]);
    const artillery = units.getUnitAt(gridPosition(5, 5))!;
    const tiles = calculateAttackableTiles(artillery);
    // 距離1のマス(隣接4マス)は含まれない
    const hasAdjacent = tiles.some(
      (t) => Math.abs(t.col - 5) + Math.abs(t.row - 5) === 1,
    );
    expect(hasAdjacent).toBe(false);
    // すべて距離2または3
    expect(
      tiles.every((t) => {
        const d = Math.abs(t.col - 5) + Math.abs(t.row - 5);
        return d >= 2 && d <= 3;
      }),
    ).toBe(true);
  });
});

describe('findAttackableTargets', () => {
  it('射程内の敵ユニットのみを対象にする', () => {
    const units = makeUnits([
      { col: 2, row: 2, unitType: 'tank', army: 'player' },
      { col: 2, row: 3, unitType: 'infantry', army: 'enemy' }, // 距離1(対象)
      { col: 2, row: 4, unitType: 'infantry', army: 'enemy' }, // 距離2(範囲外)
      { col: 3, row: 2, unitType: 'infantry', army: 'player' }, // 味方(対象外)
    ]);
    const tank = units.getUnitAt(gridPosition(2, 2))!;
    const targets = findAttackableTargets(tank, units);
    expect(targets).toHaveLength(1);
    expect(targets[0].position).toEqual(gridPosition(2, 3));
  });

  it('射程内に敵がいなければ空配列を返す', () => {
    const units = makeUnits([
      { col: 0, row: 0, unitType: 'tank', army: 'player' },
      { col: 5, row: 5, unitType: 'tank', army: 'enemy' },
    ]);
    const tank = units.getUnitAt(gridPosition(0, 0))!;
    expect(findAttackableTargets(tank, units)).toHaveLength(0);
  });
});
