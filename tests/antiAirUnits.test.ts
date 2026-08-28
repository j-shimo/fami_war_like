// 対空自走砲・対空ロケット砲(飛行ユニットだけを狙う 2 種の地上ユニット)の仕様テスト。
// パラメータ(コスト・移動力・視界・射程・移動コスト・生産拠点)と、
// 依頼仕様に対応する相性・防御力を確認する。仕様は docs/UnitSpec.md を参照。

import { describe, expect, it } from 'vitest';
import { canAttackUnit, findAttackableTargets } from '@/core/battle/AttackRange';
import { BattleManager } from '@/core/battle/BattleManager';
import { EconomyManager } from '@/core/economy/EconomyManager';
import { ProductionManager } from '@/core/economy/ProductionManager';
import { gridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import type { TerrainType } from '@/core/map/TerrainType';
import { calculateMovementRange } from '@/core/movement/MovementRange';
import { Unit } from '@/core/units/Unit';
import { UnitManager, type UnitPlacement } from '@/core/units/UnitManager';
import { canCarry } from '@/core/units/transport';
import {
  AIR_UNIT_TYPES,
  ANTI_AIR_UNIT_TYPES,
  GROUND_UNIT_TYPES,
  NAVAL_UNIT_TYPES,
  UNIT_TYPES,
  type UnitType,
} from '@/core/units/UnitType';
import { getBaseDamage } from '@/data/damageTable';
import type { MapDefinition } from '@/data/maps/mapDefinition';
import { getTerrainData } from '@/data/terrainData';
import { getUnitData, isProducibleAt, producibleUnitTypesAt } from '@/data/unitData';
import { listProductionItems } from '@/ui/economyInfo';

/** テスト用のユニットを 1 体作る */
function makeUnit(
  unitType: UnitType,
  army: 'player' | 'enemy' = 'player',
  col = 0,
  row = 0,
): Unit {
  return new Unit({
    id: `${unitType}-${army}-${col}-${row}`,
    unitType,
    armyType: army,
    position: gridPosition(col, row),
  });
}

/** 指定した移動タイプでの地形の移動コスト(進入不可は null) */
function moveCost(
  terrain: TerrainType,
  movementType: 'vehicle' | 'wheeled',
): number | null {
  return getTerrainData(terrain).moveCost[movementType];
}

describe('対空自走砲の基本パラメータ', () => {
  it('コスト5500・移動力4・視界1・射程2〜3の間接攻撃ユニット', () => {
    const data = getUnitData('antiAirArtillery');
    expect(data.unitName).toBe('対空自走砲');
    expect(data.cost).toBe(5500);
    expect(data.movement).toBe(4);
    expect(data.vision).toBe(1);
    expect(data.minAttackRange).toBe(2);
    expect(data.maxAttackRange).toBe(3);
    expect(data.canCapture).toBe(false);
    // 最小射程 2 以上なので、移動後は攻撃できない間接攻撃ユニットになる
    expect(makeUnit('antiAirArtillery').isIndirect).toBe(true);
  });

  it('工場・本拠地で生産でき、地上ユニットとして輸送艦に積める', () => {
    expect(isProducibleAt('factory', 'antiAirArtillery')).toBe(true);
    expect(isProducibleAt('headquarters', 'antiAirArtillery')).toBe(true);
    expect(isProducibleAt('airport', 'antiAirArtillery')).toBe(false);
    expect(isProducibleAt('port', 'antiAirArtillery')).toBe(false);
    expect(GROUND_UNIT_TYPES).toContain('antiAirArtillery');
    expect(canCarry(makeUnit('transportShip'), makeUnit('antiAirArtillery'))).toBe(true);
  });

  it('装軌車両なので、道路・拠点・平地は1・森は2・海岸は2で、山・海は進入不可', () => {
    expect(getUnitData('antiAirArtillery').movementType).toBe('vehicle');
    expect(moveCost('road', 'vehicle')).toBe(1);
    expect(moveCost('city', 'vehicle')).toBe(1);
    expect(moveCost('factory', 'vehicle')).toBe(1);
    expect(moveCost('airport', 'vehicle')).toBe(1);
    expect(moveCost('port', 'vehicle')).toBe(1);
    expect(moveCost('headquarters', 'vehicle')).toBe(1);
    expect(moveCost('plain', 'vehicle')).toBe(1);
    expect(moveCost('forest', 'vehicle')).toBe(2);
    expect(moveCost('beach', 'vehicle')).toBe(2);
    expect(moveCost('mountain', 'vehicle')).toBeNull();
    expect(moveCost('sea', 'vehicle')).toBeNull();
  });

  it('山へは進入できず、平地は移動力4ぶん進める', () => {
    const def: MapDefinition = { name: 'aa-move', terrain: ['....m..'] };
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements(
      [{ col: 0, row: 0, unitType: 'antiAirArtillery', army: 'player' }],
      map,
    );
    const antiAir = units.getUnitAt(gridPosition(0, 0))!;
    const range = calculateMovementRange(antiAir, map, units);

    expect(range.canReach(gridPosition(4, 0))).toBe(false); // 山は進入不可
    expect(range.canReach(gridPosition(3, 0))).toBe(true);
  });
});

describe('対空ロケット砲の基本パラメータ', () => {
  it('コスト13000・移動力4・視界1・射程3〜5の間接攻撃ユニット', () => {
    const data = getUnitData('antiAirRocketArtillery');
    expect(data.unitName).toBe('対空ロケット砲');
    expect(data.cost).toBe(13000);
    expect(data.movement).toBe(4);
    expect(data.vision).toBe(1);
    expect(data.minAttackRange).toBe(3);
    expect(data.maxAttackRange).toBe(5);
    expect(data.canCapture).toBe(false);
    expect(makeUnit('antiAirRocketArtillery').isIndirect).toBe(true);
  });

  it('工場・本拠地で生産でき、地上ユニットとして輸送艦に積める', () => {
    expect(isProducibleAt('factory', 'antiAirRocketArtillery')).toBe(true);
    expect(isProducibleAt('headquarters', 'antiAirRocketArtillery')).toBe(true);
    expect(isProducibleAt('airport', 'antiAirRocketArtillery')).toBe(false);
    expect(isProducibleAt('port', 'antiAirRocketArtillery')).toBe(false);
    expect(GROUND_UNIT_TYPES).toContain('antiAirRocketArtillery');
    expect(canCarry(makeUnit('transportShip'), makeUnit('antiAirRocketArtillery'))).toBe(
      true,
    );
  });

  it('装輪車両なので、道路・拠点は1・平地は2・海岸は4で、森・山・海は進入不可', () => {
    expect(getUnitData('antiAirRocketArtillery').movementType).toBe('wheeled');
    expect(moveCost('road', 'wheeled')).toBe(1);
    expect(moveCost('city', 'wheeled')).toBe(1);
    expect(moveCost('factory', 'wheeled')).toBe(1);
    expect(moveCost('airport', 'wheeled')).toBe(1);
    expect(moveCost('port', 'wheeled')).toBe(1);
    expect(moveCost('headquarters', 'wheeled')).toBe(1);
    expect(moveCost('plain', 'wheeled')).toBe(2);
    expect(moveCost('beach', 'wheeled')).toBe(4);
    expect(moveCost('forest', 'wheeled')).toBeNull();
    expect(moveCost('mountain', 'wheeled')).toBeNull();
    expect(moveCost('sea', 'wheeled')).toBeNull();
  });

  it('森へは進入できず、道路は移動力4ぶん進める', () => {
    const def: MapDefinition = { name: 'aa-rocket-move', terrain: ['rrrrfrr'] };
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements(
      [{ col: 0, row: 0, unitType: 'antiAirRocketArtillery', army: 'player' }],
      map,
    );
    const antiAir = units.getUnitAt(gridPosition(0, 0))!;
    const range = calculateMovementRange(antiAir, map, units);

    expect(range.canReach(gridPosition(4, 0))).toBe(false); // 森は進入不可
    expect(range.canReach(gridPosition(3, 0))).toBe(true);
  });
});

describe('対空 2 種の攻撃対象', () => {
  it('飛行ユニット以外にはまったく攻撃できない', () => {
    for (const antiAir of ['antiAirArtillery', 'antiAirRocketArtillery'] as const) {
      for (const ground of GROUND_UNIT_TYPES) {
        expect(getBaseDamage(antiAir, ground)).toBe(0);
        expect(canAttackUnit(makeUnit(antiAir), makeUnit(ground, 'enemy'))).toBe(false);
      }
      for (const naval of NAVAL_UNIT_TYPES) {
        expect(getBaseDamage(antiAir, naval)).toBe(0);
        expect(canAttackUnit(makeUnit(antiAir), makeUnit(naval, 'enemy'))).toBe(false);
      }
      // 飛行ユニットはすべて攻撃できる
      for (const air of AIR_UNIT_TYPES) {
        expect(getBaseDamage(antiAir, air)).toBeGreaterThan(0);
        expect(canAttackUnit(makeUnit(antiAir), makeUnit(air, 'enemy'))).toBe(true);
      }
    }
  });

  it('対空自走砲は飛行ユニット全てに 6〜7 割', () => {
    for (const air of AIR_UNIT_TYPES) {
      expect(getBaseDamage('antiAirArtillery', air)).toBeGreaterThanOrEqual(60);
      expect(getBaseDamage('antiAirArtillery', air)).toBeLessThanOrEqual(70);
    }
  });

  it('対空ロケット砲は戦闘機に 7〜8 割、他の飛行ユニットには 8〜9 割', () => {
    expect(getBaseDamage('antiAirRocketArtillery', 'fighter')).toBeGreaterThanOrEqual(70);
    expect(getBaseDamage('antiAirRocketArtillery', 'fighter')).toBeLessThanOrEqual(80);
    for (const air of AIR_UNIT_TYPES) {
      if (air === 'fighter') {
        continue;
      }
      expect(getBaseDamage('antiAirRocketArtillery', air)).toBeGreaterThanOrEqual(80);
      expect(getBaseDamage('antiAirRocketArtillery', air)).toBeLessThanOrEqual(90);
    }
  });

  it('対空ロケット砲は射程 3〜5 の飛行ユニットだけを攻撃対象にする', () => {
    // 横一列の道路。対空ロケット砲を左端に置き、距離 1〜5 に敵を並べる
    const def: MapDefinition = { name: 'aa-rocket-range', terrain: ['rrrrrr'] };
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements(
      [
        { col: 0, row: 0, unitType: 'antiAirRocketArtillery', army: 'player' },
        { col: 1, row: 0, unitType: 'attackHelicopter', army: 'enemy' }, // 近すぎる
        { col: 3, row: 0, unitType: 'bomber', army: 'enemy' }, // 射程内
        { col: 4, row: 0, unitType: 'mediumTank', army: 'enemy' }, // 地上なので撃てない
        { col: 5, row: 0, unitType: 'fighter', army: 'enemy' }, // 射程内
      ],
      map,
    );
    const antiAir = units.getUnitAt(gridPosition(0, 0))!;

    expect(findAttackableTargets(antiAir, units).map((t) => t.unitType)).toEqual([
      'bomber',
      'fighter',
    ]);
  });

  it('間接攻撃なので反撃を受けない', () => {
    const def: MapDefinition = { name: 'aa-counter', terrain: ['...'] };
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements(
      [
        { col: 0, row: 0, unitType: 'antiAirArtillery', army: 'player' },
        { col: 2, row: 0, unitType: 'attackHelicopter', army: 'enemy' },
      ],
      map,
    );
    const antiAir = units.getUnitAt(gridPosition(0, 0))!;
    const heli = units.getUnitAt(gridPosition(2, 0))!;

    const result = new BattleManager(map, units).attack(antiAir, heli);
    expect(result.damageDealt).toBeGreaterThan(0);
    expect(result.counterDamage).toBe(0);
  });
});

describe('対空 2 種の防御力', () => {
  it('対空自走砲は自走砲と同じ防御力(被ダメージ)を持つ', () => {
    for (const attacker of UNIT_TYPES) {
      expect(getBaseDamage(attacker, 'antiAirArtillery')).toBe(
        getBaseDamage(attacker, 'artillery'),
      );
    }
  });

  it('対空ロケット砲はロケット砲と同じ防御力(被ダメージ)を持つ', () => {
    for (const attacker of UNIT_TYPES) {
      expect(getBaseDamage(attacker, 'antiAirRocketArtillery')).toBe(
        getBaseDamage(attacker, 'rocketArtillery'),
      );
    }
  });
});

describe('対空ユニットの一覧', () => {
  it('固定翼機を攻撃できる地上ユニットは対空 3 種だけ', () => {
    expect(ANTI_AIR_UNIT_TYPES).toEqual([
      'antiAirTank',
      'antiAirArtillery',
      'antiAirRocketArtillery',
    ]);
    for (const ground of GROUND_UNIT_TYPES) {
      const canHitAircraft = getBaseDamage(ground, 'fighter') > 0;
      expect(canHitAircraft).toBe(ANTI_AIR_UNIT_TYPES.includes(ground));
    }
  });
});

describe('空港のないマップでの対空ユニットの生産制限', () => {
  // 空港のない自軍工場だけのマップ(0,0 が工場)
  const NO_AIRPORT_MAP: MapDefinition = {
    name: '空港なしマップ',
    terrain: ['F..', '...', '...'],
    owners: [{ col: 0, row: 0, owner: 'player' }],
  };

  // 同じ配置に中立空港(2,0)を足したマップ
  const AIRPORT_MAP: MapDefinition = {
    name: '空港ありマップ',
    terrain: ['F.A', '...', '...'],
    owners: [{ col: 0, row: 0, owner: 'player' }],
  };

  function setup(def: MapDefinition, placements: UnitPlacement[] = []) {
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements(placements, map);
    const economy = new EconomyManager({ initialFunds: 30000 });
    const production = new ProductionManager(map, units, economy);
    return { map, production };
  }

  it('MapManager は空港マスの有無を hasAirport で持つ', () => {
    expect(MapManager.fromDefinition(NO_AIRPORT_MAP).hasAirport).toBe(false);
    expect(MapManager.fromDefinition(AIRPORT_MAP).hasAirport).toBe(true);
  });

  it('空港がなければ対空自走砲・対空ロケット砲は生産できない', () => {
    const { map, production } = setup(NO_AIRPORT_MAP);
    const factory = map.getTile(gridPosition(0, 0))!;
    expect(production.canProduce('player', factory, 'antiAirArtillery')).toBe(false);
    expect(production.canProduce('player', factory, 'antiAirRocketArtillery')).toBe(
      false,
    );
    expect(() => production.produce('player', factory, 'antiAirArtillery')).toThrow();
  });

  it('空港がなくても対空戦車と通常の地上ユニットは生産できる', () => {
    const { map, production } = setup(NO_AIRPORT_MAP);
    const factory = map.getTile(gridPosition(0, 0))!;
    // 対空戦車は地上ユニットも攻撃できるため制限しない
    expect(production.canProduce('player', factory, 'antiAirTank')).toBe(true);
    expect(production.canProduce('player', factory, 'infantry')).toBe(true);
    expect(production.canProduce('player', factory, 'mediumTank')).toBe(true);
  });

  it('空港があれば対空自走砲・対空ロケット砲を生産できる', () => {
    const { map, production } = setup(AIRPORT_MAP);
    const factory = map.getTile(gridPosition(0, 0))!;
    expect(production.canProduce('player', factory, 'antiAirArtillery')).toBe(true);
    expect(production.canProduce('player', factory, 'antiAirRocketArtillery')).toBe(true);
  });

  it('空港がなくても飛行ユニットが盤面にいれば対空 2 種を生産できる', () => {
    const { map, production } = setup(NO_AIRPORT_MAP, [
      { unitType: 'fighter', army: 'enemy', col: 2, row: 2 },
    ]);
    const factory = map.getTile(gridPosition(0, 0))!;
    expect(production.canProduce('player', factory, 'antiAirArtillery')).toBe(true);
  });

  it('空港のないマップでは生産メニューにも対空 2 種が並ばない', () => {
    const { production } = setup(NO_AIRPORT_MAP);
    const items = listProductionItems('factory', production.mapContext()).map(
      (item) => item.unitType,
    );
    expect(items).not.toContain('antiAirArtillery');
    expect(items).not.toContain('antiAirRocketArtillery');
    expect(items).toContain('antiAirTank');
  });

  it('生産できる種別の一覧は hasAirport: false で対空 2 種を除く', () => {
    expect(producibleUnitTypesAt('factory', { hasAirport: false })).not.toContain(
      'antiAirArtillery',
    );
    expect(
      isProducibleAt('headquarters', 'antiAirRocketArtillery', { hasAirport: false }),
    ).toBe(false);
    // 指定しなければ従来どおり制限なし
    expect(isProducibleAt('factory', 'antiAirArtillery')).toBe(true);
  });
});
