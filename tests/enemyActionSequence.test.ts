import { describe, expect, it } from 'vitest';
import type { AiAction } from '@/core/ai/EnemyAi';
import { gridPosition, type GridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import type { Unit } from '@/core/units/Unit';
import { UnitManager } from '@/core/units/UnitManager';
import type { MapDefinition } from '@/data/maps/mapDefinition';
import {
  buildEnemyActionView,
  enemyActionPath,
  enemyActionUnit,
  type EnemySight,
} from '@/rendering/enemyActionSequence';

/** 4 マス平地の一本道に、敵戦車と自軍歩兵を置いたテスト用の盤面 */
const DEF: MapDefinition = {
  name: 't',
  terrain: ['..c.'],
  units: [
    { col: 0, row: 0, unitType: 'mediumTank', army: 'enemy' },
    { col: 3, row: 0, unitType: 'infantry', army: 'player' },
  ],
};

function setup(): { map: MapManager; enemy: Unit; player: Unit } {
  const map = MapManager.fromDefinition(DEF);
  const units = UnitManager.fromPlacements(DEF.units ?? [], map);
  return {
    map,
    enemy: units.getUnitAt(gridPosition(0, 0))!,
    player: units.getUnitAt(gridPosition(3, 0))!,
  };
}

/** 指定した列だけが明るい視界(夜戦の暗い範囲を再現する) */
function sightOf(litCols: readonly number[]): EnemySight {
  return { isLit: (pos: GridPosition) => litCols.includes(pos.col) };
}

/** すべてが明るい視界(昼戦) */
const DAYLIGHT: EnemySight = { isLit: () => true };

const path = (...cols: number[]): GridPosition[] =>
  cols.map((col) => gridPosition(col, 0));

describe('enemyActionUnit / enemyActionPath', () => {
  it('移動・攻撃・占領は行動したユニットと経路を取り出せる', () => {
    const { enemy } = setup();
    const move: AiAction = {
      kind: 'move',
      unit: enemy,
      from: gridPosition(0, 0),
      to: gridPosition(2, 0),
      path: path(0, 1, 2),
    };
    expect(enemyActionUnit(move)).toBe(enemy);
    expect(enemyActionPath(move)).toHaveLength(3);
  });

  it('生産・待機はユニットを動かさないため経路を持たない', () => {
    const { enemy } = setup();
    const wait: AiAction = { kind: 'wait', unit: enemy };
    expect(enemyActionUnit(wait)).toBeNull();
    expect(enemyActionPath(wait)).toEqual([]);
  });
});

describe('buildEnemyActionView', () => {
  it('待機は盤面が変わらないため演出しない', () => {
    const { enemy } = setup();
    const view = buildEnemyActionView({ kind: 'wait', unit: enemy }, DAYLIGHT);
    expect(view.shown).toBe(false);
    expect(view.focus).toBeNull();
  });

  it('昼戦の移動は経路の全マスで姿を見せ、開始マスへカメラを寄せる', () => {
    const { enemy } = setup();
    const view = buildEnemyActionView(
      {
        kind: 'move',
        unit: enemy,
        from: gridPosition(0, 0),
        to: gridPosition(2, 0),
        path: path(0, 1, 2),
      },
      DAYLIGHT,
    );
    expect(view.shown).toBe(true);
    expect(view.focus).toEqual(gridPosition(0, 0));
    expect(view.pathVisibility).toEqual([true, true, true]);
  });

  it('経路がすべて暗い移動は写さない', () => {
    const { enemy } = setup();
    const view = buildEnemyActionView(
      {
        kind: 'move',
        unit: enemy,
        from: gridPosition(0, 0),
        to: gridPosition(1, 0),
        path: path(0, 1),
      },
      sightOf([3]),
    );
    expect(view.shown).toBe(false);
    expect(view.focus).toBeNull();
  });

  it('暗い所から明るい所へ出てくる移動は、明るくなるマスから姿を見せる', () => {
    const { enemy } = setup();
    const view = buildEnemyActionView(
      {
        kind: 'move',
        unit: enemy,
        from: gridPosition(0, 0),
        to: gridPosition(2, 0),
        path: path(0, 1, 2),
      },
      sightOf([2, 3]),
    );
    expect(view.shown).toBe(true);
    // 明るくなる最初のマス(col 2)へカメラを寄せる
    expect(view.focus).toEqual(gridPosition(2, 0));
    expect(view.pathVisibility).toEqual([false, false, true]);
  });

  it('暗いマスからの攻撃でも、撃たれた自軍ユニットのマスが明るければ着弾を見せる', () => {
    const { enemy, player } = setup();
    const view = buildEnemyActionView(
      {
        kind: 'attack',
        movedTo: null,
        path: path(0),
        result: {
          attacker: enemy,
          defender: player,
          damageDealt: 4,
          counterDamage: 0,
          defenderDefeated: false,
          attackerDefeated: false,
          lostPassengers: [],
        },
      },
      sightOf([3]),
    );
    expect(view.shown).toBe(true);
    // 攻撃元は暗いままなので、防御側のマスへカメラを寄せる
    expect(view.focus).toEqual(gridPosition(3, 0));
    expect(view.pathVisibility).toEqual([false]);
  });

  it('占領は占領するマスが明るければ見せる', () => {
    const { map, enemy } = setup();
    const tile = map.getTile(gridPosition(2, 0))!;
    const capture: AiAction = {
      kind: 'capture',
      movedTo: gridPosition(2, 0),
      path: path(0, 1, 2),
      result: {
        tile,
        unit: enemy,
        reduced: 10,
        remainingHp: 10,
        captured: false,
        reset: false,
      },
    };
    expect(buildEnemyActionView(capture, sightOf([2])).shown).toBe(true);
    expect(buildEnemyActionView(capture, sightOf([])).shown).toBe(false);
  });

  it('生産は拠点のマスが明るいときだけ見せる', () => {
    const { enemy } = setup();
    const produce: AiAction = {
      kind: 'produce',
      result: { unit: enemy, cost: 1000 },
    };
    const shown = buildEnemyActionView(produce, sightOf([0]));
    expect(shown.shown).toBe(true);
    expect(shown.focus).toEqual(gridPosition(0, 0));
    expect(shown.path).toEqual([]);
    expect(buildEnemyActionView(produce, sightOf([3])).shown).toBe(false);
  });
});
