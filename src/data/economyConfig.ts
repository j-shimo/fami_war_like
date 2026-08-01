// 経済(資金・収入)に関するバランスパラメータ。
// CLAUDE.md の方針に従い、調整用の数値はコードから分離したデータとして扱う。
// 詳細な仕様は docs/GameDesign.md「拠点と経済」を参照。

/** ゲーム開始時に各軍が所持する資金 */
export const INITIAL_FUNDS = 10000;

/** 所有する占領拠点 1 つあたり、ターン開始時に得られる収入 */
export const INCOME_PER_BASE = 1000;

/**
 * ターン開始時の修理で 1 ターンあたり回復する最大 HP。
 * 残り HP 差がこれより小さい場合(例: HP9)は差ぶんだけ回復する。
 * 1 HP あたりの修理費は「生産コスト ÷ 最大 HP」で算出する(RepairManager 参照)。
 */
export const REPAIR_HP_PER_TURN = 2;
