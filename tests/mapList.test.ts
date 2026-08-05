import { describe, expect, it } from 'vitest';
import { MapManager } from '@/core/map/MapManager';
import { UnitManager } from '@/core/units/UnitManager';
import { DEFAULT_MAP_ENTRY, MAP_LIST } from '@/data/maps';

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
});
