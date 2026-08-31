import { describe, expect, it } from 'vitest';
import {
  CREDIT_LINES,
  ENDING_SLIDES,
  type CreditStyle,
  type EndingCutKind,
} from '@/data/endingData';

/** エンディングで扱うカット種別の一覧(データと描画のずれを検知するため列挙する) */
const CUT_KINDS: readonly EndingCutKind[] = ['bridge', 'liberation', 'commanders'];

/** スタッフロールの行の見せ方の一覧 */
const CREDIT_STYLES: readonly CreditStyle[] = ['title', 'heading', 'role', 'note'];

describe('ENDING_SLIDES(エピローグのページ)', () => {
  it('ページが複数枚登録されている', () => {
    expect(ENDING_SLIDES.length).toBeGreaterThan(1);
  });

  it('id は重複していない', () => {
    const ids = ENDING_SLIDES.map((slide) => slide.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('各ページに見出しと本文がある', () => {
    for (const slide of ENDING_SLIDES) {
      expect(slide.title.length).toBeGreaterThan(0);
      expect(slide.body.length).toBeGreaterThan(0);
      for (const line of slide.body) {
        expect(line.length).toBeGreaterThan(0);
      }
    }
  });

  it('cut は既知のカット種別のいずれかである', () => {
    for (const slide of ENDING_SLIDES) {
      expect(CUT_KINDS).toContain(slide.cut);
    }
  });
});

describe('CREDIT_LINES(スタッフロール)', () => {
  it('行が登録されていて、見せ方は既知のいずれかである', () => {
    expect(CREDIT_LINES.length).toBeGreaterThan(0);
    for (const line of CREDIT_LINES) {
      expect(line.text.length).toBeGreaterThan(0);
      expect(CREDIT_STYLES).toContain(line.style);
    }
  });
});
