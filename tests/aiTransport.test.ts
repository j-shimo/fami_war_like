// 敵軍AIが輸送ユニットを使って海を渡れることを、実際のマップで通しで確かめるテスト。
// 個々の判断(搭乗・輸送・降車・生産)の単体テストは tests/EnemyAi.test.ts にある。
// ここでは「分断列島マップで、どの指揮官でも最後には海を越えて攻め込んでくる」ことを保証する。

import { describe, expect, it } from 'vitest';
import { EnemyAi, type AiAction } from '@/core/ai/EnemyAi';
import { BattleManager } from '@/core/battle/BattleManager';
import { CaptureSystem } from '@/core/economy/CaptureSystem';
import { EconomyManager } from '@/core/economy/EconomyManager';
import { ProductionManager } from '@/core/economy/ProductionManager';
import { MapManager } from '@/core/map/MapManager';
import { distancesFrom } from '@/core/movement/PathDistance';
import { UnitManager } from '@/core/units/UnitManager';
import { AI_CHARACTERS } from '@/data/aiCharacters';
import { ISLAND_MAP } from '@/data/maps/islandMap';

/** 敵軍の本拠地。ここから歩いて行ける範囲が「自分の島」になる */
const ENEMY_HEADQUARTERS = { col: 12, row: 21 };

/**
 * 敵軍AIだけを turns ターンぶん動かし、実行された行動をすべて返す。
 * 自軍は何もしない(ユニットを置かない)ため、AI が自力で戦線を広げられるかだけを見る。
 */
function runEnemyTurns(behavior: AI_BEHAVIOR, turns: number): AiAction[] {
  const map = MapManager.fromDefinition(ISLAND_MAP);
  const units = UnitManager.fromPlacements(ISLAND_MAP.units ?? [], map);
  const economy = new EconomyManager();
  economy.setFunds('enemy', ISLAND_MAP.initialFunds ?? 0);
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
