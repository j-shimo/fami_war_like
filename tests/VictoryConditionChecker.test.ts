import { describe, expect, it } from 'vitest';
import { gridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import { UnitManager, type UnitPlacement } from '@/core/units/UnitManager';
import { VictoryConditionChecker } from '@/core/victory/VictoryConditionChecker';
import type { MapDefinition } from '@/data/maps/mapDefinition';

// 4x4 の小さなテストマップ。左上に敵本拠地、右下に自軍本拠地を配置する。
const MAP_DEF: MapDefinition = {
  name: '勝敗テストマップ',
  terrain: ['H...', '....', '....', '...H'],
  owners: [
    { col: 0, row: 0, owner: 'enemy' }, // 敵本拠地
    { col: 3, row: 3, owner: 'player' }, // 自軍本拠地
  ],
};

// 双方が生存ユニットを持つ標準的な初期配置
const PLACEMENTS: readonly UnitPlacement[] = [
  { col: 1, row: 2, unitType: 'infantry', army: 'player' },
  { col: 2, row: 1, unitType: 'tank', army: 'enemy' },
];

function makeMap(): MapManager {
  return MapManager.fromDefinition(MAP_DEF);
}

describe('VictoryConditionChecker', () => {
  it('両軍が本拠地とユニットを保持していれば未決着', () => {
    const map = makeMap();
    const units = UnitManager.fromPlacements(PLACEMENTS, map);
    const checker = new VictoryConditionChecker(map, units);

    expect(checker.check()).toEqual({ outcome: 'ongoing', reason: null });
  });

  it('敵本拠地を占領すると勝利', () => {
    const map = makeMap();
    const units = UnitManager.fromPlacements(PLACEMENTS, map);
    const checker = new VictoryConditionChecker(map, units);

    // 敵本拠地の所有者を自軍に変える(占領完了を再現)
    map.getTile(gridPosition(0, 0))!.owner = 'player';

    expect(checker.check()).toEqual({
      outcome: 'player_victory',
      reason: 'enemy_hq_captured',
    });
  });

  it('敵軍を全滅させると勝利', () => {
    const map = makeMap();
    const units = UnitManager.fromPlacements(PLACEMENTS, map);
    const checker = new VictoryConditionChecker(map, units);

    // 敵ユニットを撃破(HP0)して盤面から除く
    for (const enemy of units.getUnitsByArmy('enemy')) {
      units.removeUnit(enemy);
    }

    expect(checker.check()).toEqual({
      outcome: 'player_victory',
      reason: 'enemy_annihilated',
    });
  });

  it('自軍本拠地を占領されると敗北', () => {
    const map = makeMap();
    const units = UnitManager.fromPlacements(PLACEMENTS, map);
    const checker = new VictoryConditionChecker(map, units);

    map.getTile(gridPosition(3, 3))!.owner = 'enemy';

    expect(checker.check()).toEqual({
      outcome: 'player_defeat',
      reason: 'player_hq_captured',
    });
  });

  it('自軍が全滅すると敗北', () => {
    const map = makeMap();
    const units = UnitManager.fromPlacements(PLACEMENTS, map);
    const checker = new VictoryConditionChecker(map, units);

    for (const player of units.getUnitsByArmy('player')) {
      units.removeUnit(player);
    }

    expect(checker.check()).toEqual({
      outcome: 'player_defeat',
      reason: 'player_annihilated',
    });
  });

  it('勝利条件は敗北条件より優先して判定する', () => {
    const map = makeMap();
    // 自軍ユニットがいない状態でも、敵本拠地を占領していれば勝利を優先する
    const units = UnitManager.fromPlacements(
      [{ col: 2, row: 1, unitType: 'tank', army: 'enemy' }],
      map,
    );
    const checker = new VictoryConditionChecker(map, units);

    map.getTile(gridPosition(0, 0))!.owner = 'player';

    // 自軍全滅より敵本拠地占領を優先
    expect(checker.check()).toEqual({
      outcome: 'player_victory',
      reason: 'enemy_hq_captured',
    });
  });

  it('本拠地のないマップでは占領による勝敗判定を行わない', () => {
    const map = MapManager.fromDefinition({
      name: '本拠地なし',
      terrain: ['....', '....'],
    });
    const units = UnitManager.fromPlacements(
      [
        { col: 0, row: 0, unitType: 'infantry', army: 'player' },
        { col: 3, row: 1, unitType: 'tank', army: 'enemy' },
      ],
      map,
    );
    const checker = new VictoryConditionChecker(map, units);

    expect(checker.check()).toEqual({ outcome: 'ongoing', reason: null });
  });
});
