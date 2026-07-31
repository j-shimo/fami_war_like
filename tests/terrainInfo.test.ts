import { describe, expect, it } from 'vitest';
import { gridPosition } from '@/core/map/GridPosition';
import { INITIAL_CAPTURE_HP, type TileData } from '@/core/map/TileData';
import { armyLabel, formatTerrainInfo } from '@/ui/terrainInfo';

function tile(partial: Partial<TileData> & Pick<TileData, 'terrainType'>): TileData {
  return {
    position: gridPosition(1, 2),
    owner: 'neutral',
    captureHp: INITIAL_CAPTURE_HP,
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
    expect(lines.some((l) => l.startsWith('所有:'))).toBe(false);
    expect(lines.some((l) => l.startsWith('占領耐久:'))).toBe(false);
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
});
