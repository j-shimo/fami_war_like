import { describe, expect, it } from 'vitest';
import { GUIDE_SLIDES, type GuideCaptureKind } from '@/data/guideData';

/** 説明で扱うキャプチャ種別の一覧(データと描画のずれを検知するため列挙する) */
const CAPTURE_KINDS: readonly GuideCaptureKind[] = [
  'objective',
  'income',
  'move',
  'attack',
  'capture',
  'endTurn',
];

describe('GUIDE_SLIDES(ゲーム説明のスライド)', () => {
  it('スライドが複数枚登録されている', () => {
    expect(GUIDE_SLIDES.length).toBeGreaterThan(1);
  });

  it('id は重複していない', () => {
    const ids = GUIDE_SLIDES.map((slide) => slide.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('各スライドにタイトルと本文がある', () => {
    for (const slide of GUIDE_SLIDES) {
      expect(slide.title.length).toBeGreaterThan(0);
      expect(slide.body.length).toBeGreaterThan(0);
      for (const line of slide.body) {
        expect(line.length).toBeGreaterThan(0);
      }
    }
  });

  it('capture は既知のキャプチャ種別のいずれかである', () => {
    for (const slide of GUIDE_SLIDES) {
      expect(CAPTURE_KINDS).toContain(slide.capture);
    }
  });
});
