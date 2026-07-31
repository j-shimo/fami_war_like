// 選択マスの地形情報を表示用テキストに整形する。Phaser には依存しない純粋な関数。

import type { ArmyType } from '@/core/map/TerrainType';
import type { TileData } from '@/core/map/TileData';
import { getTerrainData } from '@/data/terrainData';

/** 所有軍の表示名 */
export function armyLabel(owner: ArmyType): string {
  switch (owner) {
    case 'player':
      return '自軍';
    case 'enemy':
      return '敵軍';
    case 'neutral':
      return '中立';
  }
}

/** 移動コスト値の表示テキスト(進入不可は「×」) */
function moveCostLabel(cost: number | null): string {
  return cost === null ? '×' : String(cost);
}

/**
 * 選択中マスの地形情報を複数行のテキストとして返す。
 * 情報パネルへの表示に使う。
 */
export function formatTerrainInfo(tile: TileData): string[] {
  const data = getTerrainData(tile.terrainType);
  const lines = [
    `地形: ${data.terrainName}`,
    `座標: (${tile.position.col}, ${tile.position.row})`,
    `防御: ${data.defense}`,
    `移動コスト 歩兵: ${moveCostLabel(data.moveCost.infantry)}`,
    `移動コスト 車両: ${moveCostLabel(data.moveCost.vehicle)}`,
  ];

  if (data.canCapture) {
    lines.push(`所有: ${armyLabel(tile.owner)}`);
    lines.push(`占領耐久: ${tile.captureHp}`);
    lines.push(`生産: ${data.canProduce ? '可' : '不可'}`);
  }

  return lines;
}
