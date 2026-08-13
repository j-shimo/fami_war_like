import { describe, expect, it } from 'vitest';
import { UNIT_TYPES } from '@/core/units/UnitType';
import { BASE_DAMAGE } from '@/data/damageTable';
import {
  NO_ATTACK_SYMBOL,
  UNIT_DESCRIPTIONS,
  compatibilityTier,
  formatCompatibility,
  getUnitDescription,
  getUnitMatchups,
} from '@/data/unitGuide';

describe('formatCompatibility', () => {
  it('0(攻撃できない)は記号「×」を返す', () => {
    expect(formatCompatibility(0)).toBe(NO_ATTACK_SYMBOL);
    expect(formatCompatibility(0)).toBe('×');
  });

  it('負の値も攻撃不可として「×」を返す', () => {
    expect(formatCompatibility(-10)).toBe('×');
  });

  it('1以上は数値をそのまま文字列で返す(100が最大)', () => {
    expect(formatCompatibility(1)).toBe('1');
    expect(formatCompatibility(55)).toBe('55');
    expect(formatCompatibility(100)).toBe('100');
  });
});

describe('compatibilityTier', () => {
  it('0以下は none(攻撃不可)', () => {
    expect(compatibilityTier(0)).toBe('none');
    expect(compatibilityTier(-5)).toBe('none');
  });

  it('1〜39は low', () => {
    expect(compatibilityTier(1)).toBe('low');
    expect(compatibilityTier(39)).toBe('low');
  });

  it('40〜69は mid', () => {
    expect(compatibilityTier(40)).toBe('mid');
    expect(compatibilityTier(69)).toBe('mid');
  });

  it('70以上は high', () => {
    expect(compatibilityTier(70)).toBe('high');
    expect(compatibilityTier(100)).toBe('high');
  });
});

describe('getUnitMatchups', () => {
  it('全ユニットとの相性を UNIT_TYPES と同じ並びで返す', () => {
    const matchups = getUnitMatchups('tank');
    expect(matchups.map((m) => m.opponent)).toEqual([...UNIT_TYPES]);
  });

  it('与ダメージ(dealt)は攻撃側=自分の基礎ダメージ、被ダメージ(taken)は攻撃側=相手の基礎ダメージ', () => {
    const matchups = getUnitMatchups('tank');
    const vsInfantry = matchups.find((m) => m.opponent === 'infantry')!;
    // 戦車 → 歩兵 の与ダメージ
    expect(vsInfantry.dealt).toBe(BASE_DAMAGE.tank.infantry);
    expect(vsInfantry.dealtSymbol).toBe(String(BASE_DAMAGE.tank.infantry));
    // 歩兵 → 戦車 の被ダメージ
    expect(vsInfantry.taken).toBe(BASE_DAMAGE.infantry.tank);
    expect(vsInfantry.takenSymbol).toBe(String(BASE_DAMAGE.infantry.tank));
  });

  it('輸送ヘリは攻撃できないため、全相手への与ダメージが「×」になる', () => {
    const matchups = getUnitMatchups('transportHelicopter');
    for (const m of matchups) {
      expect(m.dealt).toBe(0);
      expect(m.dealtSymbol).toBe('×');
      expect(m.dealtTier).toBe('none');
    }
  });

  it('相性の段階(tier)が数値と整合している', () => {
    const matchups = getUnitMatchups('antiAirTank');
    const vsHeli = matchups.find((m) => m.opponent === 'attackHelicopter')!;
    // 対空戦車 → 戦闘ヘリ は 85(high)
    expect(vsHeli.dealt).toBe(85);
    expect(vsHeli.dealtTier).toBe('high');
  });
});

describe('UNIT_DESCRIPTIONS', () => {
  it('すべてのユニット種別に空でない説明文が定義されている', () => {
    for (const unitType of UNIT_TYPES) {
      const lines = getUnitDescription(unitType);
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line.trim().length).toBeGreaterThan(0);
      }
    }
    // 定義漏れがないこと(キー数が種別数と一致)
    expect(Object.keys(UNIT_DESCRIPTIONS).sort()).toEqual([...UNIT_TYPES].sort());
  });
});
