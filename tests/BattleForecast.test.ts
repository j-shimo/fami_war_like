import { describe, expect, it } from 'vitest';
import { forecastBattle } from '@/core/battle/BattleForecast';
import { BattleManager } from '@/core/battle/BattleManager';
import { gridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import { UnitManager } from '@/core/units/UnitManager';
import type { MapDefinition } from '@/data/maps/mapDefinition';

/** 全面平地(防御1)の 3x3 マップ */
const PLAIN_MAP: MapDefinition = { name: 'plain', terrain: ['...', '...', '...'] };

/** テスト用に MapManager と UnitManager を組み立てる */
function setup(placements: Parameters<typeof UnitManager.fromPlacements>[0]): {
  map: MapManager;
  units: UnitManager;
} {
  const map = MapManager.fromDefinition(PLAIN_MAP);
  const units = UnitManager.fromPlacements(placements, map);
  return { map, units };
}

describe('forecastBattle', () => {
  it('与ダメージと被弾後HP・撃破可否を予測する', () => {
    const { map, units } = setup([
      { col: 0, row: 0, unitType: 'mediumTank', army: 'player' },
      { col: 1, row: 0, unitType: 'infantry', army: 'enemy' },
    ]);
    const tank = units.getUnitAt(gridPosition(0, 0))!;
    const infantry = units.getUnitAt(gridPosition(1, 0))!;

    const forecast = forecastBattle(tank, infantry, map);

    // 戦車→歩兵(平地防御1): 75 × 1.0 × 0.9 = 67.5 → 68 ポイント → HP -6
    expect(forecast.damageDealt).toBe(6);
    expect(forecast.defenderHpBefore).toBe(10);
    expect(forecast.defenderHpAfter).toBe(4);
    expect(forecast.defenderDefeated).toBe(false);
    // 生存した歩兵(HP4)の反撃: 10 × 0.4 × 0.9 = 3.6 → 4 ポイント → HP は減らない
    expect(forecast.willCounter).toBe(true);
    expect(forecast.counterDamage).toBe(0);
    expect(forecast.attackerHpAfter).toBe(10);
    expect(forecast.attackerDefeated).toBe(false);
  });

  it('予測は盤面(HP)を一切変更しない', () => {
    const { map, units } = setup([
      { col: 0, row: 0, unitType: 'mediumTank', army: 'player' },
      { col: 1, row: 0, unitType: 'infantry', army: 'enemy' },
    ]);
    const tank = units.getUnitAt(gridPosition(0, 0))!;
    const infantry = units.getUnitAt(gridPosition(1, 0))!;

    forecastBattle(tank, infantry, map);

    expect(tank.currentHp).toBe(10);
    expect(infantry.currentHp).toBe(10);
    expect(tank.hasActed).toBe(false);
  });

  it('予測値は実際の戦闘結果と一致する', () => {
    const { map, units } = setup([
      { col: 0, row: 0, unitType: 'mediumTank', army: 'player' },
      { col: 1, row: 0, unitType: 'infantry', army: 'enemy' },
    ]);
    const tank = units.getUnitAt(gridPosition(0, 0))!;
    const infantry = units.getUnitAt(gridPosition(1, 0))!;

    const forecast = forecastBattle(tank, infantry, map);
    const result = new BattleManager(map, units).attack(tank, infantry);

    expect(forecast.damageDealt).toBe(result.damageDealt);
    expect(forecast.counterDamage).toBe(result.counterDamage);
    expect(forecast.defenderDefeated).toBe(result.defenderDefeated);
    expect(forecast.attackerDefeated).toBe(result.attackerDefeated);
    // 予測した被弾後HPが実際のHPと一致する
    expect(forecast.defenderHpAfter).toBe(infantry.currentHp);
    expect(forecast.attackerHpAfter).toBe(tank.currentHp);
  });

  it('防御側に蓄積した端数ダメージを加味して予測し、実際の結果と一致する', () => {
    const { map, units } = setup([
      { col: 0, row: 0, unitType: 'infantry', army: 'player' },
      { col: 1, row: 0, unitType: 'mediumTank', army: 'enemy' },
    ]);
    const infantry = units.getUnitAt(gridPosition(0, 0))!;
    const tank = units.getUnitAt(gridPosition(1, 0))!;
    // 歩兵→戦車(平地防御1): 10 × 1.0 × 0.9 = 9 ポイント。端数 3 と合わせて 12 → HP -1
    tank.damageRemainder = 3;

    const forecast = forecastBattle(infantry, tank, map);
    expect(forecast.damageDealt).toBe(1);
    expect(forecast.defenderHpAfter).toBe(9);

    const result = new BattleManager(map, units).attack(infantry, tank);
    expect(result.damageDealt).toBe(forecast.damageDealt);
    expect(tank.currentHp).toBe(forecast.defenderHpAfter);
    expect(tank.damageRemainder).toBe(2);
    expect(infantry.currentHp).toBe(forecast.attackerHpAfter);
  });

  it('撃破できる場合は反撃が発生しない', () => {
    const { map, units } = setup([
      { col: 0, row: 0, unitType: 'mediumTank', army: 'player' },
      { col: 1, row: 0, unitType: 'infantry', army: 'enemy' },
    ]);
    const infantry = units.getUnitAt(gridPosition(1, 0))!;
    infantry.currentHp = 2;
    const tank = units.getUnitAt(gridPosition(0, 0))!;

    const forecast = forecastBattle(tank, infantry, map);

    expect(forecast.defenderDefeated).toBe(true);
    expect(forecast.defenderHpAfter).toBe(0);
    expect(forecast.willCounter).toBe(false);
    expect(forecast.counterDamage).toBe(0);
  });

  it('間接攻撃(距離2以上)には反撃が発生しない', () => {
    const { map, units } = setup([
      { col: 0, row: 0, unitType: 'artillery', army: 'player' },
      { col: 2, row: 0, unitType: 'infantry', army: 'enemy' },
    ]);
    const artillery = units.getUnitAt(gridPosition(0, 0))!;
    const infantry = units.getUnitAt(gridPosition(2, 0))!;

    const forecast = forecastBattle(artillery, infantry, map);

    // 自走砲→歩兵: 70 × 1.0 × 0.9 = 63 ポイント → HP -6・端数 3
    expect(forecast.damageDealt).toBe(6);
    expect(forecast.willCounter).toBe(false);
    expect(forecast.counterDamage).toBe(0);
    expect(forecast.attackerHpAfter).toBe(10);
  });

  it('反撃で攻撃側が撃破される場合を予測する', () => {
    const { map, units } = setup([
      { col: 0, row: 0, unitType: 'infantry', army: 'player' },
      { col: 1, row: 0, unitType: 'mediumTank', army: 'enemy' },
    ]);
    const infantry = units.getUnitAt(gridPosition(0, 0))!;
    infantry.currentHp = 1;
    const tank = units.getUnitAt(gridPosition(1, 0))!;

    const forecast = forecastBattle(infantry, tank, map);

    expect(forecast.willCounter).toBe(true);
    expect(forecast.attackerDefeated).toBe(true);
    expect(forecast.attackerHpAfter).toBe(0);
  });
});
