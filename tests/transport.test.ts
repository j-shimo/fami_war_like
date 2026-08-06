import { describe, expect, it } from 'vitest';
import { gridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import { findTransportTargets, findUnloadPositions } from '@/core/movement/MovementRange';
import { Unit } from '@/core/units/Unit';
import { canCarry } from '@/core/units/transport';
import { UnitManager } from '@/core/units/UnitManager';
import type { MapDefinition } from '@/data/maps/mapDefinition';

/** 全面平地の 5x5 マップ */
const PLAIN_MAP: MapDefinition = {
  name: 'plain',
  terrain: ['.....', '.....', '.....', '.....', '.....'],
};

describe('canCarry(輸送の可否判定)', () => {
  it('輸送ヘリは味方の歩兵を搭乗させられる', () => {
    const transport = new Unit({
      id: 'th',
      unitType: 'transportHelicopter',
      armyType: 'player',
      position: gridPosition(0, 0),
    });
    const infantry = new Unit({
      id: 'inf',
      unitType: 'infantry',
      armyType: 'player',
      position: gridPosition(1, 0),
    });
    expect(canCarry(transport, infantry)).toBe(true);
  });

  it('敵の歩兵は搭乗できない', () => {
    const transport = new Unit({
      id: 'th',
      unitType: 'transportHelicopter',
      armyType: 'player',
      position: gridPosition(0, 0),
    });
    const enemyInfantry = new Unit({
      id: 'inf',
      unitType: 'infantry',
      armyType: 'enemy',
      position: gridPosition(1, 0),
    });
    expect(canCarry(transport, enemyInfantry)).toBe(false);
  });

  it('歩兵以外(戦車)は輸送ヘリに搭乗できない', () => {
    const transport = new Unit({
      id: 'th',
      unitType: 'transportHelicopter',
      armyType: 'player',
      position: gridPosition(0, 0),
    });
    const tank = new Unit({
      id: 'tk',
      unitType: 'tank',
      armyType: 'player',
      position: gridPosition(1, 0),
    });
    expect(canCarry(transport, tank)).toBe(false);
  });

  it('輸送能力のないユニット(戦闘ヘリ)は搭乗先にならない', () => {
    const attackHeli = new Unit({
      id: 'ah',
      unitType: 'attackHelicopter',
      armyType: 'player',
      position: gridPosition(0, 0),
    });
    const infantry = new Unit({
      id: 'inf',
      unitType: 'infantry',
      armyType: 'player',
      position: gridPosition(1, 0),
    });
    expect(canCarry(attackHeli, infantry)).toBe(false);
  });

  it('すでに搭乗中の輸送ヘリには追加で搭乗できない', () => {
    const transport = new Unit({
      id: 'th',
      unitType: 'transportHelicopter',
      armyType: 'player',
      position: gridPosition(0, 0),
    });
    const first = new Unit({
      id: 'inf1',
      unitType: 'infantry',
      armyType: 'player',
      position: gridPosition(1, 0),
    });
    const second = new Unit({
      id: 'inf2',
      unitType: 'infantry',
      armyType: 'player',
      position: gridPosition(0, 1),
    });
    transport.carried = first;
    expect(canCarry(transport, second)).toBe(false);
  });
});

describe('UnitManager の搭乗・降車', () => {
  it('carryUnit で歩兵を盤面から取り除いて輸送ヘリに保持する', () => {
    const units = UnitManager.fromPlacements([
      { col: 0, row: 0, unitType: 'transportHelicopter', army: 'player' },
      { col: 1, row: 0, unitType: 'infantry', army: 'player' },
    ]);
    const transport = units.getUnitAt(gridPosition(0, 0))!;
    const infantry = units.getUnitAt(gridPosition(1, 0))!;

    units.carryUnit(transport, infantry);

    // 歩兵は盤面から消え、輸送ヘリが保持する
    expect(units.getUnitAt(gridPosition(1, 0))).toBeUndefined();
    expect(transport.carried).toBe(infantry);
    expect(infantry.hasActed).toBe(true);
    expect(units.getAllUnits()).toHaveLength(1);
  });

  it('dropUnit で搭乗ユニットを指定マスへ降ろす', () => {
    const units = UnitManager.fromPlacements([
      { col: 0, row: 0, unitType: 'transportHelicopter', army: 'player' },
      { col: 1, row: 0, unitType: 'infantry', army: 'player' },
    ]);
    const transport = units.getUnitAt(gridPosition(0, 0))!;
    const infantry = units.getUnitAt(gridPosition(1, 0))!;
    units.carryUnit(transport, infantry);

    const dropped = units.dropUnit(transport, gridPosition(0, 1));

    expect(dropped).toBe(infantry);
    expect(units.getUnitAt(gridPosition(0, 1))).toBe(infantry);
    expect(transport.carried).toBeNull();
    // 降車したユニットと輸送ヘリはどちらも行動済みになる
    expect(infantry.hasActed).toBe(true);
    expect(transport.hasActed).toBe(true);
    expect(units.getAllUnits()).toHaveLength(2);
  });

  it('ユニットのいるマスには降ろせない', () => {
    const units = UnitManager.fromPlacements([
      { col: 0, row: 0, unitType: 'transportHelicopter', army: 'player' },
      { col: 1, row: 0, unitType: 'infantry', army: 'player' },
      { col: 0, row: 1, unitType: 'tank', army: 'player' },
    ]);
    const transport = units.getUnitAt(gridPosition(0, 0))!;
    const infantry = units.getUnitAt(gridPosition(1, 0))!;
    units.carryUnit(transport, infantry);

    expect(() => units.dropUnit(transport, gridPosition(0, 1))).toThrow();
  });
});

describe('findTransportTargets(搭乗先の探索)', () => {
  it('移動範囲内の味方輸送ヘリを搭乗先として返す', () => {
    const map = MapManager.fromDefinition(PLAIN_MAP);
    const units = UnitManager.fromPlacements([
      { col: 0, row: 0, unitType: 'infantry', army: 'player' },
      { col: 2, row: 0, unitType: 'transportHelicopter', army: 'player' },
    ]);
    const infantry = units.getUnitAt(gridPosition(0, 0))!;

    const targets = findTransportTargets(infantry, map, units);
    expect(targets).toHaveLength(1);
    expect(targets[0].unitType).toBe('transportHelicopter');
  });

  it('移動範囲外の輸送ヘリは搭乗先にならない', () => {
    const map = MapManager.fromDefinition(PLAIN_MAP);
    const units = UnitManager.fromPlacements([
      // 歩兵(移動力3)から遠い位置に輸送ヘリを置く
      { col: 0, row: 0, unitType: 'infantry', army: 'player' },
      { col: 4, row: 4, unitType: 'transportHelicopter', army: 'player' },
    ]);
    const infantry = units.getUnitAt(gridPosition(0, 0))!;

    expect(findTransportTargets(infantry, map, units)).toHaveLength(0);
  });
});

describe('findUnloadPositions(降車先の探索)', () => {
  it('搭乗ユニットが進入できる隣接の空きマスを返す', () => {
    const map = MapManager.fromDefinition(PLAIN_MAP);
    const units = UnitManager.fromPlacements([
      { col: 2, row: 2, unitType: 'transportHelicopter', army: 'player' },
      { col: 1, row: 0, unitType: 'infantry', army: 'player' },
    ]);
    const transport = units.getUnitAt(gridPosition(2, 2))!;
    const infantry = units.getUnitAt(gridPosition(1, 0))!;
    units.carryUnit(transport, infantry);

    const positions = findUnloadPositions(transport, map, units);
    // 上下左右の 4 マスすべて平地で空き
    expect(positions).toHaveLength(4);
  });

  it('何も運んでいない輸送ヘリは降車先を返さない', () => {
    const map = MapManager.fromDefinition(PLAIN_MAP);
    const units = UnitManager.fromPlacements([
      { col: 2, row: 2, unitType: 'transportHelicopter', army: 'player' },
    ]);
    const transport = units.getUnitAt(gridPosition(2, 2))!;
    expect(findUnloadPositions(transport, map, units)).toHaveLength(0);
  });

  it('進入不可地形(海)や他ユニットのいるマスは降車先から除く', () => {
    // 中央に輸送ヘリ。左は海、右は他ユニット、上下は平地。
    const def: MapDefinition = {
      name: 'mixed',
      terrain: ['...', '~..', '...'],
    };
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements([
      { col: 1, row: 1, unitType: 'transportHelicopter', army: 'player' },
      { col: 1, row: 0, unitType: 'infantry', army: 'player' },
      // 右(2,1)には他ユニットを置いて降車先から外れることを確認する
      { col: 2, row: 1, unitType: 'tank', army: 'player' },
    ]);
    const transport = units.getUnitAt(gridPosition(1, 1))!;
    const infantry = units.getUnitAt(gridPosition(1, 0))!;
    units.carryUnit(transport, infantry);

    const positions = findUnloadPositions(transport, map, units);
    // 左(0,1)は海で歩兵進入不可、右(2,1)は戦車がいる。上(1,0)下(1,2)の 2 マスのみ。
    expect(positions).toHaveLength(2);
  });
});
