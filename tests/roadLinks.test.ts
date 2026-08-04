import { describe, expect, it } from 'vitest';
import { gridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import type { MapDefinition } from '@/data/maps/mapDefinition';
import { computeRoadLinks } from '@/rendering/roadLinks';

// 道路(r)・拠点(H 本拠地)・地形の連結を確かめるための小さなマップ。
//   row0: . r .
//   row1: r r H
//   row2: . f .
// 中央 (1,1) の道路が、上下左右のうち道路・拠点へつながる方向を検証する。
const ROAD_MAP: MapDefinition = {
  name: '道路テストマップ',
  terrain: ['.r.', 'rrH', '.f.'],
};

function linksAt(def: MapDefinition, col: number, row: number) {
  const map = MapManager.fromDefinition(def);
  return computeRoadLinks(map, gridPosition(col, row));
}

describe('computeRoadLinks', () => {
  it('道路・拠点のある方向へつながり、平地や森へはつながらない', () => {
    // 中央 (1,1): 上=道路 / 左=道路 / 右=本拠地(拠点) → true、下=森 → false
    expect(linksAt(ROAD_MAP, 1, 1)).toEqual({
      up: true,
      down: false,
      left: true,
      right: true,
    });
  });

  it('マップ外に面した方向はつながらない', () => {
    // 上端の道路 (1,0): 上はマップ外 → false、下は中央の道路 → true
    const links = linksAt(ROAD_MAP, 1, 0);
    expect(links.up).toBe(false);
    expect(links.down).toBe(true);
    expect(links.left).toBe(false);
    expect(links.right).toBe(false);
  });

  it('孤立した道路はどの方向にもつながらない', () => {
    const isolated: MapDefinition = {
      name: '孤立道路',
      terrain: ['...', '.r.', '...'],
    };
    expect(linksAt(isolated, 1, 1)).toEqual({
      up: false,
      down: false,
      left: false,
      right: false,
    });
  });
});
