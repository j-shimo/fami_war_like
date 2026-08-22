import { describe, expect, it } from 'vitest';
import { RepairManager } from '@/core/economy/RepairManager';
import { EconomyManager } from '@/core/economy/EconomyManager';
import { gridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import {
  calculateMovementRange,
  findTransportTargets,
  findUnloadPositions,
} from '@/core/movement/MovementRange';
import { UnitManager } from '@/core/units/UnitManager';
import type { MapDefinition } from '@/data/maps/mapDefinition';
import { SYMBOL_TO_TERRAIN } from '@/data/maps/mapDefinition';
import { getTerrainData } from '@/data/terrainData';

describe('海岸(beach)の地形パラメータ', () => {
  it('マップ記号 b は海岸に対応する', () => {
    expect(SYMBOL_TO_TERRAIN.b).toBe('beach');
    const map = MapManager.fromDefinition({ name: 'beach', terrain: ['b'] });
    expect(map.getTile(gridPosition(0, 0))?.terrainType).toBe('beach');
  });

  it('地上ユニット(歩兵・車両)は砂に足を取られて移動コスト 2 で進入できる', () => {
    const data = getTerrainData('beach');
    expect(data.moveCost.infantry).toBe(2);
    expect(data.moveCost.vehicle).toBe(2);
  });

  it('海上ユニットは移動コスト 1 で進入でき、飛行ユニットも通れる', () => {
    const data = getTerrainData('beach');
    expect(data.moveCost.sea).toBe(1);
    expect(data.moveCost.air).toBe(1);
  });

  it('遮蔽の乏しい砂浜なので防御値は 0', () => {
    expect(getTerrainData('beach').defense).toBe(0);
  });

  it('占領・生産・修理はできない自然地形である', () => {
    const data = getTerrainData('beach');
    expect(data.canCapture).toBe(false);
    expect(data.canProduce).toBe(false);
    expect(data.canRepair).toBe(false);
  });

  it('占領できない地形なので、マップ定義で所有者を指定するとエラーになる', () => {
    expect(() =>
      MapManager.fromDefinition({
        name: 'beach',
        terrain: ['b'],
        owners: [{ col: 0, row: 0, owner: 'player' }],
      }),
    ).toThrow();
  });
});

describe('海岸の移動', () => {
  // 横一列: 平地・海岸・海・海・海
  const def: MapDefinition = { name: 'beach', terrain: ['.b~~~'] };

  it('歩兵は海岸へ入れるが、コスト 2 ぶん移動力を余分に使う', () => {
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements(
      [{ col: 0, row: 0, unitType: 'infantry', army: 'player' }],
      map,
    );
    const infantry = units.getUnitAt(gridPosition(0, 0));
    if (!infantry) throw new Error('歩兵が配置されていない');

    const range = calculateMovementRange(infantry, map, units);
    expect(range.canReach(gridPosition(1, 0))).toBe(true);
    // 移動力 3 のうち 2 を海岸で使う。その先は海なので進めない
    expect(range.canReach(gridPosition(2, 0))).toBe(false);
    expect(range.getCost(gridPosition(1, 0))).toBe(2);
  });

  it('車両(戦車)も海岸へ入れるが、コスト 2 ぶん移動力を余分に使う', () => {
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements(
      [{ col: 0, row: 0, unitType: 'tank', army: 'player' }],
      map,
    );
    const tank = units.getUnitAt(gridPosition(0, 0));
    if (!tank) throw new Error('戦車が配置されていない');

    const range = calculateMovementRange(tank, map, units);
    expect(range.canReach(gridPosition(1, 0))).toBe(true);
    expect(range.getCost(gridPosition(1, 0))).toBe(2);
    // 海岸の先は海なので、移動力が残っていても進めない
    expect(range.canReach(gridPosition(2, 0))).toBe(false);
  });

  it('海上ユニットは海から海岸へ乗り上げられるが、その先の陸へは進めない', () => {
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements(
      [{ col: 4, row: 0, unitType: 'transportShip', army: 'player' }],
      map,
    );
    const ship = units.getUnitAt(gridPosition(4, 0));
    if (!ship) throw new Error('輸送艦が配置されていない');

    const range = calculateMovementRange(ship, map, units);
    expect(range.canReach(gridPosition(1, 0))).toBe(true);
    // 海岸の先の平地には入れない
    expect(range.canReach(gridPosition(0, 0))).toBe(false);
  });
});

describe('海岸での乗船・上陸', () => {
  /** 平地・海岸・海 の一列に、海岸の輸送艦と平地の歩兵・戦車を置く */
  function setup() {
    const map = MapManager.fromDefinition({ name: 'beach', terrain: ['.b~~~'] });
    const units = UnitManager.fromPlacements(
      [
        { col: 1, row: 0, unitType: 'transportShip', army: 'player' },
        { col: 0, row: 0, unitType: 'infantry', army: 'player' },
      ],
      map,
    );
    const transport = units.getUnitAt(gridPosition(1, 0));
    const infantry = units.getUnitAt(gridPosition(0, 0));
    if (!transport || !infantry) throw new Error('ユニットが配置されていない');
    return { map, units, transport, infantry };
  }

  it('歩兵は海岸に着けた輸送艦へ、港が無くても乗り込める', () => {
    const { map, units, transport, infantry } = setup();
    expect(findTransportTargets(infantry, map, units)).toContain(transport);
  });

  it('輸送艦は海岸へ歩兵を降ろせる(海には降ろせない)', () => {
    const { map, units, transport, infantry } = setup();
    // いったん乗せてから、海岸に着けた輸送艦の隣接マスへの降車先を調べる
    units.carryUnit(transport, infantry);
    const positions = findUnloadPositions(transport, map, units, infantry);
    // 隣の平地へは降ろせる
    expect(positions).toContainEqual(gridPosition(0, 0));
    // 海には降ろせない(歩兵は海へ進入できない)
    expect(positions).not.toContainEqual(gridPosition(2, 0));
  });

  it('海岸に乗り上げた輸送艦は、海岸に立つ歩兵を回収できる(島から船へ戻れる)', () => {
    // 島(海岸1マス+都市1マス)を海で囲み、海岸に輸送艦・都市に歩兵を置く
    const map = MapManager.fromDefinition({
      name: 'island',
      terrain: ['~~~~', '~bc~', '~~~~'],
    });
    const units = UnitManager.fromPlacements(
      [
        { col: 1, row: 1, unitType: 'transportShip', army: 'player' },
        { col: 2, row: 1, unitType: 'infantry', army: 'player' },
      ],
      map,
    );
    const transport = units.getUnitAt(gridPosition(1, 1));
    const infantry = units.getUnitAt(gridPosition(2, 1));
    if (!transport || !infantry) throw new Error('ユニットが配置されていない');

    // 海岸が無ければ島の歩兵は海上の輸送艦へ乗り込めず島に取り残される。
    // 海岸へ乗り上げた輸送艦へは歩いて乗り込める。
    expect(findTransportTargets(infantry, map, units)).toContain(transport);
  });

  it('車両も海岸に着けた輸送艦へ乗り込める', () => {
    const map = MapManager.fromDefinition({ name: 'beach', terrain: ['.b~~~'] });
    const units = UnitManager.fromPlacements(
      [
        { col: 1, row: 0, unitType: 'transportShip', army: 'player' },
        { col: 0, row: 0, unitType: 'tank', army: 'player' },
      ],
      map,
    );
    const transport = units.getUnitAt(gridPosition(1, 0));
    const tank = units.getUnitAt(gridPosition(0, 0));
    if (!transport || !tank) throw new Error('ユニットが配置されていない');

    // 海岸は車両も進入できる地形なので、港が無くても戦車を積み込める
    expect(findTransportTargets(tank, map, units)).toContain(transport);
  });

  it('輸送艦は海岸へ車両を降ろせる(港が無くても揚陸できる)', () => {
    const map = MapManager.fromDefinition({
      name: 'island',
      terrain: ['~~~~', '~b.~', '~~~~'],
    });
    const units = UnitManager.fromPlacements(
      [
        { col: 1, row: 1, unitType: 'transportShip', army: 'player' },
        { col: 2, row: 1, unitType: 'tank', army: 'player' },
      ],
      map,
    );
    const transport = units.getUnitAt(gridPosition(1, 1));
    const tank = units.getUnitAt(gridPosition(2, 1));
    if (!transport || !tank) throw new Error('ユニットが配置されていない');

    // 海岸に乗り上げた輸送艦は、海岸に立つ戦車を回収できる
    expect(findTransportTargets(tank, map, units)).toContain(transport);
    units.carryUnit(transport, tank);
    // 降ろせるのは陸のマスだけ。海には降ろせない
    const positions = findUnloadPositions(transport, map, units, tank);
    expect(positions).toContainEqual(gridPosition(2, 1));
    expect(positions).not.toContainEqual(gridPosition(1, 0));
  });
});

describe('海岸の修理', () => {
  it('海岸に停泊した艦艇はターン開始時に修理されない(修理は港だけ)', () => {
    const map = MapManager.fromDefinition({ name: 'beach', terrain: ['.b~~~'] });
    const units = UnitManager.fromPlacements(
      [{ col: 1, row: 0, unitType: 'transportShip', army: 'player' }],
      map,
    );
    const ship = units.getUnitAt(gridPosition(1, 0));
    if (!ship) throw new Error('輸送艦が配置されていない');
    ship.currentHp = 5;

    const economy = new EconomyManager({ initialFunds: 100000 });
    const repair = new RepairManager(map, units, economy);
    expect(repair.repairAll('player')).toHaveLength(0);
    expect(ship.currentHp).toBe(5);
  });
});
