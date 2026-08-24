import { describe, expect, it } from 'vitest';
import { gridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import { BattleManager } from '@/core/battle/BattleManager';
import { UnitManager } from '@/core/units/UnitManager';
import type { MapDefinition } from '@/data/maps/mapDefinition';

/** 全面平地(防御1)の 3x3 マップ */
const PLAIN_MAP: MapDefinition = { name: 'plain', terrain: ['...', '...', '...'] };

/** テスト用に BattleManager と UnitManager を組み立てる */
function setup(placements: Parameters<typeof UnitManager.fromPlacements>[0]): {
  units: UnitManager;
  battle: BattleManager;
} {
  const map = MapManager.fromDefinition(PLAIN_MAP);
  const units = UnitManager.fromPlacements(placements, map);
  return { units, battle: new BattleManager(map, units) };
}

describe('BattleManager.attack', () => {
  it('直接攻撃でダメージを与え、生存した防御側が反撃する', () => {
    const { units, battle } = setup([
      { col: 0, row: 0, unitType: 'mediumTank', army: 'player' },
      { col: 1, row: 0, unitType: 'infantry', army: 'enemy' },
    ]);
    const tank = units.getUnitAt(gridPosition(0, 0))!;
    const infantry = units.getUnitAt(gridPosition(1, 0))!;

    const result = battle.attack(tank, infantry);

    // 戦車→歩兵: 75 × 1.0 × 0.9 / 10 = 6.75 → 7
    expect(result.damageDealt).toBe(7);
    expect(infantry.currentHp).toBe(3);
    expect(result.defenderDefeated).toBe(false);
    // 歩兵(HP3)→戦車の反撃: 10 × 0.3 × 0.9 / 10 = 0.27 → 最低保証で 1
    expect(result.counterDamage).toBe(1);
    expect(tank.currentHp).toBe(9);
    expect(result.attackerDefeated).toBe(false);
    // 攻撃側は行動済みになる
    expect(tank.hasActed).toBe(true);
  });

  it('間接攻撃には反撃されない', () => {
    const { units, battle } = setup([
      { col: 0, row: 0, unitType: 'artillery', army: 'player' },
      { col: 2, row: 0, unitType: 'infantry', army: 'enemy' },
    ]);
    const artillery = units.getUnitAt(gridPosition(0, 0))!;
    const infantry = units.getUnitAt(gridPosition(2, 0))!;

    const result = battle.attack(artillery, infantry);

    // 自走砲→歩兵: 70 × 1.0 × 0.9 / 10 = 6.3 → 6
    expect(result.damageDealt).toBe(6);
    expect(infantry.currentHp).toBe(4);
    // 距離2の間接攻撃なので反撃なし
    expect(result.counterDamage).toBe(0);
    expect(artillery.currentHp).toBe(artillery.maxHp);
  });

  it('HP が 0 になった防御側は撃破され、盤面から除去される', () => {
    const { units, battle } = setup([
      { col: 0, row: 0, unitType: 'mediumTank', army: 'player' },
      { col: 1, row: 0, unitType: 'infantry', army: 'enemy' },
    ]);
    // 初期配置では HP を指定できないため、生成後に瀕死状態へ設定する
    const infantry = units.getUnitAt(gridPosition(1, 0))!;
    infantry.currentHp = 2;
    const tank = units.getUnitAt(gridPosition(0, 0))!;

    const result = battle.attack(tank, infantry);

    expect(result.defenderDefeated).toBe(true);
    expect(infantry.isAlive).toBe(false);
    // 撃破された防御側は盤面から除去され、反撃も発生しない
    expect(units.getUnitAt(gridPosition(1, 0))).toBeUndefined();
    expect(result.counterDamage).toBe(0);
    expect(tank.currentHp).toBe(tank.maxHp);
  });

  it('反撃で攻撃側が撃破されることがある', () => {
    const { units, battle } = setup([
      { col: 0, row: 0, unitType: 'infantry', army: 'player' },
      { col: 1, row: 0, unitType: 'mediumTank', army: 'enemy' },
    ]);
    const infantry = units.getUnitAt(gridPosition(0, 0))!;
    infantry.currentHp = 1;
    const tank = units.getUnitAt(gridPosition(1, 0))!;

    const result = battle.attack(infantry, tank);

    // 弱い歩兵の攻撃(最低1)の後、戦車の強力な反撃で歩兵が撃破される
    expect(result.attackerDefeated).toBe(true);
    expect(infantry.isAlive).toBe(false);
    expect(units.getUnitAt(gridPosition(0, 0))).toBeUndefined();
  });

  it('味方への攻撃・射程外の攻撃は例外を投げる', () => {
    const { units, battle } = setup([
      { col: 0, row: 0, unitType: 'mediumTank', army: 'player' },
      { col: 1, row: 0, unitType: 'mediumTank', army: 'player' },
      { col: 2, row: 2, unitType: 'mediumTank', army: 'enemy' },
    ]);
    const tank = units.getUnitAt(gridPosition(0, 0))!;
    const ally = units.getUnitAt(gridPosition(1, 0))!;
    const farEnemy = units.getUnitAt(gridPosition(2, 2))!;

    expect(() => battle.attack(tank, ally)).toThrow();
    expect(() => battle.attack(tank, farEnemy)).toThrow();
  });
});
