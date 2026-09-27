import { describe, expect, it } from 'vitest';
import { EconomyManager } from '@/core/economy/EconomyManager';
import { MapManager } from '@/core/map/MapManager';
import { createSaveData, type SaveData } from '@/core/save/SaveData';
import { TurnManager } from '@/core/turn/TurnManager';
import { UnitManager } from '@/core/units/UnitManager';
import { MAP_LIST } from '@/data/maps';
import { TEST_MAP } from '@/data/maps/testMap';
import {
  findResumeTarget,
  formatSuspendedAt,
  resumeDetailLine,
  resumeMapLine,
} from '@/ui/suspendInfo';

/** テストマップで中断した状態の中断データを作る */
function makeSave(overrides: Partial<SaveData> = {}): SaveData {
  const map = MapManager.fromDefinition(TEST_MAP);
  const units = UnitManager.fromPlacements(TEST_MAP.units ?? [], map);
  const turn = new TurnManager(units);
  const economy = new EconomyManager({ initialFunds: 10000 });
  const save = createSaveData({
    mapId: 'test',
    nightBattle: false,
    aiCharacterId: 'instructor',
    playerCharacterId: 'instructor',
    playerSide: '1p',
    versusMode: 'cpu',
    map,
    units,
    turn,
    economy,
  });
  return { ...save, ...overrides };
}

describe('findResumeTarget(「中断から再開」で再開するマップ)', () => {
  it('中断データを遊んでいたマップを一覧から見つける', () => {
    const save = makeSave();
    const target = findResumeTarget(save, MAP_LIST);
    expect(target?.entry.id).toBe('test');
    expect(target?.save).toBe(save);
  });

  it('中断データが無ければ null', () => {
    expect(findResumeTarget(null, MAP_LIST)).toBeNull();
  });

  it('一覧に無いマップの中断データは再開できない', () => {
    expect(findResumeTarget(makeSave({ mapId: 'removed-map' }), MAP_LIST)).toBeNull();
  });

  it('マップのサイズが変わっていたら再開できない', () => {
    expect(findResumeTarget(makeSave({ cols: 3 }), MAP_LIST)).toBeNull();
  });
});

describe('「中断から再開」の表示文言', () => {
  it('中断日時を「月/日 時:分」で表示する(分は 2 桁)', () => {
    expect(formatSuspendedAt(new Date(2026, 8, 26, 21, 4).getTime())).toBe('9/26 21:04');
    expect(formatSuspendedAt(new Date(2026, 0, 3, 7, 30).getTime())).toBe('1/3 7:30');
  });

  it('マップ名を出し、夜戦なら「(夜戦)」を添える', () => {
    const entry = MAP_LIST.find((candidate) => candidate.id === 'test')!;
    expect(resumeMapLine({ save: makeSave(), entry })).toBe('テストマップ');
    expect(resumeMapLine({ save: makeSave({ nightBattle: true }), entry })).toBe(
      'テストマップ(夜戦)',
    );
  });

  it('ターン数と中断日時を出す', () => {
    const save = makeSave({
      turnNumber: 5,
      savedAt: new Date(2026, 8, 26, 21, 14).getTime(),
    });
    expect(resumeDetailLine(save)).toBe('第5ターン・9/26 21:14 中断');
  });
});
