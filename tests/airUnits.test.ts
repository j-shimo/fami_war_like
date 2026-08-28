import { describe, expect, it } from 'vitest';
import { calculateDamage } from '@/core/battle/DamageCalculator';
import { EconomyManager } from '@/core/economy/EconomyManager';
import { ProductionManager } from '@/core/economy/ProductionManager';
import { gridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import { calculateMovementRange } from '@/core/movement/MovementRange';
import { Unit } from '@/core/units/Unit';
import type { UnitType } from '@/core/units/UnitType';
import { UnitManager } from '@/core/units/UnitManager';
import type { MapDefinition } from '@/data/maps/mapDefinition';

function makeUnit(unitType: UnitType, currentHp?: number): Unit {
  return new Unit({
    id: `${unitType}-test`,
    unitType,
    armyType: 'player',
    position: gridPosition(0, 0),
    currentHp,
  });
}

describe('飛行ユニットの移動', () => {
  it('戦闘ヘリは海や山の上も一定コストで越えられる', () => {
    // 横一列: 平地・海・山・平地。地上ユニットは海・山で止まるが飛行は通り抜ける。
    const def: MapDefinition = {
      name: 'air',
      terrain: ['.~m.'],
    };
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements([
      { col: 0, row: 0, unitType: 'attackHelicopter', army: 'player' },
    ]);
    const heli = units.getUnitAt(gridPosition(0, 0))!;

    const range = calculateMovementRange(heli, map, units);
    // 移動力6・各マス air コスト1 なので右端(3,0)まで到達できる
    expect(range.canReach(gridPosition(1, 0))).toBe(true); // 海
    expect(range.canReach(gridPosition(2, 0))).toBe(true); // 山
    expect(range.canReach(gridPosition(3, 0))).toBe(true);
  });

  it('輸送ヘリは移動力6で飛行移動できる', () => {
    const def: MapDefinition = {
      name: 'air',
      terrain: ['~~~~~~~'],
    };
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements([
      { col: 0, row: 0, unitType: 'transportHelicopter', army: 'player' },
    ]);
    const th = units.getUnitAt(gridPosition(0, 0))!;

    const range = calculateMovementRange(th, map, units);
    expect(range.canReach(gridPosition(6, 0))).toBe(true);
  });
});

describe('飛行ユニットへの地形防御', () => {
  it('飛行ユニットは地形の防御補正を受けない(常に防御0扱い)', () => {
    const antiAir = makeUnit('antiAirTank');
    const heli = makeUnit('attackHelicopter');
    // 防御3の地形上でも、飛行ユニットは防御0として計算される
    const onDefense = calculateDamage(antiAir, heli, 3);
    const noDefense = calculateDamage(antiAir, heli, 0);
    expect(onDefense).toBe(noDefense);
  });
});

describe('新ユニットの戦闘相性', () => {
  it('戦闘ヘリは歩兵に強く、対空戦車には弱い', () => {
    const heli = makeUnit('attackHelicopter');
    const infantry = makeUnit('infantry');
    const antiAir = makeUnit('antiAirTank');
    const vsInfantry = calculateDamage(heli, infantry, 0);
    const vsAntiAir = calculateDamage(heli, antiAir, 0);
    // 対歩兵(基礎80)は高ダメージ、対空戦車(基礎15)は低ダメージ
    expect(vsInfantry).toBeGreaterThanOrEqual(7);
    expect(vsAntiAir).toBeLessThanOrEqual(2);
    expect(vsInfantry).toBeGreaterThan(vsAntiAir);
  });

  it('対空戦車は飛行ユニットに強く、戦車には弱い', () => {
    const antiAir = makeUnit('antiAirTank');
    const heli = makeUnit('attackHelicopter');
    const tank = makeUnit('mediumTank');
    const vsHeli = calculateDamage(antiAir, heli, 0);
    const vsTank = calculateDamage(antiAir, tank, 0);
    // 対戦闘ヘリ(基礎85)は高ダメージ、対戦車(基礎15)は低ダメージ
    expect(vsHeli).toBeGreaterThanOrEqual(8);
    expect(vsTank).toBeLessThanOrEqual(2);
  });

  it('輸送ヘリは攻撃できず、常に0ダメージ', () => {
    const th = makeUnit('transportHelicopter');
    expect(th.canAttack).toBe(false);
    expect(calculateDamage(th, makeUnit('infantry'), 0)).toBe(0);
    expect(calculateDamage(th, makeUnit('mediumTank'), 0)).toBe(0);
  });
});

describe('生産拠点ごとの生産可否', () => {
  // 上段に空港(0,0)と工場(1,0)を並べた自軍の生産マップ
  const PROD_MAP: MapDefinition = {
    name: 'prod',
    terrain: ['AF.', '...'],
    owners: [
      { col: 0, row: 0, owner: 'player' },
      { col: 1, row: 0, owner: 'player' },
    ],
  };

  function setup(initialFunds = 20000) {
    const map = MapManager.fromDefinition(PROD_MAP);
    const units = UnitManager.fromPlacements([], map);
    const economy = new EconomyManager({ initialFunds });
    const production = new ProductionManager(map, units, economy);
    return { map, production };
  }

  it('空港では飛行ユニットを生産できるが、地上ユニットは生産できない', () => {
    const { map, production } = setup();
    const airport = map.getTile(gridPosition(0, 0))!;
    expect(production.canProduce('player', airport, 'attackHelicopter')).toBe(true);
    expect(production.canProduce('player', airport, 'transportHelicopter')).toBe(true);
    expect(production.canProduce('player', airport, 'mediumTank')).toBe(false);
    expect(production.canProduce('player', airport, 'infantry')).toBe(false);
  });

  it('工場では地上ユニットを生産できるが、飛行ユニットは生産できない', () => {
    const { map, production } = setup();
    const factory = map.getTile(gridPosition(1, 0))!;
    expect(production.canProduce('player', factory, 'antiAirTank')).toBe(true);
    expect(production.canProduce('player', factory, 'mediumTank')).toBe(true);
    expect(production.canProduce('player', factory, 'attackHelicopter')).toBe(false);
  });

  it('生産拠点に合わない種別を produce すると例外を投げる', () => {
    const { map, production } = setup();
    const airport = map.getTile(gridPosition(0, 0))!;
    expect(() => production.produce('player', airport, 'mediumTank')).toThrow();
  });
});
