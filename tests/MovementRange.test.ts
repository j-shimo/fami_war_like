import { describe, expect, it } from 'vitest';
import { gridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import { calculateMovementRange } from '@/core/movement/MovementRange';
import { Unit } from '@/core/units/Unit';
import { UnitManager } from '@/core/units/UnitManager';
import type { MapDefinition } from '@/data/maps/mapDefinition';

/** テスト用に単一ユニットを配置した UnitManager を作る */
function makeUnits(
  placements: Parameters<typeof UnitManager.fromPlacements>[0],
): UnitManager {
  return UnitManager.fromPlacements(placements);
}

describe('calculateMovementRange', () => {
  it('平地のみのマップでは移動力ぶんのひし形範囲に到達できる', () => {
    // 5x5 全面平地。中央(2,2)の歩兵(移動力3)
    const def: MapDefinition = {
      name: 'plain',
      terrain: ['.....', '.....', '.....', '.....', '.....'],
    };
    const map = MapManager.fromDefinition(def);
    const units = makeUnits([{ col: 2, row: 2, unitType: 'infantry', army: 'player' }]);
    const unit = units.getUnitAt(gridPosition(2, 2))!;

    const range = calculateMovementRange(unit, map, units);

    // マンハッタン距離 <= 3 のマスがすべて到達可能(移動コストは各1のため)
    let expected = 0;
    for (let col = 0; col < 5; col++) {
      for (let row = 0; row < 5; row++) {
        if (Math.abs(col - 2) + Math.abs(row - 2) <= 3) {
          expected++;
          expect(range.canReach(gridPosition(col, row))).toBe(true);
        }
      }
    }
    expect(range.tiles.length).toBe(expected);
    // 開始マスは常に含まれ、コスト 0
    expect(range.getCost(gridPosition(2, 2))).toBe(0);
  });

  it('地形の移動コストを累積して到達範囲を狭める', () => {
    // 横一列: 平地・森・森・平地。歩兵は森コスト1なので端まで到達可能
    // 車両は森コスト2なので途中で止まる
    const def: MapDefinition = { name: 'forest-line', terrain: ['.ff..'] };
    const map = MapManager.fromDefinition(def);

    // 車両(戦車・移動力5)を (0,0) に置く。森コストは車両で 2
    const vehicles = makeUnits([{ col: 0, row: 0, unitType: 'tank', army: 'player' }]);
    const tank = vehicles.getUnitAt(gridPosition(0, 0))!;
    const tankRange = calculateMovementRange(tank, map, vehicles);
    // (0,0)=0, 森(1,0)=2, 森(2,0)=4, 平地(3,0)=5, 平地(4,0)=6>5 で不可
    expect(tankRange.getCost(gridPosition(1, 0))).toBe(2);
    expect(tankRange.getCost(gridPosition(2, 0))).toBe(4);
    expect(tankRange.canReach(gridPosition(4, 0))).toBe(false);

    // 歩兵(移動力3)を (0,0) に置く。森コストは歩兵で 1 のため同じ距離でも安く進める
    const infantry = makeUnits([
      { col: 0, row: 0, unitType: 'infantry', army: 'player' },
    ]);
    const inf = infantry.getUnitAt(gridPosition(0, 0))!;
    const infRange = calculateMovementRange(inf, map, infantry);
    // 森コスト1のため (3,0) まで累積3で到達可能
    expect(infRange.getCost(gridPosition(3, 0))).toBe(3);
  });

  it('進入不可地形(車両×山)には入れない', () => {
    // 中央に山。車両はまわり込む必要がある
    const def: MapDefinition = { name: 'mountain', terrain: ['...', '.m.', '...'] };
    const map = MapManager.fromDefinition(def);
    const units = makeUnits([{ col: 1, row: 0, unitType: 'tank', army: 'player' }]);
    const tank = units.getUnitAt(gridPosition(1, 0))!;

    const range = calculateMovementRange(tank, map, units);
    expect(range.canReach(gridPosition(1, 1))).toBe(false);
  });

  it('敵ユニットのいるマスは通過も停止もできない', () => {
    // 横一列。(1,0) に敵。自軍は敵を越えて右へ進めない
    const def: MapDefinition = { name: 'block', terrain: ['.....'] };
    const map = MapManager.fromDefinition(def);
    const units = makeUnits([
      { col: 0, row: 0, unitType: 'tank', army: 'player' },
      { col: 1, row: 0, unitType: 'infantry', army: 'enemy' },
    ]);
    const tank = units.getUnitAt(gridPosition(0, 0))!;

    const range = calculateMovementRange(tank, map, units);
    // 敵マスには停止できない
    expect(range.canReach(gridPosition(1, 0))).toBe(false);
    // 敵を通過できないため、その先にも到達できない
    expect(range.canReach(gridPosition(2, 0))).toBe(false);
  });

  it('味方ユニットのマスは通過できるが停止はできない', () => {
    const def: MapDefinition = { name: 'ally', terrain: ['.....'] };
    const map = MapManager.fromDefinition(def);
    const units = makeUnits([
      { col: 0, row: 0, unitType: 'tank', army: 'player' },
      { col: 1, row: 0, unitType: 'infantry', army: 'player' },
    ]);
    const tank = units.getUnitAt(gridPosition(0, 0))!;

    const range = calculateMovementRange(tank, map, units);
    // 味方マスには停止できない
    expect(range.canReach(gridPosition(1, 0))).toBe(false);
    // 味方マスは通過できるので、その先には到達できる
    expect(range.canReach(gridPosition(2, 0))).toBe(true);
  });

  it('開始マスはその場待機として常に移動先候補に含まれる', () => {
    const def: MapDefinition = { name: 'start', terrain: ['...'] };
    const map = MapManager.fromDefinition(def);
    const units = makeUnits([{ col: 1, row: 0, unitType: 'infantry', army: 'player' }]);
    const unit = units.getUnitAt(gridPosition(1, 0))!;

    const range = calculateMovementRange(unit, map, units);
    expect(range.canReach(gridPosition(1, 0))).toBe(true);
  });
});

describe('UnitManager.moveUnit', () => {
  it('ユニットを移動先へ動かし行動済みにする', () => {
    const units = makeUnits([{ col: 0, row: 0, unitType: 'infantry', army: 'player' }]);
    const unit = units.getUnitAt(gridPosition(0, 0))!;

    units.moveUnit(unit, gridPosition(2, 3));

    expect(unit.position).toEqual(gridPosition(2, 3));
    expect(unit.hasActed).toBe(true);
    expect(units.getUnitAt(gridPosition(2, 3))).toBe(unit);
    expect(units.getUnitAt(gridPosition(0, 0))).toBeUndefined();
  });

  it('同じマスへの移動(その場待機)を許可する', () => {
    const units = makeUnits([{ col: 1, row: 1, unitType: 'infantry', army: 'player' }]);
    const unit = units.getUnitAt(gridPosition(1, 1))!;

    units.moveUnit(unit, gridPosition(1, 1));

    expect(unit.position).toEqual(gridPosition(1, 1));
    expect(unit.hasActed).toBe(true);
  });

  it('他ユニットが占有するマスへは移動できない', () => {
    const units = makeUnits([
      { col: 0, row: 0, unitType: 'infantry', army: 'player' },
      { col: 1, row: 0, unitType: 'tank', army: 'player' },
    ]);
    const mover = units.getUnitAt(gridPosition(0, 0))!;

    expect(() => units.moveUnit(mover, gridPosition(1, 0))).toThrow();
    // 失敗時は位置も行動済みフラグも変わらない
    expect(mover.position).toEqual(gridPosition(0, 0));
    expect(mover.hasActed).toBe(false);
  });

  it('存在しないユニット参照でも Unit を直接生成して動かせる', () => {
    // Unit を単体生成しても UnitManager 経由で移動できることの確認
    const units = new UnitManager();
    const unit = new Unit({
      id: 'p1',
      unitType: 'infantry',
      armyType: 'player',
      position: gridPosition(0, 0),
    });
    // 管理対象に無いユニットは占有判定に出てこないため移動自体は成立する
    units.moveUnit(unit, gridPosition(1, 1));
    expect(unit.position).toEqual(gridPosition(1, 1));
    expect(unit.hasActed).toBe(true);
  });
});
