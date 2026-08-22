import { describe, expect, it } from 'vitest';
import { EconomyManager } from '@/core/economy/EconomyManager';
import { gridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import {
  createSaveData,
  isSaveData,
  matchesMap,
  restoreGameState,
  SAVE_VERSION,
} from '@/core/save/SaveData';
import { TurnManager } from '@/core/turn/TurnManager';
import { UnitManager } from '@/core/units/UnitManager';
import { TEST_MAP } from '@/data/maps/testMap';

/** テスト用に、マップ定義から一式のマネージャを組み立てる */
function setupGame() {
  const map = MapManager.fromDefinition(TEST_MAP);
  const units = UnitManager.fromPlacements(TEST_MAP.units ?? [], map);
  const turn = new TurnManager(units);
  const economy = new EconomyManager({ initialFunds: 10000 });
  return { map, units, turn, economy };
}

describe('createSaveData / restoreGameState(中断データ)', () => {
  it('ユニットの位置・HP・行動済み状態を復元できる', () => {
    const game = setupGame();
    const tank = game.units.getUnitAt(gridPosition(6, 8));
    expect(tank).toBeDefined();
    tank!.currentHp = 4;
    game.units.moveUnit(tank!, gridPosition(6, 7));

    const save = createSaveData({ mapId: 'test', ...game });
    const map = MapManager.fromDefinition(TEST_MAP);
    const restored = restoreGameState(save, map);

    const restoredTank = restored.units.getUnitAt(gridPosition(6, 7));
    expect(restoredTank?.unitType).toBe('tank');
    expect(restoredTank?.currentHp).toBe(4);
    expect(restoredTank?.hasActed).toBe(true);
    expect(restored.units.getAllUnits()).toHaveLength(game.units.getAllUnits().length);
  });

  it('拠点の所有者・占領耐久・占領中の軍を復元できる', () => {
    const game = setupGame();
    const tile = game.map.getTile(gridPosition(2, 0));
    expect(tile).toBeDefined();
    tile!.owner = 'player';
    tile!.captureHp = 6;
    tile!.captureArmy = 'player';

    const save = createSaveData({ mapId: 'test', ...game });
    const map = MapManager.fromDefinition(TEST_MAP);
    restoreGameState(save, map);

    const restoredTile = map.getTile(gridPosition(2, 0));
    expect(restoredTile?.owner).toBe('player');
    expect(restoredTile?.captureHp).toBe(6);
    expect(restoredTile?.captureArmy).toBe('player');
  });

  it('ターン数・手番・資金を復元する(復元時に行動済みはリセットしない)', () => {
    const game = setupGame();
    game.turn.endTurn(); // → 敵軍
    game.turn.endTurn(); // → 自軍(第2ターン)
    game.economy.spend('player', 3000);
    game.economy.addFunds('enemy', 500);
    const infantry = game.units.getUnitAt(gridPosition(5, 8));
    infantry!.hasActed = true;

    const save = createSaveData({ mapId: 'test', ...game });
    const map = MapManager.fromDefinition(TEST_MAP);
    const restored = restoreGameState(save, map);

    expect(restored.turn.turnNumber).toBe(2);
    expect(restored.turn.currentArmy).toBe('player');
    expect(restored.economy.getFunds('player')).toBe(7000);
    expect(restored.economy.getFunds('enemy')).toBe(10500);
    // 復元はターンの途中からの再開なので、行動済みの状態がそのまま残る
    expect(restored.units.getUnitAt(gridPosition(5, 8))?.hasActed).toBe(true);
  });

  it('輸送ヘリが運んでいるユニットも一緒に復元する', () => {
    const game = setupGame();
    const transport = game.units.spawnUnit({
      unitType: 'transportHelicopter',
      army: 'player',
      position: gridPosition(0, 8),
    });
    const passenger = game.units.getUnitAt(gridPosition(5, 8));
    expect(passenger?.unitType).toBe('infantry');
    game.units.carryUnit(transport, passenger!);

    const save = createSaveData({ mapId: 'test', ...game });
    const map = MapManager.fromDefinition(TEST_MAP);
    const restored = restoreGameState(save, map);

    const restoredTransport = restored.units.getUnitAt(gridPosition(0, 8));
    expect(restoredTransport?.unitType).toBe('transportHelicopter');
    expect(restoredTransport?.carried.map((u) => u.unitType)).toEqual(['infantry']);
    // 搭乗中のユニットは盤面には出ていない
    expect(restored.units.getUnitAt(gridPosition(5, 8))).toBeUndefined();
  });

  it('生産ユニットの ID 連番を引き継ぎ、復元後の生産で ID が衝突しない', () => {
    const game = setupGame();
    const produced = game.units.spawnUnit({
      unitType: 'infantry',
      army: 'player',
      position: gridPosition(0, 9),
    });

    const save = createSaveData({ mapId: 'test', ...game });
    const map = MapManager.fromDefinition(TEST_MAP);
    const restored = restoreGameState(save, map);
    const next = restored.units.spawnUnit({
      unitType: 'infantry',
      army: 'player',
      position: gridPosition(1, 9),
    });

    expect(next.id).not.toBe(produced.id);
    expect(restored.units.getUnitById(produced.id)).toBeDefined();
  });

  it('マップサイズが一致しない中断データは復元できない', () => {
    const game = setupGame();
    const save = { ...createSaveData({ mapId: 'test', ...game }), cols: 3 };
    const map = MapManager.fromDefinition(TEST_MAP);
    expect(() => restoreGameState(save, map)).toThrow();
  });
});

describe('isSaveData(中断データの検証)', () => {
  it('正しい中断データを受け入れる', () => {
    const save = createSaveData({ mapId: 'test', ...setupGame() });
    expect(isSaveData(save)).toBe(true);
    // JSON を経由しても形式は保たれる
    expect(isSaveData(JSON.parse(JSON.stringify(save)))).toBe(true);
  });

  it('バージョンが違う・壊れているデータは拒否する', () => {
    const save = createSaveData({ mapId: 'test', ...setupGame() });
    expect(isSaveData({ ...save, version: SAVE_VERSION + 1 })).toBe(false);
    expect(isSaveData({ ...save, currentArmy: 'neutral' })).toBe(false);
    expect(isSaveData({ ...save, turnNumber: 0 })).toBe(false);
    expect(isSaveData({ ...save, funds: { player: 100 } })).toBe(false);
    expect(isSaveData({ ...save, units: [{ id: 'x' }] })).toBe(false);
    expect(
      isSaveData({
        ...save,
        // 存在しないユニット種別(将来の追加で実在しないよう架空の名前を使う)
        units: [{ ...save.units[0], unitType: 'unknownUnit' }],
      }),
    ).toBe(false);
    expect(isSaveData(null)).toBe(false);
    expect(isSaveData('save')).toBe(false);
  });
});

describe('matchesMap(中断データとマップの照合)', () => {
  it('同じマップ ID とサイズなら再開できる', () => {
    const save = createSaveData({ mapId: 'test', ...setupGame() });
    expect(matchesMap(save, 'test', TEST_MAP)).toBe(true);
  });

  it('別のマップでは再開しない', () => {
    const save = createSaveData({ mapId: 'test', ...setupGame() });
    expect(matchesMap(save, 'capture', TEST_MAP)).toBe(false);
    expect(
      matchesMap(save, 'test', { ...TEST_MAP, terrain: ['...', '...', '...'] }),
    ).toBe(false);
  });
});
