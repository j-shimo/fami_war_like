import { describe, expect, it } from 'vitest';
import { EconomyManager } from '@/core/economy/EconomyManager';
import { ProductionManager } from '@/core/economy/ProductionManager';
import { gridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import { UnitManager } from '@/core/units/UnitManager';
import type { MapDefinition } from '@/data/maps/mapDefinition';

// 自軍工場(0,0)・敵軍工場(2,0)・平地を持つ小さなテストマップ。
const PROD_MAP: MapDefinition = {
  name: '生産テストマップ',
  terrain: ['F.F', '...', '...'],
  owners: [
    { col: 0, row: 0, owner: 'player' },
    { col: 2, row: 0, owner: 'enemy' },
  ],
};

function setup(initialFunds = 10000) {
  const map = MapManager.fromDefinition(PROD_MAP);
  const units = UnitManager.fromPlacements([], map);
  const economy = new EconomyManager({ initialFunds });
  const production = new ProductionManager(units, economy);
  return { map, units, economy, production };
}

describe('ProductionManager', () => {
  it('自軍所有の空き工場では生産できる', () => {
    const { map, production } = setup();
    const tile = map.getTile(gridPosition(0, 0))!;
    expect(production.canProduceAt('player', tile)).toBe(true);
    expect(production.canProduce('player', tile, 'lightTank')).toBe(true);
  });

  it('他軍所有の工場では生産できない', () => {
    const { map, production } = setup();
    const tile = map.getTile(gridPosition(2, 0))!;
    expect(production.canProduceAt('player', tile)).toBe(false);
  });

  it('生産できない地形では生産できない', () => {
    const { map, production } = setup();
    const plain = map.getTile(gridPosition(1, 1))!;
    expect(production.canProduceAt('player', plain)).toBe(false);
  });

  it('資金が不足すると生産できない', () => {
    const { map, production } = setup(500);
    const tile = map.getTile(gridPosition(0, 0))!;
    // 軽戦車のコストは 500 を上回る
    expect(production.canProduce('player', tile, 'lightTank')).toBe(false);
  });

  it('生産するとユニットが配置され資金が減る', () => {
    const { map, units, economy, production } = setup(10000);
    const tile = map.getTile(gridPosition(0, 0))!;
    const result = production.produce('player', tile, 'infantry');

    expect(result.unit.unitType).toBe('infantry');
    expect(result.unit.armyType).toBe('player');
    expect(result.unit.hasActed).toBe(true);
    expect(economy.getFunds('player')).toBe(10000 - result.cost);
    expect(units.getUnitAt(gridPosition(0, 0))).toBe(result.unit);
  });

  it('工場上にユニットがいると生産できない', () => {
    const { map, production } = setup();
    const tile = map.getTile(gridPosition(0, 0))!;
    production.produce('player', tile, 'infantry');
    // 生産直後は工場が埋まっているので再生産不可
    expect(production.canProduceAt('player', tile)).toBe(false);
    expect(() => production.produce('player', tile, 'mediumTank')).toThrow();
  });

  it('資金不足での生産は例外を投げる', () => {
    const { map, production } = setup(0);
    const tile = map.getTile(gridPosition(0, 0))!;
    expect(() => production.produce('player', tile, 'infantry')).toThrow();
  });
});
