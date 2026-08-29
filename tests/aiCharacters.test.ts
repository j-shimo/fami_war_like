import { describe, expect, it } from 'vitest';
import { DEFAULT_AI_BEHAVIOR } from '@/core/ai/AiBehavior';
import {
  AI_CHARACTERS,
  DEFAULT_AI_CHARACTER,
  aiCharacterLabel,
  getAiCharacter,
} from '@/data/aiCharacters';

describe('AI_CHARACTERS(対戦キャラクター)', () => {
  it('3 人以上のキャラクターが登録されている(選択できる相手がある)', () => {
    expect(AI_CHARACTERS.length).toBeGreaterThanOrEqual(3);
  });

  it('識別子は一意で、名前・説明はすべて埋まっている', () => {
    const ids = AI_CHARACTERS.map((character) => character.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const character of AI_CHARACTERS) {
      expect(character.name.length).toBeGreaterThan(0);
      expect(character.title.length).toBeGreaterThan(0);
      expect(character.difficulty.length).toBeGreaterThan(0);
      expect(character.description.length).toBeGreaterThan(0);
    }
  });

  it('エンブレムの色は指揮官ごとに違う色が割り当てられている', () => {
    const colors = AI_CHARACTERS.map((character) => character.emblemColor);
    // 一覧から目当ての相手を見分けるための色なので、重複していると意味がない
    expect(new Set(colors).size).toBe(colors.length);
    for (const color of colors) {
      expect(Number.isInteger(color)).toBe(true);
      expect(color).toBeGreaterThanOrEqual(0x000000);
      expect(color).toBeLessThanOrEqual(0xffffff);
    }
  });

  it('既定のキャラクターは一覧の先頭で、従来どおりの思考パターンを持つ', () => {
    expect(DEFAULT_AI_CHARACTER).toBe(AI_CHARACTERS[0]);
    // 初級者〜中級者向けの相手として、敵AI導入当初の思考パターンをそのまま残す
    expect(DEFAULT_AI_CHARACTER.behavior).toEqual(DEFAULT_AI_BEHAVIOR);
  });

  it('中立都市の制圧と本拠地への突撃を狙う思考パターンのキャラクターがいる', () => {
    const charger = AI_CHARACTERS.find(
      (character) => character.behavior.advance === 'captureAndCharge',
    );
    expect(charger).toBeDefined();
    // まず歩兵をそろえ、通れるマスをたどって進む
    expect(charger?.behavior.production).toBe('infantryFirst');
    expect(charger?.behavior.infantryQuota).toBeGreaterThan(0);
    expect(charger?.behavior.routing).toBe('path');
    expect(charger?.behavior.preferNeutralCapture).toBe(true);
  });

  it('編成表をそろえてから戦力を積み上げる思考パターンのキャラクターがいる', () => {
    const hunter = AI_CHARACTERS.find(
      (character) => character.behavior.production === 'roster',
    );
    expect(hunter).toBeDefined();
    // 占領役と索敵役を最低限そろえてから、一段上のユニットを狙って資金を貯める
    expect(hunter?.behavior.roster.length).toBeGreaterThan(0);
    expect(hunter?.behavior.saveForUpgrade).toBe(true);
    // 間合い・隊列・夜戦の視界まで見て動く、いちばん手ごわい思考パターン
    expect(hunter?.behavior.indirectStandoff).toBe(true);
    expect(hunter?.behavior.regroupRadius).toBeGreaterThan(0);
    expect(hunter?.behavior.nightVisionFloor).toBeGreaterThan(0);
  });

  it('編成表の体数は 1 以上で、同じ種別が重複していない', () => {
    for (const character of AI_CHARACTERS) {
      const types = character.behavior.roster.map((entry) => entry.unitType);
      expect(new Set(types).size).toBe(types.length);
      for (const entry of character.behavior.roster) {
        expect(entry.count).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('編成表を使うのは production が roster のキャラクターだけ', () => {
    for (const character of AI_CHARACTERS) {
      if (character.behavior.production !== 'roster') {
        expect(character.behavior.roster).toEqual([]);
      }
    }
  });

  it('生産の見送り基準(powerCostRatio)は 0 以上 1 未満に収まっている', () => {
    for (const character of AI_CHARACTERS) {
      expect(character.behavior.powerCostRatio).toBeGreaterThanOrEqual(0);
      expect(character.behavior.powerCostRatio).toBeLessThan(1);
    }
  });
});

describe('getAiCharacter', () => {
  it('識別子からキャラクターを引ける', () => {
    for (const character of AI_CHARACTERS) {
      expect(getAiCharacter(character.id)).toBe(character);
    }
  });

  it('未知の識別子・未指定は既定のキャラクターにフォールバックする', () => {
    expect(getAiCharacter('unknown')).toBe(DEFAULT_AI_CHARACTER);
    expect(getAiCharacter(undefined)).toBe(DEFAULT_AI_CHARACTER);
  });
});

describe('aiCharacterLabel', () => {
  it('肩書と名前を並べた表示名を返す', () => {
    expect(aiCharacterLabel(AI_CHARACTERS[0])).toBe(
      `${AI_CHARACTERS[0].title} ${AI_CHARACTERS[0].name}`,
    );
  });
});
