// MVP 用の 10x10 テストマップ。CLAUDE.md の方針に従いオリジナルの地形配置とする。
// 上側(row 0 付近)を敵軍、下側(row 9 付近)を自軍の陣地として配置している。

import type { MapDefinition } from '@/data/maps/mapDefinition';

export const TEST_MAP: MapDefinition = {
  name: 'テストマップ 01',
  terrain: [
    '..AHFc....',
    '..f.....f.',
    'c..rrrr...',
    '...rmmr.f.',
    '.f.rmmr...',
    '...rmmr.f.',
    '...rrrr..c',
    '.f....r...',
    '........f.',
    '....cFHA..',
  ],
  owners: [
    // 敵軍の陣地(上)。空港では飛行ユニット(戦闘ヘリ・輸送ヘリ)を生産できる。
    { col: 3, row: 0, owner: 'enemy' }, // 本拠地
    { col: 4, row: 0, owner: 'enemy' }, // 工場
    { col: 5, row: 0, owner: 'enemy' }, // 都市
    { col: 2, row: 0, owner: 'enemy' }, // 空港
    // 自軍の陣地(下)。空港では飛行ユニット(戦闘ヘリ・輸送ヘリ)を生産できる。
    { col: 6, row: 9, owner: 'player' }, // 本拠地
    { col: 5, row: 9, owner: 'player' }, // 工場
    { col: 4, row: 9, owner: 'player' }, // 都市
    { col: 7, row: 9, owner: 'player' }, // 空港
  ],
  units: [
    // 敵軍の初期部隊(上、row 1 付近)
    { col: 2, row: 1, unitType: 'infantry', army: 'enemy' },
    { col: 3, row: 1, unitType: 'tank', army: 'enemy' },
    { col: 4, row: 1, unitType: 'artillery', army: 'enemy' },
    // 自軍の初期部隊(下、row 8 付近)
    { col: 5, row: 8, unitType: 'infantry', army: 'player' },
    { col: 6, row: 8, unitType: 'tank', army: 'player' },
    { col: 7, row: 8, unitType: 'artillery', army: 'player' },
  ],
};
