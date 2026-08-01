import { describe, expect, it } from 'vitest';
import { CaptureSystem } from '@/core/economy/CaptureSystem';
import { gridPosition } from '@/core/map/GridPosition';
import { INITIAL_CAPTURE_HP, type TileData } from '@/core/map/TileData';
import type { ArmyType, TerrainType } from '@/core/map/TerrainType';
import { Unit } from '@/core/units/Unit';
import type { UnitType } from '@/core/units/UnitType';

/** テスト用のタイルを組み立てる */
function makeTile(
  terrainType: TerrainType,
  owner: ArmyType,
  captureHp = INITIAL_CAPTURE_HP,
  col = 0,
  row = 0,
): TileData {
  return { position: gridPosition(col, row), terrainType, owner, captureHp };
}

/** 指定座標・HP のユニットを生成する */
function makeUnit(
  unitType: UnitType,
  army: 'player' | 'enemy',
  col = 0,
  row = 0,
  currentHp?: number,
): Unit {
  return new Unit({
    id: `${army}-${unitType}`,
    unitType,
    armyType: army,
    position: gridPosition(col, row),
    currentHp,
  });
}

describe('CaptureSystem', () => {
  const capture = new CaptureSystem();

  it('占領対象の拠点に立つ歩兵は占領できる', () => {
    const tile = makeTile('city', 'enemy');
    const infantry = makeUnit('infantry', 'player');
    expect(capture.canCapture(infantry, tile)).toBe(true);
  });

  it('占領能力のないユニットは占領できない', () => {
    const tile = makeTile('city', 'enemy');
    const tank = makeUnit('tank', 'player');
    expect(capture.canCapture(tank, tile)).toBe(false);
  });

  it('占領できない地形は占領対象にならない', () => {
    const tile = makeTile('plain', 'neutral');
    const infantry = makeUnit('infantry', 'player');
    expect(capture.canCapture(infantry, tile)).toBe(false);
  });

  it('自軍がすでに所有する拠点は占領できない', () => {
    const tile = makeTile('city', 'player');
    const infantry = makeUnit('infantry', 'player');
    expect(capture.canCapture(infantry, tile)).toBe(false);
  });

  it('拠点マスに立っていない歩兵は占領できない', () => {
    const tile = makeTile('city', 'enemy', INITIAL_CAPTURE_HP, 3, 3);
    const infantry = makeUnit('infantry', 'player', 0, 0);
    expect(capture.canCapture(infantry, tile)).toBe(false);
  });

  it('占領コマンドは歩兵の現在HPぶん耐久を減らす(未完了)', () => {
    const tile = makeTile('city', 'neutral', INITIAL_CAPTURE_HP);
    const infantry = makeUnit('infantry', 'player', 0, 0, 10);
    const result = capture.capture(infantry, tile);

    expect(result.reduced).toBe(10);
    expect(result.captured).toBe(false);
    expect(result.remainingHp).toBe(10);
    expect(tile.captureHp).toBe(10);
    expect(tile.owner).toBe('neutral');
    expect(infantry.hasActed).toBe(true);
  });

  it('耐久が0以下になると所有者が変わり耐久が初期値に戻る', () => {
    const tile = makeTile('city', 'enemy', 8);
    const infantry = makeUnit('infantry', 'player', 0, 0, 10);
    const result = capture.capture(infantry, tile);

    expect(result.captured).toBe(true);
    expect(result.remainingHp).toBe(0);
    expect(tile.owner).toBe('player');
    expect(tile.captureHp).toBe(INITIAL_CAPTURE_HP);
  });

  it('HPが減った歩兵は占領の進みが遅い', () => {
    const tile = makeTile('city', 'neutral', INITIAL_CAPTURE_HP);
    const infantry = makeUnit('infantry', 'player', 0, 0, 4);
    const result = capture.capture(infantry, tile);

    expect(result.reduced).toBe(4);
    expect(tile.captureHp).toBe(16);
  });

  it('占領できない状況で capture を呼ぶと例外を投げる', () => {
    const tile = makeTile('city', 'player');
    const infantry = makeUnit('infantry', 'player');
    expect(() => capture.capture(infantry, tile)).toThrow();
  });
});
