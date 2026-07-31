import { describe, expect, it } from 'vitest';
import { gridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import { UnitManager, type UnitPlacement } from '@/core/units/UnitManager';
import { TEST_MAP } from '@/data/maps/testMap';

const PLACEMENTS: readonly UnitPlacement[] = [
  { col: 1, row: 1, unitType: 'infantry', army: 'player' },
  { col: 2, row: 1, unitType: 'tank', army: 'enemy' },
];

describe('UnitManager', () => {
  it('初期配置からユニットを生成する', () => {
    const manager = UnitManager.fromPlacements(PLACEMENTS);
    expect(manager.getAllUnits()).toHaveLength(2);
  });

  it('座標からユニットを取得できる', () => {
    const manager = UnitManager.fromPlacements(PLACEMENTS);
    const unit = manager.getUnitAt(gridPosition(1, 1));
    expect(unit?.unitType).toBe('infantry');
    expect(unit?.armyType).toBe('player');
    expect(manager.getUnitAt(gridPosition(9, 9))).toBeUndefined();
  });

  it('軍勢ごとにユニットを取得できる', () => {
    const manager = UnitManager.fromPlacements(PLACEMENTS);
    expect(manager.getUnitsByArmy('player')).toHaveLength(1);
    expect(manager.getUnitsByArmy('enemy')).toHaveLength(1);
  });

  it('同一マスへの重複配置は例外を投げる', () => {
    const dup: UnitPlacement[] = [
      { col: 3, row: 3, unitType: 'infantry', army: 'player' },
      { col: 3, row: 3, unitType: 'tank', army: 'player' },
    ];
    expect(() => UnitManager.fromPlacements(dup)).toThrow();
  });

  it('マップ範囲外への配置は例外を投げる', () => {
    const map = MapManager.fromDefinition(TEST_MAP);
    const outside: UnitPlacement[] = [
      { col: 99, row: 0, unitType: 'infantry', army: 'player' },
    ];
    expect(() => UnitManager.fromPlacements(outside, map)).toThrow();
  });

  it('進入不可地形への配置は例外を投げる', () => {
    // TEST_MAP の (4,3) は山。車両(戦車)は進入不可
    const onMountain: UnitPlacement[] = [
      { col: 4, row: 3, unitType: 'tank', army: 'player' },
    ];
    const map = MapManager.fromDefinition(TEST_MAP);
    expect(() => UnitManager.fromPlacements(onMountain, map)).toThrow();
  });

  it('歩兵は山にも配置できる', () => {
    const onMountain: UnitPlacement[] = [
      { col: 4, row: 3, unitType: 'infantry', army: 'player' },
    ];
    const map = MapManager.fromDefinition(TEST_MAP);
    expect(() => UnitManager.fromPlacements(onMountain, map)).not.toThrow();
  });

  it('撃破したユニットは取得対象から外れる', () => {
    const manager = UnitManager.fromPlacements(PLACEMENTS);
    const unit = manager.getUnitAt(gridPosition(1, 1))!;
    manager.removeUnit(unit);
    expect(manager.getUnitAt(gridPosition(1, 1))).toBeUndefined();
    expect(manager.getAllUnits()).toHaveLength(1);
  });

  it('ID からユニットを取得できる', () => {
    const manager = UnitManager.fromPlacements(PLACEMENTS);
    const unit = manager.getUnitAt(gridPosition(1, 1))!;
    expect(manager.getUnitById(unit.id)).toBe(unit);
    expect(manager.getUnitById('存在しないID')).toBeUndefined();
  });

  it('TEST_MAP の初期配置はマップ上に矛盾なく展開できる', () => {
    const map = MapManager.fromDefinition(TEST_MAP);
    const manager = UnitManager.fromPlacements(TEST_MAP.units ?? [], map);
    expect(manager.getAllUnits()).toHaveLength(6);
    expect(manager.getUnitsByArmy('player')).toHaveLength(3);
    expect(manager.getUnitsByArmy('enemy')).toHaveLength(3);
  });
});
