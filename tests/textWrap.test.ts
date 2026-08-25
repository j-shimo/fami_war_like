import { describe, expect, it } from 'vitest';
import { wrapText } from '@/ui/textWrap';

describe('wrapText', () => {
  it('指定した文字数で折り返す', () => {
    expect(wrapText('あいうえおかきくけこ', 4)).toBe('あいうえ\nおかきく\nけこ');
  });

  it('最大文字数に満たない文章はそのまま返す', () => {
    expect(wrapText('あいう', 10)).toBe('あいう');
  });

  it('行頭に句読点・閉じ括弧が来る場合は前の行へぶら下げる', () => {
    // 4 文字で切ると 5 文字目が「、」になるため、その 1 文字だけ前の行に残す
    expect(wrapText('あいうえ、おかきく', 4)).toBe('あいうえ、\nおかきく');
  });

  it('すでに入っている改行は保ったまま行ごとに折り返す', () => {
    expect(wrapText('あいうえお\nかきくけこ', 3)).toBe('あいう\nえお\nかきく\nけこ');
  });

  it('最大文字数が 1 未満なら折り返さない(無限ループにしない)', () => {
    expect(wrapText('あいうえお', 0)).toBe('あいうえお');
  });
});
