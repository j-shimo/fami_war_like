import { describe, expect, it } from 'vitest';
import { gridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import { UnitManager, type UnitPlacement } from '@/core/units/UnitManager';
import { TEST_MAP } from '@/data/maps/testMap';

const PLACEMENTS: readonly UnitPlacement[] = [
  { col: 1, row: 1, unitType: 'infantry', army: 'player' },
  { col: 2, row: 1, unitType: 'mediumTank', army: 'enemy' },
];

describe('UnitManager', () => {
  it('初期配置からユニットを生成する', () => {
    const manager = UnitManager.fromPlacements(PLACEMENTS);
    expect(manager.getAllUnits()).toHaveLength(2);
  });

  it('初期配置の cargo は、輸送ユニットに搭乗済みの状態で生成される', () => {
    const manager = UnitManager.fromPlacements([
      {
        col: 1,
        row: 1,
        unitType: 'transportShip',
        army: 'enemy',
        cargo: ['mediumTank', 'antiAirTank'],
      },
    ]);
    // 盤面に出ているのは輸送艦だけで、積荷は輸送艦の中にいる
    expect(manager.getAllUnits()).toHaveLength(1);
    const transport = manager.getUnitAt(gridPosition(1, 1));
    expect(transport?.unitType).toBe('transportShip');
    expect(transport?.carried.map((unit) => unit.unitType)).toEqual([
      'mediumTank',
      'antiAirTank',
    ]);
    expect(transport?.freeCapacity).toBe(0);
    for (const passenger of transport?.carried ?? []) {
      expect(passenger.armyType).toBe('enemy');
      expect(manager.getUnitById(passenger.id)).toBeUndefined();
    }
  });

  it('積めない種別・定員超過の cargo はデータ不整合として例外を投げる', () => {
    // 輸送ヘリが運べるのは歩兵だけ
    expect(() =>
      UnitManager.fromPlacements([
        {
          col: 1,
          row: 1,
          unitType: 'transportHelicopter',
          army: 'player',
          cargo: ['mediumTank'],
        },
      ]),
    ).toThrow();
    // 輸送ヘリの定員は 1 体
    expect(() =>
      UnitManager.fromPlacements([
        {
          col: 1,
          row: 1,
          unitType: 'transportHelicopter',
          army: 'player',
          cargo: ['infantry', 'infantry'],
        },
      ]),
    ).toThrow();
    // 輸送能力を持たないユニットには積めない
    expect(() =>
      UnitManager.fromPlacements([
        { col: 1, row: 1, unitType: 'mediumTank', army: 'player', cargo: ['infantry'] },
      ]),
    ).toThrow();
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
      { col: 3, row: 3, unitType: 'mediumTank', army: 'player' },
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
      { col: 4, row: 3, unitType: 'mediumTank', army: 'player' },
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

  it('markActed を false にすると移動後も未行動のまま', () => {
    const manager = UnitManager.fromPlacements(PLACEMENTS);
    const unit = manager.getUnitAt(gridPosition(1, 1))!;
    manager.moveUnit(unit, gridPosition(1, 2), { markActed: false });
    expect(unit.position).toEqual(gridPosition(1, 2));
    expect(unit.hasActed).toBe(false);
    // 既定では行動済みになる
    manager.moveUnit(unit, gridPosition(1, 3));
    expect(unit.hasActed).toBe(true);
  });

  it('spawnUnit は新規ユニットを配置し既定で行動済みにする', () => {
    const manager = UnitManager.fromPlacements(PLACEMENTS);
    const spawned = manager.spawnUnit({
      unitType: 'mediumTank',
      army: 'player',
      position: gridPosition(4, 4),
    });
    expect(spawned.hasActed).toBe(true);
    expect(manager.getUnitAt(gridPosition(4, 4))).toBe(spawned);
    expect(manager.getUnitsByArmy('player')).toHaveLength(2);
  });

  it('spawnUnit はユニットのいるマスには生成できない', () => {
    const manager = UnitManager.fromPlacements(PLACEMENTS);
    expect(() =>
      manager.spawnUnit({
        unitType: 'mediumTank',
        army: 'player',
        position: gridPosition(1, 1),
      }),
    ).toThrow();
  });

  it('spawnUnit は一意な ID を振る', () => {
    const manager = UnitManager.fromPlacements([]);
    const a = manager.spawnUnit({
      unitType: 'infantry',
      army: 'player',
      position: gridPosition(0, 0),
    });
    const b = manager.spawnUnit({
      unitType: 'infantry',
      army: 'player',
      position: gridPosition(1, 0),
    });
    expect(a.id).not.toBe(b.id);
  });

  it('mergeUnit は HP を合算して 1 体にまとめ、合流先を待機にする', () => {
    const manager = UnitManager.fromPlacements([
      { col: 0, row: 0, unitType: 'infantry', army: 'player' },
      { col: 1, row: 0, unitType: 'infantry', army: 'player' },
    ]);
    const source = manager.getUnitAt(gridPosition(0, 0))!;
    const target = manager.getUnitAt(gridPosition(1, 0))!;
    source.currentHp = 4;
    target.currentHp = 5;

    manager.mergeUnit(source, target);

    // 合流元は盤面から取り除かれ、合流先だけが残る
    expect(manager.getUnitAt(gridPosition(0, 0))).toBeUndefined();
    expect(manager.getAllUnits()).toHaveLength(1);
    // 合流先は HP を合算し、行動済み(待機)になる
    expect(target.currentHp).toBe(9);
    expect(target.hasActed).toBe(true);
  });

  it('mergeUnit は最大 HP を超えないよう頭打ちにする', () => {
    const manager = UnitManager.fromPlacements([
      { col: 0, row: 0, unitType: 'infantry', army: 'player' },
      { col: 1, row: 0, unitType: 'infantry', army: 'player' },
    ]);
    const source = manager.getUnitAt(gridPosition(0, 0))!;
    const target = manager.getUnitAt(gridPosition(1, 0))!;
    source.currentHp = 7;
    target.currentHp = 6;

    manager.mergeUnit(source, target);

    expect(target.currentHp).toBe(10);
  });

  it('mergeUnit は合流できない組み合わせで例外を投げる', () => {
    const manager = UnitManager.fromPlacements([
      { col: 0, row: 0, unitType: 'infantry', army: 'player' },
      { col: 1, row: 0, unitType: 'mediumTank', army: 'player' },
    ]);
    const source = manager.getUnitAt(gridPosition(0, 0))!;
    const target = manager.getUnitAt(gridPosition(1, 0))!;
    source.currentHp = 4;
    target.currentHp = 5;

    // 種別が異なるため合流できない
    expect(() => manager.mergeUnit(source, target)).toThrow();
  });
});
