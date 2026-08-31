import { describe, expect, it } from 'vitest';
import { gridPosition } from '@/core/map/GridPosition';
import {
  BattleStatsRecorder,
  emptyBattleStats,
  isBattleStats,
} from '@/core/stats/BattleStats';
import type { AttackResult } from '@/core/battle/BattleManager';
import type { CaptureResult } from '@/core/economy/CaptureSystem';
import { Unit } from '@/core/units/Unit';
import type { ArmyType } from '@/core/map/TerrainType';
import type { UnitType } from '@/core/units/UnitType';
import type { TileData } from '@/core/map/TileData';

/** テスト用のユニットを 1 体作る */
function unit(army: ArmyType, unitType: UnitType = 'infantry', id = 'u1'): Unit {
  return new Unit({ id, unitType, armyType: army, position: gridPosition(0, 0) });
}

/** テスト用の攻撃結果を組み立てる */
function attackResult(
  overrides: Partial<AttackResult> & Pick<AttackResult, 'attacker' | 'defender'>,
): AttackResult {
  return {
    damageDealt: 3,
    counterDamage: 0,
    defenderDefeated: false,
    attackerDefeated: false,
    lostPassengers: [],
    ...overrides,
  };
}

describe('BattleStatsRecorder(戦績の集計)', () => {
  it('初期状態はすべて 0(ターン数は 1)', () => {
    const stats = new BattleStatsRecorder().snapshot();
    expect(stats).toEqual(emptyBattleStats());
    expect(stats.player.defeated).toBe(0);
    expect(stats.turns).toBe(1);
  });

  it('攻撃回数を攻撃側に数える', () => {
    const recorder = new BattleStatsRecorder();
    recorder.recordAttack(
      attackResult({
        attacker: unit('player'),
        defender: unit('enemy', 'infantry', 'u2'),
      }),
    );
    const stats = recorder.snapshot();
    expect(stats.player.attacks).toBe(1);
    expect(stats.enemy.attacks).toBe(0);
  });

  it('撃破は、撃破した側の撃破数と失った側の損失数の両方に数える', () => {
    const recorder = new BattleStatsRecorder();
    recorder.recordAttack(
      attackResult({
        attacker: unit('player'),
        defender: unit('enemy', 'infantry', 'u2'),
        defenderDefeated: true,
      }),
    );
    const stats = recorder.snapshot();
    expect(stats.player.defeated).toBe(1);
    expect(stats.enemy.lost).toBe(1);
    expect(stats.player.lost).toBe(0);
  });

  it('反撃での相打ちと、輸送中ユニットの巻き添えも数える', () => {
    const recorder = new BattleStatsRecorder();
    recorder.recordAttack(
      attackResult({
        attacker: unit('player'),
        defender: unit('enemy', 'transportShip', 'u2'),
        defenderDefeated: true,
        attackerDefeated: true,
        lostPassengers: [unit('enemy', 'infantry', 'u3')],
      }),
    );
    const stats = recorder.snapshot();
    // 敵は輸送艦と積んでいた歩兵の 2 体を失い、自軍は反撃で 1 体を失う
    expect(stats.enemy.lost).toBe(2);
    expect(stats.player.defeated).toBe(2);
    expect(stats.player.lost).toBe(1);
    expect(stats.enemy.defeated).toBe(1);
  });

  it('占領は完了したときだけ数える', () => {
    const recorder = new BattleStatsRecorder();
    const tile = { position: gridPosition(1, 1) } as TileData;
    const progress: CaptureResult = {
      tile,
      unit: unit('player'),
      reduced: 10,
      remainingHp: 10,
      captured: false,
      reset: false,
    };
    recorder.recordCapture(progress);
    expect(recorder.snapshot().player.captured).toBe(0);

    recorder.recordCapture({ ...progress, remainingHp: 0, captured: true });
    expect(recorder.snapshot().player.captured).toBe(1);
  });

  it('生産はユニット数と資金の両方を数える', () => {
    const recorder = new BattleStatsRecorder();
    recorder.recordProduction({ unit: unit('enemy'), cost: 1000 });
    recorder.recordProduction({ unit: unit('enemy', 'mediumTank', 'u2'), cost: 12000 });
    const stats = recorder.snapshot();
    expect(stats.enemy.produced).toBe(2);
    expect(stats.enemy.spent).toBe(13000);
    expect(stats.player.produced).toBe(0);
  });

  it('ターン数は最後に控えた値を返す', () => {
    const recorder = new BattleStatsRecorder();
    recorder.setTurns(12);
    expect(recorder.snapshot().turns).toBe(12);
  });

  it('保存されていた戦績を引き継いで数え続けられる', () => {
    const first = new BattleStatsRecorder();
    first.recordProduction({ unit: unit('player'), cost: 1000 });
    first.setTurns(5);

    const resumed = new BattleStatsRecorder(first.snapshot());
    resumed.recordProduction({ unit: unit('player'), cost: 1000 });
    const stats = resumed.snapshot();
    expect(stats.player.produced).toBe(2);
    expect(stats.player.spent).toBe(2000);
    expect(stats.turns).toBe(5);
  });

  it('スナップショットは呼び出しごとに独立している(あとの集計に影響されない)', () => {
    const recorder = new BattleStatsRecorder();
    const before = recorder.snapshot();
    recorder.recordProduction({ unit: unit('player'), cost: 1000 });
    expect(before.player.produced).toBe(0);
    expect(recorder.snapshot().player.produced).toBe(1);
  });
});

describe('isBattleStats(中断データの検証)', () => {
  it('妥当な戦績を受け付ける', () => {
    expect(isBattleStats(emptyBattleStats())).toBe(true);
  });

  it('欠けている・負の値・小数は受け付けない', () => {
    const valid = emptyBattleStats();
    expect(isBattleStats(undefined)).toBe(false);
    expect(isBattleStats({ ...valid, player: undefined })).toBe(false);
    expect(isBattleStats({ ...valid, turns: 0 })).toBe(false);
    expect(isBattleStats({ ...valid, enemy: { ...valid.enemy, defeated: -1 } })).toBe(
      false,
    );
    expect(isBattleStats({ ...valid, enemy: { ...valid.enemy, spent: 1.5 } })).toBe(
      false,
    );
  });
});
