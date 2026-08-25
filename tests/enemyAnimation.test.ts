import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENEMY_ANIMATION_MODE,
  ENEMY_ANIMATION_MODES,
  enemyAnimationModeLabel,
  getEnemyAnimationMode,
  isEnemyAnimationMode,
} from '@/data/enemyAnimation';

describe('敵の行動アニメの設定値', () => {
  it('「しっかり」「簡単」「超速」の3種類をこの順で持つ', () => {
    expect(ENEMY_ANIMATION_MODES.map((mode) => mode.id)).toEqual([
      'full',
      'simple',
      'instant',
    ]);
    expect(ENEMY_ANIMATION_MODES.map((mode) => mode.label)).toEqual([
      'しっかり',
      '簡単',
      '超速',
    ]);
  });

  it('「しっかり」は戦闘アニメーションができるまで選べない', () => {
    expect(getEnemyAnimationMode('full').selectable).toBe(false);
    expect(getEnemyAnimationMode('simple').selectable).toBe(true);
    expect(getEnemyAnimationMode('instant').selectable).toBe(true);
  });

  it('既定の種別は選べるものになっている', () => {
    expect(getEnemyAnimationMode(DEFAULT_ENEMY_ANIMATION_MODE).selectable).toBe(true);
  });

  it('未知の識別子・未指定は既定の種別へフォールバックする', () => {
    expect(getEnemyAnimationMode(undefined).id).toBe(DEFAULT_ENEMY_ANIMATION_MODE);
    expect(getEnemyAnimationMode(null).id).toBe(DEFAULT_ENEMY_ANIMATION_MODE);
    expect(getEnemyAnimationMode('unknown').id).toBe(DEFAULT_ENEMY_ANIMATION_MODE);
  });

  it('識別子かどうかを判定できる', () => {
    expect(isEnemyAnimationMode('simple')).toBe(true);
    expect(isEnemyAnimationMode('instant')).toBe(true);
    expect(isEnemyAnimationMode('turbo')).toBe(false);
    expect(isEnemyAnimationMode(3)).toBe(false);
    expect(isEnemyAnimationMode(null)).toBe(false);
  });

  it('表示名を引ける', () => {
    expect(enemyAnimationModeLabel('instant')).toBe('超速');
    expect(enemyAnimationModeLabel('simple')).toBe('簡単');
  });

  it('すべての種別に説明が付いている', () => {
    for (const mode of ENEMY_ANIMATION_MODES) {
      expect(mode.description.length).toBeGreaterThan(0);
    }
  });
});
