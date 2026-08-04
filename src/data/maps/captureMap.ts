// 「拠点の取り合い」をコンセプトにした 10x15(縦10・横15)の左右対称マップ。
// CLAUDE.md の方針に従い、地形配置・拠点配置はすべてオリジナルとする。
//
// レイアウト概要:
//   - 左端(col 0〜1)を自軍、右端(col 13〜14)を敵軍の本拠地とし、左右に分かれて対峙する。
//   - 盤面中央に中立拠点を密集させる(中央工場 1・中立都市 6)。ここを奪い合うのが主眼。
//   - 中央を横断する道路(row 5)の両脇に山を置き、車両が通る狭い回廊(チョークポイント)を作る。
//
// 初期資金は 0。序盤は本拠地・工場・都市の収入のみで、中立拠点を占領して収入を伸ばすほど
// 高価なユニットを生産できるようになる。占領テンポがそのまま戦力差につながる設計。

import type { MapDefinition } from '@/data/maps/mapDefinition';

export const CAPTURE_MAP: MapDefinition = {
  name: '拠点争奪マップ 01',
  terrain: [
    '..f.........f..',
    '...f...c...f...',
    '....c..r..c....',
    '....r.frf.r....',
    '.F..r.mrm.r..F.',
    'HrrrrrrFrrrrrrH',
    '.c..r.mrm.r..c.',
    '....c.frf.c....',
    '...f...c...f...',
    '..f.........f..',
  ],
  owners: [
    // 自軍の陣地(左)
    { col: 0, row: 5, owner: 'player' }, // 本拠地
    { col: 1, row: 4, owner: 'player' }, // 工場
    { col: 1, row: 6, owner: 'player' }, // 都市
    // 敵軍の陣地(右)
    { col: 14, row: 5, owner: 'enemy' }, // 本拠地
    { col: 13, row: 4, owner: 'enemy' }, // 工場
    { col: 13, row: 6, owner: 'enemy' }, // 都市
    // 中央の中立工場・中立都市は owners 未指定のため neutral のまま(取り合いの対象)
  ],
  units: [
    // 自軍の初期部隊(左、col 2 付近)
    { col: 2, row: 4, unitType: 'infantry', army: 'player' },
    { col: 2, row: 5, unitType: 'tank', army: 'player' },
    { col: 2, row: 6, unitType: 'artillery', army: 'player' },
    // 敵軍の初期部隊(右、col 12 付近)
    { col: 12, row: 4, unitType: 'infantry', army: 'enemy' },
    { col: 12, row: 5, unitType: 'tank', army: 'enemy' },
    { col: 12, row: 6, unitType: 'artillery', army: 'enemy' },
  ],
  initialFunds: 0,
};
