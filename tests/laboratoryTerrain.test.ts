import { describe, expect, it } from 'vitest';
import { CaptureSystem, evolutionOnCapture } from '@/core/economy/CaptureSystem';
import { EconomyManager } from '@/core/economy/EconomyManager';
import { RepairManager } from '@/core/economy/RepairManager';
import { gridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import type { ArmyType } from '@/core/map/TerrainType';
import { INITIAL_CAPTURE_HP, type TileData } from '@/core/map/TileData';
import { Unit } from '@/core/units/Unit';
import { UnitManager } from '@/core/units/UnitManager';
import type { UnitType } from '@/core/units/UnitType';
import type { MapDefinition } from '@/data/maps/mapDefinition';
import { SYMBOL_TO_TERRAIN } from '@/data/maps/mapDefinition';
import { canRepairAt, getTerrainData } from '@/data/terrainData';
import { formatCaptureLog } from '@/ui/economyInfo';
import { formatTerrainInfo } from '@/ui/terrainInfo';

/**
 * テスト用の研究所マスを組み立てる。
 * captureArmy を渡すと「その軍が占領を進めている途中」の状態になり、
 * 残り耐久(captureHp)を引き継いだ状態から占領を続けられる。
 */
function makeLaboratory(
  owner: ArmyType,
  captureHp = INITIAL_CAPTURE_HP,
  captureArmy: ArmyType | null = null,
): TileData {
  return {
    position: gridPosition(0, 0),
    terrainType: 'laboratory',
    owner,
    captureHp,
    captureArmy,
  };
}

/** 研究所マス(0, 0)に立つユニットを生成する */
function makeUnit(
  unitType: UnitType,
  army: 'player' | 'enemy' = 'player',
  currentHp?: number,
): Unit {
  return new Unit({
    id: `${army}-${unitType}`,
    unitType,
    armyType: army,
    position: gridPosition(0, 0),
    currentHp,
  });
}

describe('研究所(laboratory)の地形パラメータ', () => {
  it('防御・移動コスト・修理・収入は都市とまったく同じ', () => {
    const laboratory = getTerrainData('laboratory');
    const city = getTerrainData('city');

    expect(laboratory.terrainName).toBe('研究所');
    expect(laboratory.defense).toBe(city.defense);
    expect(laboratory.moveCost).toEqual(city.moveCost);
    expect(laboratory.canCapture).toBe(true);
    expect(laboratory.canRepair).toBe(true);
    // 都市と同じく、ユニットの生産はできない
    expect(laboratory.canProduce).toBe(false);
  });

  it('地上ユニットを修理でき、飛行・海上ユニットは修理できない(都市と同じ)', () => {
    for (const movementType of ['infantry', 'vehicle', 'wheeled'] as const) {
      expect(canRepairAt('laboratory', movementType)).toBe(true);
    }
    expect(canRepairAt('laboratory', 'air')).toBe(false);
    expect(canRepairAt('laboratory', 'sea')).toBe(false);
  });

  it('マップ定義では記号 L で置ける', () => {
    expect(SYMBOL_TO_TERRAIN.L).toBe('laboratory');
    const def: MapDefinition = { name: '研究所テスト', terrain: ['.L'] };
    const map = MapManager.fromDefinition(def);
    expect(map.getTile(gridPosition(1, 0))?.terrainType).toBe('laboratory');
    // 占領可能地形なので、初期状態は中立になる
    expect(map.getTile(gridPosition(1, 0))?.owner).toBe('neutral');
  });

  it('占領した研究所は都市と同じく収入源になる', () => {
    const def: MapDefinition = {
      name: '研究所テスト',
      terrain: ['cL'],
      owners: [
        { col: 0, row: 0, owner: 'player' },
        { col: 1, row: 0, owner: 'player' },
      ],
    };
    const map = MapManager.fromDefinition(def);
    const economy = new EconomyManager();
    expect(economy.countBases('player', map)).toBe(2);
  });

  it('地形情報では所有と占領耐久を表示し、生産は不可と示す', () => {
    const lines = formatTerrainInfo(makeLaboratory('neutral'));
    expect(lines).toContain('地形: 研究所');
    expect(lines).toContain('所有: 中立');
    expect(lines).toContain('生産: 不可');
  });

  it('自軍所有の研究所ではターン開始時に地上ユニットを修理できる', () => {
    const def: MapDefinition = {
      name: '研究所テスト',
      terrain: ['L'],
      owners: [{ col: 0, row: 0, owner: 'player' }],
    };
    const map = MapManager.fromDefinition(def);
    const damaged = makeUnit('infantry', 'player', 5);
    const units = UnitManager.fromUnits([damaged]);
    const economy = new EconomyManager();
    const repair = new RepairManager(map, units, economy);

    expect(repair.canRepair(damaged, 'player')).toBe(true);
    repair.repairAll('player');
    expect(damaged.currentHp).toBeGreaterThan(5);
  });
});

describe('研究所の占領による進化', () => {
  const capture = new CaptureSystem();

  it('中立の研究所を占領し切った歩兵は新型戦車へ進化する', () => {
    const tile = makeLaboratory('neutral', 10, 'player');
    const infantry = makeUnit('infantry', 'player');
    const result = capture.capture(infantry, tile);

    expect(result.captured).toBe(true);
    expect(tile.owner).toBe('player');
    expect(result.evolvedFrom).toBe('infantry');
    expect(result.evolvedTo).toBe('newTank');
    // 同じ 1 体として、その場で種別だけが入れ替わる
    expect(infantry.unitType).toBe('newTank');
    expect(infantry.unitName).toBe('新型戦車');
    expect(infantry.position).toEqual(gridPosition(0, 0));
    expect(infantry.hasActed).toBe(true);
  });

  it('進化しても回復はせず、現在 HP をそのまま引き継ぐ', () => {
    const tile = makeLaboratory('neutral', 6, 'player');
    const infantry = makeUnit('infantry', 'player', 6);
    capture.capture(infantry, tile);
    expect(infantry.unitType).toBe('newTank');
    expect(infantry.currentHp).toBe(6);
  });

  it('占領が完了していない(耐久が残る)うちは進化しない', () => {
    const tile = makeLaboratory('neutral');
    const infantry = makeUnit('infantry', 'player');
    const result = capture.capture(infantry, tile);

    expect(result.captured).toBe(false);
    expect(result.evolvedTo).toBeNull();
    expect(infantry.unitType).toBe('infantry');
  });

  it('いちど所有者が決まった研究所を奪い返しても進化しない', () => {
    // 敵軍が占領済みの研究所(= 中立ではない)は、都市と同等の拠点として振る舞う
    const tile = makeLaboratory('enemy', 10, 'player');
    const infantry = makeUnit('infantry', 'player');
    const result = capture.capture(infantry, tile);

    expect(result.captured).toBe(true);
    expect(tile.owner).toBe('player');
    expect(result.evolvedFrom).toBeNull();
    expect(result.evolvedTo).toBeNull();
    expect(infantry.unitType).toBe('infantry');
  });

  it('都市など研究所以外の拠点では進化しない', () => {
    const tile: TileData = {
      position: gridPosition(0, 0),
      terrainType: 'city',
      owner: 'neutral',
      captureHp: 10,
      captureArmy: 'player',
    };
    const infantry = makeUnit('infantry', 'player');
    expect(evolutionOnCapture(infantry, tile)).toBeNull();
    capture.capture(infantry, tile);
    expect(infantry.unitType).toBe('infantry');
  });

  it('敵軍が中立の研究所を占領しても同じように進化する', () => {
    const tile = makeLaboratory('neutral', 10, 'enemy');
    const infantry = makeUnit('infantry', 'enemy');
    capture.capture(infantry, tile);
    expect(tile.owner).toBe('enemy');
    expect(infantry.unitType).toBe('newTank');
  });

  it('占領ログには進化前の名前と進化したことを載せる', () => {
    const tile = makeLaboratory('neutral', 10, 'player');
    const infantry = makeUnit('infantry', 'player');
    const lines = formatCaptureLog(capture.capture(infantry, tile));

    expect(lines).toContain('歩兵 が占領');
    expect(lines).toContain('占領完了');
    expect(lines).toContain('歩兵 が 新型戦車 に進化!');
  });

  it('進化しない占領のログには進化の行を出さない', () => {
    const tile = makeLaboratory('enemy', 10, 'player');
    const infantry = makeUnit('infantry', 'player');
    const lines = formatCaptureLog(capture.capture(infantry, tile));
    expect(lines.some((line) => line.includes('進化'))).toBe(false);
  });
});
