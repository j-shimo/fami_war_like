// 指揮官(自軍・対戦相手のキャラクター)による戦闘補正を、軍ごとの数値としてまとめて持つ。
// Phaser には依存しない純粋なデータと関数。
// 自軍の指揮官と対戦相手の指揮官はマップ選択画面で別々に選べるため、補正も軍ごとに分けて持つ。
// いまのところ補正は「攻撃力の割増し」だけで、ダメージ計算(DamageCalculator)から参照する。
// docs/GameDesign.md「指揮官の攻撃補正」を参照。

import type { ArmyType } from '@/core/map/TerrainType';
import type { TurnArmy } from '@/core/turn/TurnManager';

/**
 * 軍ごとの攻撃補正。0.1 なら「その軍の全ユニットの攻撃力 +10%」を表す。
 * 0 は補正なし(これまでどおりの計算)。
 */
export type CommanderBonus = Readonly<Record<TurnArmy, number>>;

/** どちらの軍にも補正がかからない状態(指揮官の補正を考えない場合の既定値) */
export const NO_COMMANDER_BONUS: CommanderBonus = { player: 0, enemy: 0 };

/**
 * 指定の軍にかかる攻撃補正を返す。
 * 中立(拠点の所有者としてのみ使う値)には補正がないため 0 を返す。
 */
export function attackBonusOf(bonus: CommanderBonus, army: ArmyType): number {
  return army === 'player' || army === 'enemy' ? bonus[army] : 0;
}
