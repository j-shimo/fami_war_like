// 選択マスの地形情報を表示用テキストに整形する。Phaser には依存しない純粋な関数。

import type { ArmyType } from '@/core/map/TerrainType';
import { INITIAL_CAPTURE_HP, type TileData } from '@/core/map/TileData';
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
 * 占領耐久値の表示テキスト。占領が進行中のときは、
 * どの軍が占領を進めているのかも併せて示す(自軍・敵軍の占領値は別管理)。
 */
export function captureHpLabel(tile: TileData): string {
  if (tile.captureArmy !== null && tile.captureHp < INITIAL_CAPTURE_HP) {
    return `占領耐久: ${tile.captureHp} (${armyLabel(tile.captureArmy)}が占領中)`;
  }
  return `占領耐久: ${tile.captureHp}`;
}

/** formatTerrainInfo の表示オプション */
export interface TerrainInfoOptions {
  /**
   * 簡略表示。座標・移動コストを省いて行数を減らす。
   * 同じマスにユニットがいてユニット情報と併記する場合に使い、
   * 占領耐久などの重要な情報がパネル下部のボタンに隠れないようにする。
   */
  compact?: boolean;
}

/**
 * 選択中マスの地形情報を複数行のテキストとして返す。
 * 情報パネルへの表示に使う。
 */
export function formatTerrainInfo(
  tile: TileData,
  options: TerrainInfoOptions = {},
): string[] {
  const data = getTerrainData(tile.terrainType);
  const lines = [`地形: ${data.terrainName}`];

  if (!options.compact) {
    lines.push(`座標: (${tile.position.col}, ${tile.position.row})`);
  }
  lines.push(`防御: ${data.defense}`);
  if (!options.compact) {
    lines.push(`移動コスト 歩兵: ${moveCostLabel(data.moveCost.infantry)}`);
    lines.push(`移動コスト 車両: ${moveCostLabel(data.moveCost.vehicle)}`);
    // 偵察車は車両と移動コストが大きく異なる(道路・拠点は 1、平地 2、海岸 4、森・山は進入不可)
    lines.push(`移動コスト 偵察: ${moveCostLabel(data.moveCost.recon)}`);
    // 海上ユニットが進入できる地形(海・港)だけ、海上の移動コストも併記する。
    // 進入できない地形では自明に「×」なので、行数を増やさないために省略する。
    if (data.moveCost.sea !== null) {
      lines.push(`移動コスト 海上: ${moveCostLabel(data.moveCost.sea)}`);
    }
  }

  if (data.canCapture) {
    lines.push(`所有: ${armyLabel(tile.owner)}`);
    lines.push(captureHpLabel(tile));
    lines.push(`生産: ${data.canProduce ? '可' : '不可'}`);
  }

  return lines;
}
