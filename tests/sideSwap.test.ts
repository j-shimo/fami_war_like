import { describe, expect, it } from 'vitest';
import { MapManager } from '@/core/map/MapManager';
import { gridPosition } from '@/core/map/GridPosition';
import { UnitManager } from '@/core/units/UnitManager';
import { MAP_LIST } from '@/data/maps';
import type { MapDefinition } from '@/data/maps/mapDefinition';
import { swapArmy, swapMapSides } from '@/data/maps/sideSwap';

/** 入れ替えの確認に使う小さなマップ */
const SAMPLE: MapDefinition = {
  name: 'サンプル',
  terrain: ['H.c', '...', 'c.H'],
  owners: [
    { col: 0, row: 0, owner: 'player' },
    { col: 2, row: 2, owner: 'enemy' },
    { col: 2, row: 0, owner: 'neutral' },
  ],
  units: [
    { col: 0, row: 1, unitType: 'infantry', army: 'player' },
    { col: 2, row: 1, unitType: 'infantry', army: 'enemy' },
  ],
  initialFunds: 4000,
};

describe('swapArmy', () => {
  it('自軍と敵軍を入れ替え、中立はそのままにする', () => {
    expect(swapArmy('player')).toBe('enemy');
    expect(swapArmy('enemy')).toBe('player');
    expect(swapArmy('neutral')).toBe('neutral');
  });
});

describe('swapMapSides(2P側の盤面入れ替え)', () => {
  it('拠点の所有者を入れ替える(中立はそのまま)', () => {
    const swapped = swapMapSides(SAMPLE);
    expect(swapped.owners).toEqual([
      { col: 0, row: 0, owner: 'enemy' },
      { col: 2, row: 2, owner: 'player' },
      { col: 2, row: 0, owner: 'neutral' },
    ]);
  });

  it('ユニットの所属を入れ替える', () => {
    const swapped = swapMapSides(SAMPLE);
    expect(swapped.units).toEqual([
      { col: 0, row: 1, unitType: 'infantry', army: 'enemy' },
      { col: 2, row: 1, unitType: 'infantry', army: 'player' },
    ]);
  });

  it('地形・マップ名・初期軍資金は変えない', () => {
    const swapped = swapMapSides(SAMPLE);
    expect(swapped.terrain).toEqual(SAMPLE.terrain);
    expect(swapped.name).toBe(SAMPLE.name);
    expect(swapped.initialFunds).toBe(SAMPLE.initialFunds);
  });

  it('元のマップ定義は書き換えない', () => {
    const before = JSON.stringify(SAMPLE);
    swapMapSides(SAMPLE);
    expect(JSON.stringify(SAMPLE)).toBe(before);
  });

  it('2 回入れ替えると元に戻る', () => {
    expect(swapMapSides(swapMapSides(SAMPLE))).toEqual(SAMPLE);
  });

  it('登録済みのすべてのマップを入れ替えても矛盾なく生成できる', () => {
    for (const entry of MAP_LIST) {
      const swapped = swapMapSides(entry.definition);
      const map = MapManager.fromDefinition(swapped);
      expect(() => UnitManager.fromPlacements(swapped.units ?? [], map)).not.toThrow();

      // 入れ替え後は、元の敵軍の拠点がプレイヤー(自軍)の持ち物になっている
      for (const owner of entry.definition.owners ?? []) {
        const tile = map.getTile(gridPosition(owner.col, owner.row));
        expect(tile?.owner).toBe(swapArmy(owner.owner));
      }
    }
  });
});
