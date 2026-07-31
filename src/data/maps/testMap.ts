// MVP 用の 10x10 テストマップ。CLAUDE.md の方針に従いオリジナルの地形配置とする。
// 上側(row 0 付近)を敵軍、下側(row 9 付近)を自軍の陣地として配置している。

import type { MapDefinition } from '@/data/maps/mapDefinition';

export const TEST_MAP: MapDefinition = {
  name: 'テストマップ 01',
  terrain: [
    '...HFc....',
    '..f.....f.',
    'c..rrrr...',
    '...rmmr.f.',
    '.f.rmmr...',
    '...rmmr.f.',
    '...rrrr..c',
    '.f....r...',
    '........f.',
    '....cFH...',
  ],
  owners: [
    // 敵軍の陣地(上)
    { col: 3, row: 0, owner: 'enemy' }, // 本拠地
    { col: 4, row: 0, owner: 'enemy' }, // 工場
    { col: 5, row: 0, owner: 'enemy' }, // 都市
    // 自軍の陣地(下)
    { col: 6, row: 9, owner: 'player' }, // 本拠地
    { col: 5, row: 9, owner: 'player' }, // 工場
    { col: 4, row: 9, owner: 'player' }, // 都市
  ],
};
