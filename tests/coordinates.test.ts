import { describe, expect, it } from 'vitest';
import { gridPosition } from '@/core/map/GridPosition';
import { gridToWorld, gridToWorldCenter, worldToGrid } from '@/core/map/coordinates';

const TILE = 48;

describe('coordinates', () => {
  it('グリッド座標をマス左上のピクセル座標へ変換する', () => {
    expect(gridToWorld(gridPosition(0, 0), TILE)).toEqual({ x: 0, y: 0 });
    expect(gridToWorld(gridPosition(2, 3), TILE)).toEqual({ x: 96, y: 144 });
  });

  it('グリッド座標をマス中心のピクセル座標へ変換する', () => {
    expect(gridToWorldCenter(gridPosition(0, 0), TILE)).toEqual({
      x: 24,
      y: 24,
    });
    expect(gridToWorldCenter(gridPosition(1, 2), TILE)).toEqual({
      x: 72,
      y: 120,
    });
  });

  it('ピクセル座標をグリッド座標へ変換する', () => {
    expect(worldToGrid(0, 0, TILE)).toEqual(gridPosition(0, 0));
    expect(worldToGrid(47, 47, TILE)).toEqual(gridPosition(0, 0));
    expect(worldToGrid(48, 96, TILE)).toEqual(gridPosition(1, 2));
  });

  it('変換の往復で元のマスに戻る', () => {
    const pos = gridPosition(4, 7);
    const center = gridToWorldCenter(pos, TILE);
    expect(worldToGrid(center.x, center.y, TILE)).toEqual(pos);
  });
});
