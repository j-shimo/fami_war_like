import { describe, expect, it } from 'vitest';
import {
  equals,
  gridPosition,
  isInBounds,
  manhattanDistance,
} from '@/core/map/GridPosition';

describe('GridPosition', () => {
  it('指定した列・行で座標を生成できる', () => {
    const pos = gridPosition(3, 5);
    expect(pos.col).toBe(3);
    expect(pos.row).toBe(5);
  });

  it('同じマスを指す座標は等しいと判定される', () => {
    expect(equals(gridPosition(1, 2), gridPosition(1, 2))).toBe(true);
    expect(equals(gridPosition(1, 2), gridPosition(2, 1))).toBe(false);
  });

  it('マンハッタン距離を正しく計算する', () => {
    expect(manhattanDistance(gridPosition(0, 0), gridPosition(0, 0))).toBe(0);
    expect(manhattanDistance(gridPosition(0, 0), gridPosition(3, 4))).toBe(7);
    expect(manhattanDistance(gridPosition(2, 5), gridPosition(4, 1))).toBe(6);
  });

  it('マップ範囲の内外を判定する', () => {
    expect(isInBounds(gridPosition(0, 0), 10, 10)).toBe(true);
    expect(isInBounds(gridPosition(9, 9), 10, 10)).toBe(true);
    expect(isInBounds(gridPosition(-1, 0), 10, 10)).toBe(false);
    expect(isInBounds(gridPosition(10, 0), 10, 10)).toBe(false);
    expect(isInBounds(gridPosition(0, 10), 10, 10)).toBe(false);
  });
});
