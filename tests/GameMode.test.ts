import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAME_MODE,
  firstArmy,
  gameModeSummary,
  isMapGroup,
  isPlayerSide,
  isVersusMode,
  mapGroupLabel,
  sideLabel,
  swapsSides,
  versusLabel,
} from '@/core/mode/GameMode';

describe('GameMode(モード選択の内容)', () => {
  it('既定は 1P側・対 CPU', () => {
    expect(DEFAULT_GAME_MODE).toEqual({ side: '1p', versus: 'cpu' });
  });

  it('2P側だけが盤面の自軍・敵軍を入れ替える', () => {
    expect(swapsSides('1p')).toBe(false);
    expect(swapsSides('2p')).toBe(true);
  });

  it('2P側は後手番になる(敵軍が先手)', () => {
    expect(firstArmy('1p')).toBe('player');
    expect(firstArmy('2p')).toBe('enemy');
  });

  it('妥当な値だけを受け付ける(保存データの検証に使う)', () => {
    expect(isPlayerSide('1p')).toBe(true);
    expect(isPlayerSide('2p')).toBe(true);
    expect(isPlayerSide('3p')).toBe(false);
    expect(isPlayerSide(undefined)).toBe(false);

    expect(isVersusMode('cpu')).toBe(true);
    expect(isVersusMode('human')).toBe(true);
    expect(isVersusMode('ai')).toBe(false);

    expect(isMapGroup('standard')).toBe(true);
    expect(isMapGroup('new')).toBe(true);
    expect(isMapGroup('four')).toBe(true);
    expect(isMapGroup('extra')).toBe(false);
  });

  it('表示名を返す', () => {
    expect(sideLabel('1p')).toBe('1P側');
    expect(sideLabel('2p')).toBe('2P側');
    expect(versusLabel('cpu')).toBe('プレイヤー vs CPU');
    expect(versusLabel('human')).toBe('プレイヤー vs プレイヤー');
    expect(mapGroupLabel('standard')).toBe('通常マップ');
    expect(mapGroupLabel('new')).toBe('新マップ');
    expect(mapGroupLabel('four')).toBe('4Pマップ');
    expect(gameModeSummary({ side: '2p', versus: 'human' })).toBe(
      '2P側 / プレイヤー vs プレイヤー',
    );
  });
});
