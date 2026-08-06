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
  captureArmy: ArmyType | null = null,
): TileData {
  return {
    position: gridPosition(col, row),
    terrainType,
    owner,
    captureHp,
    captureArmy,
  };
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
    expect(result.reset).toBe(false);
    expect(tile.captureHp).toBe(10);
    expect(tile.owner).toBe('neutral');
    // 占領を進めた軍が記録される
    expect(tile.captureArmy).toBe('player');
    expect(infantry.hasActed).toBe(true);
  });

  it('耐久が0以下になると所有者が変わり耐久が初期値に戻る', () => {
    // 自軍が 8 まで占領を進めた拠点を、同じ自軍の歩兵が占領し切る
    const tile = makeTile('city', 'enemy', 8, 0, 0, 'player');
    const infantry = makeUnit('infantry', 'player', 0, 0, 10);
    const result = capture.capture(infantry, tile);

    expect(result.captured).toBe(true);
    expect(result.remainingHp).toBe(0);
    expect(tile.owner).toBe('player');
    expect(tile.captureHp).toBe(INITIAL_CAPTURE_HP);
    // 占領完了で進行状態はクリアされる
    expect(tile.captureArmy).toBeNull();
  });

  it('別の軍が占領を進めていた拠点は初期値に戻してから計算する', () => {
    // 自軍が 20 → 10 まで占領を進めた拠点
    const tile = makeTile('city', 'neutral', 10, 0, 0, 'player');
    const enemyInfantry = makeUnit('infantry', 'enemy', 0, 0, 10);
    const result = capture.capture(enemyInfantry, tile);

    // 敵軍が占領するときは 20 にリセットされてから 10 減る
    expect(result.reset).toBe(true);
    expect(result.reduced).toBe(10);
    expect(result.remainingHp).toBe(10);
    expect(tile.captureHp).toBe(10);
    expect(tile.captureArmy).toBe('enemy');
    expect(tile.owner).toBe('neutral');
  });

  it('同じ軍が続けて占領する場合は進行中の耐久を引き継ぐ', () => {
    // 自軍が 20 → 12 まで進めた拠点を、別の自軍歩兵が引き継ぐ
    const tile = makeTile('city', 'neutral', 12, 0, 0, 'player');
    const infantry = makeUnit('infantry', 'player', 0, 0, 10);
    const result = capture.capture(infantry, tile);

    expect(result.reset).toBe(false);
    expect(result.reduced).toBe(10);
    expect(tile.captureHp).toBe(2);
    expect(tile.captureArmy).toBe('player');
  });

  it('effectiveCaptureHp は別軍の進行を引き継がず初期値を返す', () => {
    const tile = makeTile('city', 'neutral', 10, 0, 0, 'player');
    const enemyInfantry = makeUnit('infantry', 'enemy', 0, 0, 10);
    const playerInfantry = makeUnit('infantry', 'player', 0, 0, 10);

    // 別軍(敵軍)は初期値から始まる
    expect(capture.effectiveCaptureHp(enemyInfantry, tile)).toBe(INITIAL_CAPTURE_HP);
    // 同じ軍(自軍)は現在値を引き継ぐ
    expect(capture.effectiveCaptureHp(playerInfantry, tile)).toBe(10);
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
