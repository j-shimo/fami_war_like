import { describe, expect, it } from 'vitest';
import { clampScrollOffset, maxScrollOffset, scrollbarMetrics } from '@/ui/listScroll';

describe('maxScrollOffset(スクロールできる量)', () => {
  it('内容が表示領域に収まっていれば 0', () => {
    expect(maxScrollOffset(300, 372)).toBe(0);
    expect(maxScrollOffset(372, 372)).toBe(0);
  });

  it('はみ出したぶんだけスクロールできる', () => {
    expect(maxScrollOffset(500, 372)).toBe(128);
  });
});

describe('clampScrollOffset(スクロール量の丸め)', () => {
  it('先頭より上(正の値)へは動かさない', () => {
    expect(clampScrollOffset(50, 500, 372)).toBe(0);
    expect(clampScrollOffset(0, 500, 372)).toBe(0);
  });

  it('末尾より下へは動かさない', () => {
    expect(clampScrollOffset(-200, 500, 372)).toBe(-128);
  });

  it('範囲内の値はそのまま返す', () => {
    expect(clampScrollOffset(-60, 500, 372)).toBe(-60);
  });

  it('スクロール不要なときは常に 0', () => {
    expect(clampScrollOffset(-40, 300, 372)).toBe(0);
  });
});

describe('scrollbarMetrics(スクロールバーのつまみ)', () => {
  it('スクロール不要なら null(バーを描かない)', () => {
    expect(scrollbarMetrics(0, 300, 372)).toBeNull();
  });

  it('見えている割合の長さのつまみを、先頭では上端に置く', () => {
    const metrics = scrollbarMetrics(0, 800, 400);
    expect(metrics).not.toBeNull();
    // 表示できているのは半分なので、つまみの長さも表示領域の半分
    expect(metrics?.thumbHeight).toBe(200);
    expect(metrics?.thumbTop).toBe(0);
  });

  it('末尾までスクロールするとつまみは下端に着く', () => {
    const metrics = scrollbarMetrics(-400, 800, 400);
    expect(metrics?.thumbTop).toBe(200);
    expect((metrics?.thumbTop ?? 0) + (metrics?.thumbHeight ?? 0)).toBe(400);
  });

  it('中間ではつまみも中間に来る', () => {
    expect(scrollbarMetrics(-200, 800, 400)?.thumbTop).toBe(100);
  });

  it('範囲外のスクロール量を渡しても、つまみは端を超えない', () => {
    const metrics = scrollbarMetrics(-9999, 800, 400);
    expect(metrics?.thumbTop).toBe(200);
  });

  it('内容が極端に長くても、つまみは最小の長さを保つ', () => {
    const metrics = scrollbarMetrics(0, 100000, 400);
    expect(metrics?.thumbHeight).toBe(24);
  });
});
