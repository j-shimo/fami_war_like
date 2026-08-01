// 経済(資金・収入)に関するバランスパラメータ。
// CLAUDE.md の方針に従い、調整用の数値はコードから分離したデータとして扱う。
// 詳細な仕様は docs/GameDesign.md「拠点と経済」を参照。

/** ゲーム開始時に各軍が所持する資金 */
export const INITIAL_FUNDS = 10000;

/** 所有する占領拠点 1 つあたり、ターン開始時に得られる収入 */
export const INCOME_PER_BASE = 1000;
