import { describe, expect, it } from 'vitest';
import { EconomyManager } from '@/core/economy/EconomyManager';
import { RepairManager } from '@/core/economy/RepairManager';
import { gridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import { UnitManager } from '@/core/units/UnitManager';
import type { MapDefinition } from '@/data/maps/mapDefinition';
import { getUnitData } from '@/data/unitData';

// (0,0)自軍都市・(1,0)自軍工場・(2,0)敵軍本拠地・(0,1)中立都市・平地を持つテストマップ。
const REPAIR_MAP: MapDefinition = {
  name: '修理テストマップ',
  terrain: ['cFH', 'c..', '...'],
  owners: [
    { col: 0, row: 0, owner: 'player' },
    { col: 1, row: 0, owner: 'player' },
    { col: 2, row: 0, owner: 'enemy' },
    // (0,1) は中立都市のまま
  ],
};

function setup(initialFunds = 10000) {
  const map = MapManager.fromDefinition(REPAIR_MAP);
  const units = UnitManager.fromPlacements([], map);
  const economy = new EconomyManager({ initialFunds });
  const repair = new RepairManager(map, units, economy);
  return { map, units, economy, repair };
}

/** 指定マスに指定 HP の自軍歩兵を生成して配置する */
function placeInfantry(units: UnitManager, col: number, row: number, hp: number) {
  const unit = units.spawnUnit({
    unitType: 'infantry',
    army: 'player',
    position: gridPosition(col, row),
  });
  unit.currentHp = hp;
  return unit;
}

describe('RepairManager', () => {
  it('自軍拠点上のダメージユニットは修理対象になる', () => {
    const { units, repair } = setup();
    const unit = placeInfantry(units, 0, 0, 7);
    expect(repair.canRepair(unit, 'player')).toBe(true);
  });

  it('ダメージを受けていないユニットは修理対象外', () => {
    const { units, repair } = setup();
    const unit = placeInfantry(units, 0, 0, 10);
    expect(repair.canRepair(unit, 'player')).toBe(false);
  });

  it('拠点でない地形の上では修理できない', () => {
    const { units, repair } = setup();
    const unit = placeInfantry(units, 2, 2, 5); // 平地
    expect(repair.canRepair(unit, 'player')).toBe(false);
  });

  it('中立・敵軍所有の拠点上では修理できない', () => {
    const { units, repair } = setup();
    const neutral = placeInfantry(units, 0, 1, 5); // 中立都市
    const enemyHq = placeInfantry(units, 2, 0, 5); // 敵軍本拠地
    expect(repair.canRepair(neutral, 'player')).toBe(false);
    expect(repair.canRepair(enemyHq, 'player')).toBe(false);
  });

  it('回復量は 1 ターンあたり最大 2、残り HP 差でクランプされる', () => {
    const { units, repair } = setup();
    expect(repair.getRepairAmount(placeInfantry(units, 0, 0, 5))).toBe(2);
    expect(repair.getRepairAmount(placeInfantry(units, 1, 0, 9))).toBe(1);
  });

  it('修理費は「生産コスト ÷ 最大HP × 回復量」で、HP9 は半額になる', () => {
    const { units, repair } = setup();
    const cost = getUnitData('infantry').cost; // 1000, maxHp 10 → 1HP=100
    expect(repair.getRepairCost(placeInfantry(units, 0, 0, 5))).toBe(cost / 5); // 2HP=200
    expect(repair.getRepairCost(placeInfantry(units, 1, 0, 9))).toBe(cost / 10); // 1HP=100(半額)
  });

  it('repairAll でダメージユニットが回復し資金が減る', () => {
    const { units, economy, repair } = setup(10000);
    const unit = placeInfantry(units, 0, 0, 6);
    const results = repair.repairAll('player');

    expect(results).toHaveLength(1);
    expect(unit.currentHp).toBe(8);
    expect(results[0].healedHp).toBe(2);
    expect(results[0].cost).toBe(200);
    expect(economy.getFunds('player')).toBe(10000 - 200);
  });

  it('HP9 の修理は +1 で最大 HP に戻り、費用は半額になる', () => {
    const { units, economy, repair } = setup(10000);
    const unit = placeInfantry(units, 0, 0, 9);
    const results = repair.repairAll('player');

    expect(unit.currentHp).toBe(10);
    expect(results[0].healedHp).toBe(1);
    expect(results[0].cost).toBe(100);
    expect(economy.getFunds('player')).toBe(10000 - 100);
  });

  it('資金が足りないユニットは修理せずスキップする', () => {
    const { units, economy, repair } = setup(50); // 200 に満たない
    const unit = placeInfantry(units, 0, 0, 6);
    const results = repair.repairAll('player');

    expect(results).toHaveLength(0);
    expect(unit.currentHp).toBe(6);
    expect(economy.getFunds('player')).toBe(50);
  });

  it('複数ユニットをまとめて修理し、資金が尽きたら残りをスキップする', () => {
    const { units, economy, repair } = setup(300); // 200 + 200 は払えない
    const first = placeInfantry(units, 0, 0, 6);
    const second = placeInfantry(units, 1, 0, 6);
    const results = repair.repairAll('player');

    // 先頭ユニットのみ修理され、資金 100 では 2 体目は修理できない
    expect(results).toHaveLength(1);
    expect(first.currentHp).toBe(8);
    expect(second.currentHp).toBe(6);
    expect(economy.getFunds('player')).toBe(100);
  });
});
