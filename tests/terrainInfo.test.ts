import { describe, expect, it } from 'vitest';
import { gridPosition } from '@/core/map/GridPosition';
import { INITIAL_CAPTURE_HP, type TileData } from '@/core/map/TileData';
import { armyLabel, formatTerrainInfo } from '@/ui/terrainInfo';

function tile(partial: Partial<TileData> & Pick<TileData, 'terrainType'>): TileData {
  return {
    position: gridPosition(1, 2),
    owner: 'neutral',
    captureHp: INITIAL_CAPTURE_HP,
    captureArmy: null,
    ...partial,
  };
}

describe('armyLabel', () => {
  it('所有軍を日本語表示に変換する', () => {
    expect(armyLabel('player')).toBe('自軍');
    expect(armyLabel('enemy')).toBe('敵軍');
    expect(armyLabel('neutral')).toBe('中立');
  });
});

describe('formatTerrainInfo', () => {
  it('非占領地形は占領関連の行を含まない', () => {
    const lines = formatTerrainInfo(tile({ terrainType: 'mountain' }));
    expect(lines).toContain('地形: 山');
    expect(lines).toContain('座標: (1, 2)');
    expect(lines).toContain('防御: 3');
    expect(lines).toContain('移動コスト 車両: ×');
    // 装輪車両は山へ進入できない
    expect(lines).toContain('移動コスト 装輪: ×');
    expect(lines.some((l) => l.startsWith('所有:'))).toBe(false);
    expect(lines.some((l) => l.startsWith('占領耐久:'))).toBe(false);
  });

  it('装輪車両の移動コストを装軌車両とは別に表示する', () => {
    // 道路は 1、平地は 2、海岸は 4 と車両(いずれも 1〜2)と異なる
    expect(formatTerrainInfo(tile({ terrainType: 'road' }))).toContain(
      '移動コスト 装輪: 1',
    );
    expect(formatTerrainInfo(tile({ terrainType: 'plain' }))).toContain(
      '移動コスト 装輪: 2',
    );
    expect(formatTerrainInfo(tile({ terrainType: 'beach' }))).toContain(
      '移動コスト 装輪: 4',
    );
    expect(formatTerrainInfo(tile({ terrainType: 'forest' }))).toContain(
      '移動コスト 装輪: ×',
    );
  });

  it('占領地形は所有・占領耐久・生産の行を含む', () => {
    const lines = formatTerrainInfo(
      tile({ terrainType: 'headquarters', owner: 'player' }),
    );
    expect(lines).toContain('地形: 本拠地');
    expect(lines).toContain('所有: 自軍');
    expect(lines).toContain(`占領耐久: ${INITIAL_CAPTURE_HP}`);
    expect(lines).toContain('生産: 可');
  });

  it('都市は生産不可と表示する', () => {
    const lines = formatTerrainInfo(tile({ terrainType: 'city' }));
    expect(lines).toContain('生産: 不可');
  });

  it('空港は占領地形として所有・占領耐久を表示し、生産可能と表示する', () => {
    const lines = formatTerrainInfo(tile({ terrainType: 'airport', owner: 'player' }));
    expect(lines).toContain('地形: 空港');
    expect(lines).toContain('所有: 自軍');
    expect(lines).toContain(`占領耐久: ${INITIAL_CAPTURE_HP}`);
    expect(lines).toContain('生産: 可');
  });

  it('海は非占領地形で移動コストを進入不可(×)と表示する', () => {
    const lines = formatTerrainInfo(tile({ terrainType: 'sea' }));
    expect(lines).toContain('地形: 海');
    expect(lines).toContain('移動コスト 歩兵: ×');
    expect(lines).toContain('移動コスト 車両: ×');
    expect(lines.some((l) => l.startsWith('所有:'))).toBe(false);
  });

  it('占領進行中はどの軍が占領しているかを併記する', () => {
    const lines = formatTerrainInfo(
      tile({ terrainType: 'city', captureHp: 10, captureArmy: 'player' }),
    );
    expect(lines).toContain('占領耐久: 10 (自軍が占領中)');
  });

  it('進行がない拠点は占領耐久のみ表示する', () => {
    const lines = formatTerrainInfo(
      tile({ terrainType: 'city', captureHp: INITIAL_CAPTURE_HP, captureArmy: null }),
    );
    expect(lines).toContain(`占領耐久: ${INITIAL_CAPTURE_HP}`);
  });

  it('compact 表示は座標・移動コストを省き占領耐久を残す', () => {
    const lines = formatTerrainInfo(
      tile({ terrainType: 'city', captureHp: 10, captureArmy: 'enemy' }),
      { compact: true },
    );
    expect(lines).toContain('地形: 都市');
    expect(lines).toContain('防御: 2');
    expect(lines).toContain('占領耐久: 10 (敵軍が占領中)');
    // 簡略表示では座標・移動コストは出さない
    expect(lines.some((l) => l.startsWith('座標:'))).toBe(false);
    expect(lines.some((l) => l.startsWith('移動コスト'))).toBe(false);
  });
});
