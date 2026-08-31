import { describe, expect, it } from 'vitest';
import { MapManager } from '@/core/map/MapManager';
import { UnitManager } from '@/core/units/UnitManager';
import { DEFAULT_MAP_ENTRY, MAP_LIST, mapsInGroup, STANDARD_MAP_LIST } from '@/data/maps';

describe('MAP_LIST(マップ選択の一覧)', () => {
  it('少なくとも 1 枚のマップが登録されている', () => {
    expect(MAP_LIST.length).toBeGreaterThan(0);
  });

  it('id は重複していない', () => {
    const ids = MAP_LIST.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('すべてのマップが矛盾なく生成できる', () => {
    for (const entry of MAP_LIST) {
      const map = MapManager.fromDefinition(entry.definition);
      expect(map.cols).toBeGreaterThan(0);
      expect(map.rows).toBeGreaterThan(0);
      // ユニットの初期配置もマップ上に矛盾なく展開できること
      expect(() =>
        UnitManager.fromPlacements(entry.definition.units ?? [], map),
      ).not.toThrow();
    }
  });

  it('既定マップは一覧の先頭である', () => {
    expect(DEFAULT_MAP_ENTRY).toBe(MAP_LIST[0]);
  });

  it('マップ名の末尾に連番が付いていない', () => {
    for (const entry of MAP_LIST) {
      expect(entry.definition.name).not.toMatch(/[0-9]+$/);
    }
  });

  it('すべてのマップに区分が解決されている', () => {
    for (const entry of MAP_LIST) {
      expect(['normal', 'test', 'extra']).toContain(entry.category);
    }
  });

  it('テストマップは解放条件の集計対象外(test 区分)である', () => {
    const test = MAP_LIST.find((entry) => entry.id === 'test');
    expect(test?.category).toBe('test');
  });
  it('すべてのマップにマップ区分が解決されている', () => {
    for (const entry of MAP_LIST) {
      expect(['standard', 'new', 'four']).toContain(entry.group);
    }
  });

  it('mapsInGroup は指定した区分のマップだけを返す', () => {
    expect(mapsInGroup(MAP_LIST, 'standard')).toEqual(STANDARD_MAP_LIST);
    for (const entry of mapsInGroup(MAP_LIST, 'new')) {
      expect(entry.group).toBe('new');
    }
    for (const entry of mapsInGroup(MAP_LIST, 'four')) {
      expect(entry.group).toBe('four');
    }
  });

  it('激ムズマップには担当サイドを指定している(サイドごとに別のマップを出すため)', () => {
    const extras = MAP_LIST.filter((entry) => entry.category === 'extra');
    expect(extras.length).toBeGreaterThan(0);
    for (const entry of extras) {
      expect(['1p', '2p']).toContain(entry.side);
    }
    // 双大陸マップは1P側の激ムズマップ(2P側には別のマップを用意する)
    expect(MAP_LIST.find((entry) => entry.id === 'twinContinents')?.side).toBe('1p');
  });

  it('通常マップ・テストマップはサイドを限定しない(どちらのサイドでも遊べる)', () => {
    for (const entry of MAP_LIST.filter((entry) => entry.category !== 'extra')) {
      expect(entry.side).toBeUndefined();
    }
  });

  it('激ムズマップの解放条件に使う通常マップの一覧は空ではない', () => {
    expect(STANDARD_MAP_LIST.length).toBeGreaterThan(0);
    expect(STANDARD_MAP_LIST.some((entry) => entry.category === 'normal')).toBe(true);
  });
});
