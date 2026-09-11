// 敵軍AIが輸送ユニットを使って海を渡れることを、実際のマップで通しで確かめるテスト。
// 個々の判断(搭乗・輸送・降車・生産)の単体テストは tests/EnemyAi.test.ts にある。
// ここでは「分断列島マップで、どの指揮官でも最後には海を越えて攻め込んでくる」ことと、
// 「港が 1 つも無い四島空戦マップでは、輸送艦の代わりに輸送ヘリで海を越えてくる」ことを保証する。

import { describe, expect, it } from 'vitest';
import { EnemyAi, type AiAction } from '@/core/ai/EnemyAi';
import { BattleManager } from '@/core/battle/BattleManager';
import { CaptureSystem } from '@/core/economy/CaptureSystem';
import { EconomyManager } from '@/core/economy/EconomyManager';
import { ProductionManager } from '@/core/economy/ProductionManager';
import { MapManager } from '@/core/map/MapManager';
import { distancesFrom } from '@/core/movement/PathDistance';
import { UnitManager } from '@/core/units/UnitManager';
import { AI_CHARACTERS, DEFAULT_AI_CHARACTER } from '@/data/aiCharacters';
import { FOUR_ISLANDS_MAP } from '@/data/maps/fourIslandsMap';
import { ISLAND_MAP } from '@/data/maps/islandMap';
import type { MapDefinition } from '@/data/maps/mapDefinition';

/** 敵軍の本拠地。ここから歩いて行ける範囲が「自分の島」になる */
const ENEMY_HEADQUARTERS = { col: 12, row: 21 };

/**
 * 敵軍AIだけを turns ターンぶん動かし、実行された行動をすべて返す。
 * 自軍は何もしない(ユニットを置かない)ため、AI が自力で戦線を広げられるかだけを見る。
 */
function runEnemyTurns(
  behavior: AI_BEHAVIOR,
  turns: number,
  definition: MapDefinition = ISLAND_MAP,
): AiAction[] {
  const map = MapManager.fromDefinition(definition);
  const units = UnitManager.fromPlacements(definition.units ?? [], map);
  const economy = new EconomyManager();
  economy.setFunds('enemy', definition.initialFunds ?? 0);
  const battle = new BattleManager(map, units);
  const capture = new CaptureSystem();
  const production = new ProductionManager(map, units, economy);
  const ai = new EnemyAi({ map, units, battle, capture, production, behavior });

  const actions: AiAction[] = [];
  for (let turn = 1; turn <= turns; turn++) {
    economy.collectIncome('enemy', map);
    for (const unit of units.getUnitsByArmy('enemy')) {
      unit.hasActed = false;
    }
    actions.push(...ai.run());
  }
  return actions;
}

type AI_BEHAVIOR = (typeof AI_CHARACTERS)[number]['behavior'];

describe('分断列島マップでの敵軍AIの海越え', () => {
  // 歩兵が敵軍本拠地から歩いて行ける範囲(＝敵軍の島)。
  // ここから外れたマスへ降ろせていれば、海を越えたことになる。
  const homeIsland = distancesFrom(
    MapManager.fromDefinition(ISLAND_MAP),
    ENEMY_HEADQUARTERS,
    'infantry',
  );

  for (const character of AI_CHARACTERS) {
    it(`${character.name} は輸送艦を作り、歩兵を乗せて自分の島の外へ降ろす`, () => {
      const actions = runEnemyTurns(character.behavior, 40);

      const produced = actions.filter((action) => action.kind === 'produce');
      expect(
        produced.some((action) => action.result.unit.unitType === 'transportShip'),
      ).toBe(true);

      expect(actions.some((action) => action.kind === 'board')).toBe(true);

      const landings = actions.filter(
        (action) =>
          action.kind === 'unload' && homeIsland.get(action.droppedAt) === undefined,
      );
      expect(landings.length).toBeGreaterThan(0);
    });
  }
});

describe('四島空戦マップでの敵軍AIの海越え', () => {
  // 港が 1 つも無いマップなので、AI が海を渡る足は空港で作る輸送ヘリだけになる。
  // 歩兵が敵軍本拠地 (30,8) から歩いて行ける範囲(＝敵軍の島)の外へ降ろせていれば、海を越えたことになる。
  const homeIsland = distancesFrom(
    MapManager.fromDefinition(FOUR_ISLANDS_MAP),
    { col: 30, row: 8 },
    'infantry',
  );

  it('輸送ヘリを作り、歩兵を乗せて自分の島の外(中立島・自軍の島)へ降ろす', () => {
    const actions = runEnemyTurns(DEFAULT_AI_CHARACTER.behavior, 40, FOUR_ISLANDS_MAP);

    const produced = actions.filter((action) => action.kind === 'produce');
    expect(
      produced.some((action) => action.result.unit.unitType === 'transportHelicopter'),
    ).toBe(true);
    // 港が無いので海上ユニットは 1 隻も作れない
    expect(
      produced.some((action) => action.result.unit.unitType === 'transportShip'),
    ).toBe(false);

    expect(actions.some((action) => action.kind === 'board')).toBe(true);

    const landings = actions.filter(
      (action) =>
        action.kind === 'unload' && homeIsland.get(action.droppedAt) === undefined,
    );
    expect(landings.length).toBeGreaterThan(0);

    // 降ろした歩兵が中立拠点を占領して戦線を広げられている
    expect(actions.filter((action) => action.kind === 'capture').length).toBeGreaterThan(
      0,
    );
  });
});
