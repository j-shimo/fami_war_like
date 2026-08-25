import { describe, expect, it } from 'vitest';
import { gridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import { distancesFrom, distancesTo } from '@/core/movement/PathDistance';

/**
 * 縦の山('m')が col 1 の row 0〜2 を塞ぐ 3x4 のマップ。
 * (0,0) から (2,0) へ行くには、山の下(row 3)を回り込むしかない。
 */
const DETOUR_MAP = {
  name: 'detour',
  terrain: ['.m.', '.m.', '.m.', '...'],
};

describe('distancesFrom', () => {
  it('平地では移動コストの合計がそのまま距離になる', () => {
    const map = MapManager.fromDefinition({ name: 't', terrain: ['....'] });
    const field = distancesFrom(map, gridPosition(0, 0), 'infantry');
    expect(field.get(gridPosition(0, 0))).toBe(0);
    expect(field.get(gridPosition(3, 0))).toBe(3);
  });

  it('障害物があるときは迂回した経路の長さを返す(直線距離ではない)', () => {
    const map = MapManager.fromDefinition(DETOUR_MAP);
    const field = distancesFrom(map, gridPosition(0, 0), 'vehicle');
    // 直線距離は 2 マスだが、山を回り込むため実際には 8 マスぶん進む必要がある
    expect(field.get(gridPosition(2, 0))).toBe(8);
  });

  it('地形ごとの移動コストを積み上げる(歩兵は山をコスト 2 で越えられる)', () => {
    const map = MapManager.fromDefinition(DETOUR_MAP);
    const field = distancesFrom(map, gridPosition(0, 0), 'infantry');
    // 歩兵は山(コスト 2)を越えて (1,0) → (2,0) と直進できる
    expect(field.get(gridPosition(1, 0))).toBe(2);
    expect(field.get(gridPosition(2, 0))).toBe(3);
  });

  it('進入できないマスは結果に含まれない', () => {
    const map = MapManager.fromDefinition(DETOUR_MAP);
    const field = distancesFrom(map, gridPosition(0, 0), 'vehicle');
    expect(field.get(gridPosition(1, 0))).toBeUndefined();
  });

  it('経路がまったく無い場合は空になる(陸のマップの海上ユニットなど)', () => {
    const map = MapManager.fromDefinition({ name: 't', terrain: ['...'] });
    const field = distancesFrom(map, gridPosition(0, 0), 'sea');
    expect(field.get(gridPosition(2, 0))).toBeUndefined();
  });
});

describe('distancesTo', () => {
  it('各マスから目標へ向かうときの経路の長さを返す', () => {
    const map = MapManager.fromDefinition(DETOUR_MAP);
    const field = distancesTo(map, gridPosition(2, 0), 'vehicle');
    expect(field.get(gridPosition(2, 0))).toBe(0);
    // 山を回り込むルート上では、目標に近いマスほど距離が小さくなる
    expect(field.get(gridPosition(2, 3))).toBe(3);
    expect(field.get(gridPosition(1, 3))).toBe(4);
    expect(field.get(gridPosition(0, 3))).toBe(5);
    expect(field.get(gridPosition(0, 0))).toBe(8);
  });

  it('目標が進入不可地形でも、隣接マスがいちばん近いものとして扱える', () => {
    // 中央が山。車両は山へ入れないが、その周囲の距離は求められる
    const map = MapManager.fromDefinition({ name: 't', terrain: ['.m.'] });
    const field = distancesTo(map, gridPosition(1, 0), 'vehicle');
    expect(field.get(gridPosition(0, 0))).toBe(1);
    expect(field.get(gridPosition(2, 0))).toBe(1);
  });
});
