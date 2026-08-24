import { describe, expect, it } from 'vitest';
import { gridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import { UnitManager } from '@/core/units/UnitManager';
import { computeVisibility, unitVision, Visibility } from '@/core/night/Visibility';
import type { MapDefinition } from '@/data/maps/mapDefinition';
import { getUnitData } from '@/data/unitData';

/** 9x9 全面平地。中央に山と自軍都市を置いた検証用マップ */
const PLAIN_DEF: MapDefinition = {
  name: 'night',
  terrain: [
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
  ],
};

describe('Visibility(昼戦)', () => {
  it('昼戦ではマップ全体が明るく、すべての敵が見える', () => {
    const map = MapManager.fromDefinition(PLAIN_DEF);
    const units = UnitManager.fromPlacements([
      { col: 0, row: 0, unitType: 'infantry', army: 'player' },
      { col: 8, row: 8, unitType: 'mediumTank', army: 'enemy' },
    ]);

    const vision = computeVisibility(map, units, 'player', false);

    expect(vision.isDaylight).toBe(true);
    expect(vision.isLit(gridPosition(8, 0))).toBe(true);
    expect(vision.isUnitVisible(units.getUnitAt(gridPosition(8, 8))!)).toBe(true);
  });

  it('daylightFor はすべてを見える視界を返す', () => {
    const vision = Visibility.daylightFor('player');
    expect(vision.isDaylight).toBe(true);
    expect(vision.isLit(gridPosition(99, 99))).toBe(true);
  });
});

describe('Visibility(夜戦)', () => {
  it('自軍ユニットが1体もいなければ、自軍の拠点マスだけが明るい', () => {
    const def: MapDefinition = {
      name: 'bases',
      terrain: ['c..c.', '.....', '.....'],
      owners: [
        { col: 0, row: 0, owner: 'player' },
        { col: 3, row: 0, owner: 'enemy' },
      ],
    };
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements([]);

    const vision = computeVisibility(map, units, 'player', true);

    // 自軍所有の都市だけが明るい
    expect(vision.isLit(gridPosition(0, 0))).toBe(true);
    // 敵軍所有の拠点も、隣接する平地も暗い
    expect(vision.isLit(gridPosition(3, 0))).toBe(false);
    expect(vision.isLit(gridPosition(1, 0))).toBe(false);
  });

  it('ユニットの周囲が視界のマス数ぶん明るくなる', () => {
    const map = MapManager.fromDefinition(PLAIN_DEF);
    // 戦車の視界は 2
    const units = UnitManager.fromPlacements([
      { col: 4, row: 4, unitType: 'mediumTank', army: 'player' },
    ]);

    const vision = computeVisibility(map, units, 'player', true);

    expect(getUnitData('mediumTank').vision).toBe(2);
    expect(vision.isLit(gridPosition(4, 4))).toBe(true);
    expect(vision.isLit(gridPosition(4, 6))).toBe(true);
    expect(vision.isLit(gridPosition(5, 5))).toBe(true);
    // マンハッタン距離 3 は視界の外
    expect(vision.isLit(gridPosition(4, 7))).toBe(false);
    expect(vision.isLit(gridPosition(6, 5))).toBe(false);
  });

  it('歩兵は山に登ると視界が +3 される', () => {
    const def: MapDefinition = {
      name: 'mountain',
      terrain: ['.........', '.........', '....m....', '.........', '.........'],
    };
    const map = MapManager.fromDefinition(def);
    const onPlain = UnitManager.fromPlacements([
      { col: 0, row: 2, unitType: 'infantry', army: 'player' },
    ]);
    const onMountain = UnitManager.fromPlacements([
      { col: 4, row: 2, unitType: 'infantry', army: 'player' },
    ]);

    expect(unitVision(onPlain.getUnitAt(gridPosition(0, 2))!, map)).toBe(2);
    expect(unitVision(onMountain.getUnitAt(gridPosition(4, 2))!, map)).toBe(5);

    const vision = computeVisibility(map, onMountain, 'player', true);
    // 山の上からは 5 マス先まで明るい
    expect(vision.isLit(gridPosition(8, 2))).toBe(true);
    expect(vision.isLit(gridPosition(4, 0))).toBe(true);
  });

  it('明るいマスにいる敵は見え、暗いマスにいる敵は見えない', () => {
    const map = MapManager.fromDefinition(PLAIN_DEF);
    const units = UnitManager.fromPlacements([
      { col: 4, row: 4, unitType: 'mediumTank', army: 'player' },
      { col: 4, row: 6, unitType: 'infantry', army: 'enemy' },
      { col: 8, row: 8, unitType: 'infantry', army: 'enemy' },
    ]);

    const vision = computeVisibility(map, units, 'player', true);

    expect(vision.isUnitVisible(units.getUnitAt(gridPosition(4, 6))!)).toBe(true);
    expect(vision.isUnitVisible(units.getUnitAt(gridPosition(8, 8))!)).toBe(false);
    expect(vision.isUnitHidden(units.getUnitAt(gridPosition(8, 8))!)).toBe(true);
    // 自軍ユニットは常に見える
    expect(vision.isUnitVisible(units.getUnitAt(gridPosition(4, 4))!)).toBe(true);
  });

  it('潜水艦は視界内でも隣接するまで見えない', () => {
    const def: MapDefinition = {
      name: 'sea',
      terrain: ['~~~~~', '~~~~~', '~~~~~', '~~~~~', '~~~~~'],
    };
    const map = MapManager.fromDefinition(def);
    // 護衛艦の視界は 5 で、距離 2 の潜水艦も視界内に入る
    const units = UnitManager.fromPlacements([
      { col: 0, row: 0, unitType: 'escortShip', army: 'player' },
      { col: 2, row: 0, unitType: 'submarine', army: 'enemy' },
    ]);
    const sub = units.getUnitAt(gridPosition(2, 0))!;

    const farVision = computeVisibility(map, units, 'player', true);
    // 潜水艦のいるマスは明るいのに、隠密ユニットなので見えない
    expect(farVision.isLit(gridPosition(2, 0))).toBe(true);
    expect(farVision.isUnitVisible(sub)).toBe(false);

    // 隣接まで近づくと見える
    units.moveUnit(units.getUnitAt(gridPosition(0, 0))!, gridPosition(1, 0), {
      markActed: false,
    });
    const nearVision = computeVisibility(map, units, 'player', true);
    expect(nearVision.isUnitVisible(sub)).toBe(true);
  });

  it('昼戦では潜水艦も離れた位置から見える', () => {
    const def: MapDefinition = { name: 'sea', terrain: ['~~~~~'] };
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements([
      { col: 0, row: 0, unitType: 'escortShip', army: 'player' },
      { col: 4, row: 0, unitType: 'submarine', army: 'enemy' },
    ]);

    const vision = computeVisibility(map, units, 'player', false);
    expect(vision.isUnitVisible(units.getUnitAt(gridPosition(4, 0))!)).toBe(true);
  });

  it('敵軍から見た視界は自軍とは別に計算される', () => {
    const map = MapManager.fromDefinition(PLAIN_DEF);
    const units = UnitManager.fromPlacements([
      { col: 0, row: 0, unitType: 'infantry', army: 'player' },
      { col: 8, row: 8, unitType: 'mediumTank', army: 'enemy' },
    ]);

    const enemyVision = computeVisibility(map, units, 'enemy', true);
    // 敵軍の戦車の周囲が明るく、離れた自軍歩兵は見えない
    expect(enemyVision.isLit(gridPosition(8, 6))).toBe(true);
    expect(enemyVision.isLit(gridPosition(0, 0))).toBe(false);
    expect(enemyVision.isUnitVisible(units.getUnitAt(gridPosition(0, 0))!)).toBe(false);
    expect(enemyVision.isUnitVisible(units.getUnitAt(gridPosition(8, 8))!)).toBe(true);
  });
});

describe('ユニットごとの視界', () => {
  it('仕様どおりの視界を持つ', () => {
    const vision = (type: Parameters<typeof getUnitData>[0]): number =>
      getUnitData(type).vision;
    expect(vision('infantry')).toBe(2);
    expect(vision('mediumTank')).toBe(2);
    expect(vision('artillery')).toBe(1);
    expect(vision('antiAirTank')).toBe(2);
    expect(vision('transportHelicopter')).toBe(2);
    expect(vision('attackHelicopter')).toBe(3);
    // 偵察車は護衛艦と並ぶ最大の視界
    expect(vision('recon')).toBe(5);
    expect(vision('battleship')).toBe(3);
    expect(vision('escortShip')).toBe(5);
    expect(vision('transportShip')).toBe(1);
    expect(vision('submarine')).toBe(3);
  });

  it('山の視界ボーナスを持つのは歩兵だけ', () => {
    expect(getUnitData('infantry').mountainVisionBonus).toBe(3);
    expect(getUnitData('mediumTank').mountainVisionBonus).toBe(0);
    expect(getUnitData('recon').mountainVisionBonus).toBe(0);
  });

  it('隠密(nightStealth)なのは潜水艦だけ', () => {
    expect(getUnitData('submarine').nightStealth).toBe(true);
    expect(getUnitData('escortShip').nightStealth).toBe(false);
    expect(getUnitData('infantry').nightStealth).toBe(false);
  });
});
