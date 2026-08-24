// 夜戦の移動・攻撃まわりの挙動(見えない敵のすり抜けと強制待機、攻撃対象の絞り込み)。

import { describe, expect, it } from 'vitest';
import { findAttackableTargets } from '@/core/battle/AttackRange';
import { equals, gridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import {
  calculateMovementRange,
  resolveMovePath,
  type MovementOptions,
} from '@/core/movement/MovementRange';
import { computeVisibility } from '@/core/night/Visibility';
import { UnitManager } from '@/core/units/UnitManager';
import type { MapDefinition } from '@/data/maps/mapDefinition';

/** 横一列 8 マスの道路マップ(移動経路が一本道になり、強制待機を検証しやすい) */
const ROAD_DEF: MapDefinition = { name: 'road', terrain: ['rrrrrrrr'] };

/** 自軍から見た視界を使う移動オプションを作る */
function nightOptions(map: MapManager, units: UnitManager): MovementOptions {
  const vision = computeVisibility(map, units, 'player', true);
  return { isHiddenEnemy: (unit) => vision.isUnitHidden(unit) };
}

describe('夜戦の移動範囲', () => {
  it('見えていない敵のマスは通過できる扱いになる', () => {
    const map = MapManager.fromDefinition(ROAD_DEF);
    // 戦車(移動力5・視界2)。距離 4 の敵歩兵は視界の外なので見えていない
    const units = UnitManager.fromPlacements([
      { col: 0, row: 0, unitType: 'mediumTank', army: 'player' },
      { col: 4, row: 0, unitType: 'infantry', army: 'enemy' },
    ]);
    const tank = units.getUnitAt(gridPosition(0, 0))!;

    // 昼戦では敵のマスで行き止まりになる
    const dayRange = calculateMovementRange(tank, map, units);
    expect(dayRange.canReach(gridPosition(3, 0))).toBe(true);
    expect(dayRange.canReach(gridPosition(5, 0))).toBe(false);

    // 夜戦では見えない敵をすり抜けた先まで移動範囲に入る
    const nightRange = calculateMovementRange(tank, map, units, nightOptions(map, units));
    expect(nightRange.canReach(gridPosition(5, 0))).toBe(true);
    // 敵が占有しているマスも、プレイヤーには空きマスに見えるため移動先として選べる
    // (実際に進むと 1 つ手前で強制待機になる)
    expect(nightRange.canReach(gridPosition(4, 0))).toBe(true);
  });

  it('見えない敵のマスを移動先に選ぶと、その 1 つ手前で強制待機になる', () => {
    const map = MapManager.fromDefinition(ROAD_DEF);
    const units = UnitManager.fromPlacements([
      { col: 0, row: 0, unitType: 'mediumTank', army: 'player' },
      { col: 4, row: 0, unitType: 'infantry', army: 'enemy' },
    ]);
    const tank = units.getUnitAt(gridPosition(0, 0))!;
    const options = nightOptions(map, units);

    // 敵のいるマス自体を移動先に指定できる(暗いので空きマスに見える)
    expect(
      calculateMovementRange(tank, map, units, options).canReach(gridPosition(4, 0)),
    ).toBe(true);

    const resolved = resolveMovePath(tank, map, units, gridPosition(4, 0), options);
    expect(equals(resolved.destination, gridPosition(3, 0))).toBe(true);
    expect(resolved.blockedBy).toBe(units.getUnitAt(gridPosition(4, 0)));
  });
});

describe('夜戦の強制待機(resolveMovePath)', () => {
  it('経路上の見えない敵の 1 つ手前で止まる', () => {
    const map = MapManager.fromDefinition(ROAD_DEF);
    const units = UnitManager.fromPlacements([
      { col: 0, row: 0, unitType: 'mediumTank', army: 'player' },
      { col: 4, row: 0, unitType: 'infantry', army: 'enemy' },
    ]);
    const tank = units.getUnitAt(gridPosition(0, 0))!;

    const resolved = resolveMovePath(
      tank,
      map,
      units,
      gridPosition(5, 0),
      nightOptions(map, units),
    );

    expect(equals(resolved.destination, gridPosition(3, 0))).toBe(true);
    expect(resolved.blockedBy).toBe(units.getUnitAt(gridPosition(4, 0)));
    expect(resolved.path.map((p) => p.col)).toEqual([0, 1, 2, 3]);
  });

  it('味方が隣接して見張っている敵は発見済みなので、すり抜けも強制待機も起きない', () => {
    const map = MapManager.fromDefinition(ROAD_DEF);
    const units = UnitManager.fromPlacements([
      { col: 0, row: 0, unitType: 'mediumTank', army: 'player' },
      // (3,0) の味方歩兵(視界2)が隣の敵を照らすため、敵は見えている
      { col: 3, row: 0, unitType: 'infantry', army: 'player' },
      { col: 4, row: 0, unitType: 'infantry', army: 'enemy' },
    ]);
    const tank = units.getUnitAt(gridPosition(0, 0))!;

    const options = nightOptions(map, units);
    // 見えている敵のマスは通れないので (5,0) へは到達できず、その場に留まる
    const resolved = resolveMovePath(tank, map, units, gridPosition(5, 0), options);
    expect(equals(resolved.destination, gridPosition(0, 0))).toBe(true);
    expect(resolved.blockedBy).toBeNull();

    // 敵の手前(2,0)までは通常どおり移動できる
    const near = resolveMovePath(tank, map, units, gridPosition(2, 0), options);
    expect(equals(near.destination, gridPosition(2, 0))).toBe(true);
  });

  it('敵に出くわさなければ指定した移動先まで進む', () => {
    const map = MapManager.fromDefinition(ROAD_DEF);
    const units = UnitManager.fromPlacements([
      { col: 0, row: 0, unitType: 'mediumTank', army: 'player' },
    ]);
    const tank = units.getUnitAt(gridPosition(0, 0))!;

    const resolved = resolveMovePath(
      tank,
      map,
      units,
      gridPosition(5, 0),
      nightOptions(map, units),
    );

    expect(equals(resolved.destination, gridPosition(5, 0))).toBe(true);
    expect(resolved.blockedBy).toBeNull();
  });

  it('到達できない移動先を指定すると開始マスに留まる', () => {
    const map = MapManager.fromDefinition(ROAD_DEF);
    const units = UnitManager.fromPlacements([
      { col: 0, row: 0, unitType: 'mediumTank', army: 'player' },
    ]);
    const tank = units.getUnitAt(gridPosition(0, 0))!;

    const resolved = resolveMovePath(tank, map, units, gridPosition(7, 0));

    expect(equals(resolved.destination, gridPosition(0, 0))).toBe(true);
    expect(resolved.blockedBy).toBeNull();
  });
});

describe('夜戦の攻撃対象', () => {
  it('見えていない敵は隣接していても攻撃できない', () => {
    // 海マップで、隣接していない潜水艦は隠密のまま
    const def: MapDefinition = { name: 'sea', terrain: ['~~~~~'] };
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements([
      { col: 0, row: 0, unitType: 'escortShip', army: 'player' },
      { col: 1, row: 0, unitType: 'submarine', army: 'enemy' },
    ]);
    const escort = units.getUnitAt(gridPosition(0, 0))!;
    const vision = computeVisibility(map, units, 'player', true);

    // 隣接しているので潜水艦は発見済み。攻撃できる
    expect(
      findAttackableTargets(escort, units, escort.position, {
        isVisible: (unit) => vision.isUnitVisible(unit),
      }),
    ).toHaveLength(1);
  });

  it('暗いマスにいる敵は射程内でも攻撃対象にならない', () => {
    const map = MapManager.fromDefinition(ROAD_DEF);
    // 自走砲の視界は 1 だが射程は 2〜3。射程内でも視界の外の敵は撃てない
    const units = UnitManager.fromPlacements([
      { col: 0, row: 0, unitType: 'artillery', army: 'player' },
      { col: 3, row: 0, unitType: 'infantry', army: 'enemy' },
    ]);
    const artillery = units.getUnitAt(gridPosition(0, 0))!;
    const vision = computeVisibility(map, units, 'player', true);

    // 昼戦なら射程内なので攻撃できる
    expect(findAttackableTargets(artillery, units)).toHaveLength(1);
    // 夜戦では見えていないので攻撃対象にならない
    expect(
      findAttackableTargets(artillery, units, artillery.position, {
        isVisible: (unit) => vision.isUnitVisible(unit),
      }),
    ).toHaveLength(0);
  });
});
