import { describe, expect, it } from 'vitest';
import { EconomyManager } from '@/core/economy/EconomyManager';
import { MapManager } from '@/core/map/MapManager';
import type { MapDefinition } from '@/data/maps/mapDefinition';

// 拠点構成を固定した小さなテストマップ。
// 自軍: 本拠地・工場・都市の 3 拠点、敵軍: 都市の 1 拠点。
const ECONOMY_MAP: MapDefinition = {
  name: '経済テストマップ',
  terrain: ['HFc', '..c', '...'],
  owners: [
    { col: 0, row: 0, owner: 'player' }, // 本拠地
    { col: 1, row: 0, owner: 'player' }, // 工場
    { col: 2, row: 0, owner: 'player' }, // 都市
    { col: 2, row: 1, owner: 'enemy' }, // 都市
  ],
};

describe('EconomyManager', () => {
  it('初期資金を保持する', () => {
    const economy = new EconomyManager({ initialFunds: 5000 });
    expect(economy.getFunds('player')).toBe(5000);
    expect(economy.getFunds('enemy')).toBe(5000);
  });

  it('資金を加算・消費できる', () => {
    const economy = new EconomyManager({ initialFunds: 1000 });
    economy.addFunds('player', 500);
    expect(economy.getFunds('player')).toBe(1500);
    economy.spend('player', 300);
    expect(economy.getFunds('player')).toBe(1200);
  });

  it('残高不足の消費は例外を投げる', () => {
    const economy = new EconomyManager({ initialFunds: 100 });
    expect(economy.canAfford('player', 200)).toBe(false);
    expect(() => economy.spend('player', 200)).toThrow();
  });

  it('getIncome は資金を加算せずに収入額だけを返す', () => {
    const map = MapManager.fromDefinition(ECONOMY_MAP);
    const economy = new EconomyManager({ initialFunds: 0, incomePerBase: 1000 });
    // 自軍は 3 拠点、敵軍は 1 拠点
    expect(economy.getIncome('player', map)).toBe(3000);
    expect(economy.getIncome('enemy', map)).toBe(1000);
    // 表示用の計算なので資金は変わらない
    expect(economy.getFunds('player')).toBe(0);
    expect(economy.getFunds('enemy')).toBe(0);
    // 実際の計上は collectIncome が行い、同じ額を加算する
    expect(economy.collectIncome('player', map)).toBe(3000);
    expect(economy.getFunds('player')).toBe(3000);
  });

  it('所有拠点数を軍ごとに数える', () => {
    const map = MapManager.fromDefinition(ECONOMY_MAP);
    const economy = new EconomyManager();
    expect(economy.countBases('player', map)).toBe(3);
    expect(economy.countBases('enemy', map)).toBe(1);
  });

  it('空港も占領拠点として収入に数える(都市と同様)', () => {
    // 自軍: 都市 1・空港 1 の 2 拠点を所有する
    const airportMap: MapDefinition = {
      name: '空港テストマップ',
      terrain: ['cA', '..'],
      owners: [
        { col: 0, row: 0, owner: 'player' }, // 都市
        { col: 1, row: 0, owner: 'player' }, // 空港
      ],
    };
    const map = MapManager.fromDefinition(airportMap);
    const economy = new EconomyManager({ initialFunds: 0, incomePerBase: 1000 });
    expect(economy.countBases('player', map)).toBe(2);
    expect(economy.collectIncome('player', map)).toBe(2000);
  });

  it('収入は所有拠点数×拠点あたり収入で加算される', () => {
    const map = MapManager.fromDefinition(ECONOMY_MAP);
    const economy = new EconomyManager({ initialFunds: 0, incomePerBase: 1000 });
    const income = economy.collectIncome('player', map);
    expect(income).toBe(3000);
    expect(economy.getFunds('player')).toBe(3000);
    // 敵軍は 1 拠点ぶんのみ
    expect(economy.collectIncome('enemy', map)).toBe(1000);
  });
});
