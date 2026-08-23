// 移動演出のタイムライン(ルート追従の所要時間と、夜戦の遭遇演出の尺)の検証。

import { describe, expect, it } from 'vitest';
import { gridPosition, type GridPosition } from '@/core/map/GridPosition';
import {
  buildMoveSequence,
  ENCOUNTER_HOLD_MS,
  MOVE_STEP_MS,
} from '@/rendering/moveSequence';

/** 横一列に並ぶ経路を作る(先頭は開始マス) */
function road(cols: number): GridPosition[] {
  return Array.from({ length: cols }, (_, col) => gridPosition(col, 0));
}

describe('buildMoveSequence', () => {
  it('1 マスあたり MOVE_STEP_MS かけて走る', () => {
    // 開始マス + 3 マスぶんの経路 = 3 歩
    const sequence = buildMoveSequence(road(4), false);

    expect(sequence.steps).toBe(3);
    expect(sequence.travelMs).toBe(3 * MOVE_STEP_MS);
    expect(sequence.endAt).toBe(sequence.travelMs);
  });

  it('その場に留まるときは走る演出がない', () => {
    const sequence = buildMoveSequence(road(1), false);

    expect(sequence.steps).toBe(0);
    expect(sequence.travelMs).toBe(0);
    expect(sequence.endAt).toBe(0);
  });

  it('見えない敵に阻まれたときは、走り終えたあとに遭遇演出の尺が加わる', () => {
    const sequence = buildMoveSequence(road(3), true);

    expect(sequence.encounterHoldMs).toBe(ENCOUNTER_HOLD_MS);
    expect(sequence.endAt).toBe(sequence.travelMs + ENCOUNTER_HOLD_MS);
  });

  it('阻まれていなければ遭遇演出の尺は入らない', () => {
    expect(buildMoveSequence(road(3), false).encounterHoldMs).toBe(0);
  });
});
