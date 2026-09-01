import { describe, expect, it } from 'vitest';
import type { CaptureResult } from '@/core/economy/CaptureSystem';
import type { ProductionResult } from '@/core/economy/ProductionManager';
import type { RepairResult } from '@/core/economy/RepairManager';
import { gridPosition } from '@/core/map/GridPosition';
import { INITIAL_CAPTURE_HP, type TileData } from '@/core/map/TileData';
import { Unit } from '@/core/units/Unit';
import {
  formatCaptureLog,
  formatFunds,
  formatIncome,
  formatProductionLabel,
  formatProductionLog,
  formatRepairLog,
  listProductionItems,
} from '@/ui/economyInfo';

function makeInfantry(): Unit {
  return new Unit({
    id: 'p-inf',
    unitType: 'infantry',
    armyType: 'player',
    position: gridPosition(0, 0),
  });
}

function makeCityTile(captureHp = INITIAL_CAPTURE_HP): TileData {
  return {
    position: gridPosition(0, 0),
    terrainType: 'city',
    owner: 'neutral',
    captureHp,
    captureArmy: null,
  };
}

describe('economyInfo', () => {
  it('資金を軍名つきで整形する', () => {
    expect(formatFunds('player', 12000)).toBe('資金(自軍): 12000');
    expect(formatFunds('enemy', 0)).toBe('資金(敵軍): 0');
  });

  it('収入を拠点数つきで整形する', () => {
    expect(formatIncome(5000, 5)).toBe('収入: 5000 (拠点5)');
    // 拠点を 1 つも持っていなければ収入 0
    expect(formatIncome(0, 0)).toBe('収入: 0 (拠点0)');
  });

  it('生産ボタンのラベルは名前とコストを表示する', () => {
    expect(formatProductionLabel('infantry')).toBe('歩兵 (1000)');
    expect(formatProductionLabel('mediumTank')).toBe('中戦車 (12000)');
  });

  it('工場の生産一覧は地上ユニットを表示順で返す', () => {
    const items = listProductionItems('factory');
    expect(items).toEqual([
      { unitType: 'infantry', unitName: '歩兵', cost: 1000 },
      { unitType: 'recon', unitName: '偵察車', cost: 3500 },
      { unitType: 'transportVehicle', unitName: '輸送車', cost: 5000 },
      { unitType: 'lightTank', unitName: '軽戦車', cost: 6000 },
      { unitType: 'mediumTank', unitName: '中戦車', cost: 12000 },
      { unitType: 'heavyTank', unitName: '重戦車', cost: 18000 },
      { unitType: 'artillery', unitName: '自走砲', cost: 6000 },
      { unitType: 'rocketArtillery', unitName: 'ロケット砲', cost: 15000 },
      { unitType: 'antiAirTank', unitName: '対空戦車', cost: 8000 },
      { unitType: 'antiAirArtillery', unitName: '対空自走砲', cost: 5500 },
      { unitType: 'antiAirRocketArtillery', unitName: '対空ロケット砲', cost: 13000 },
    ]);
  });

  it('空港の生産一覧は飛行ユニットを表示順で返す', () => {
    const items = listProductionItems('airport');
    expect(items).toEqual([
      { unitType: 'attackHelicopter', unitName: '戦闘ヘリ', cost: 8500 },
      { unitType: 'transportHelicopter', unitName: '輸送ヘリ', cost: 5500 },
      { unitType: 'fighter', unitName: '戦闘機', cost: 20000 },
      { unitType: 'bomber', unitName: '爆撃機', cost: 22000 },
      { unitType: 'attackAircraft', unitName: '攻撃機', cost: 26500 },
    ]);
  });

  it('生産できない地形(都市)の生産一覧は空になる', () => {
    expect(listProductionItems('city')).toEqual([]);
  });

  it('占領未完了は残り耐久を表示する', () => {
    const result: CaptureResult = {
      tile: makeCityTile(10),
      unit: makeInfantry(),
      reduced: 10,
      remainingHp: 10,
      captured: false,
      reset: false,
      evolvedFrom: null,
      evolvedTo: null,
    };
    const lines = formatCaptureLog(result);
    expect(lines).toContain('残り耐久: 10');
    expect(lines).not.toContain('占領完了');
    expect(lines).not.toContain('耐久をリセット');
  });

  it('占領完了は完了メッセージを表示する', () => {
    const result: CaptureResult = {
      tile: makeCityTile(INITIAL_CAPTURE_HP),
      unit: makeInfantry(),
      reduced: 8,
      remainingHp: 0,
      captured: true,
      reset: false,
      evolvedFrom: null,
      evolvedTo: null,
    };
    expect(formatCaptureLog(result)).toContain('占領完了');
  });

  it('別軍の占領を戻したときはリセット表示を含む', () => {
    const result: CaptureResult = {
      tile: makeCityTile(10),
      unit: makeInfantry(),
      reduced: 10,
      remainingHp: 10,
      captured: false,
      reset: true,
      evolvedFrom: null,
      evolvedTo: null,
    };
    expect(formatCaptureLog(result)).toContain('耐久をリセット');
  });

  it('生産結果は名称と消費資金を表示する', () => {
    const result: ProductionResult = {
      unit: makeInfantry(),
      cost: 1000,
    };
    const lines = formatProductionLog(result);
    expect(lines).toContain('歩兵 を生産');
    expect(lines).toContain('消費資金: 1000');
  });

  it('修理がなければ空配列を返す', () => {
    expect(formatRepairLog([])).toEqual([]);
  });

  it('修理結果はユニットごとの回復量と合計消費資金を表示する', () => {
    const results: RepairResult[] = [
      { unit: makeInfantry(), healedHp: 2, cost: 200, currentHp: 8 },
      { unit: makeInfantry(), healedHp: 1, cost: 100, currentHp: 10 },
    ];
    const lines = formatRepairLog(results);
    expect(lines).toContain('修理');
    expect(lines).toContain('歩兵 +2 (HP8)');
    expect(lines).toContain('歩兵 +1 (HP10)');
    expect(lines).toContain('消費資金: 300');
  });
});
