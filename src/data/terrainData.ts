// 地形ごとの静的パラメータ定義。バランス調整用の数値はここに集約して外部化する。
// 詳細な仕様は docs/TerrainSpec.md を参照。

import type { MovementType, TerrainType } from '@/core/map/TerrainType';

/**
 * 移動コストの特別値: 該当移動タイプが進入できないことを表す。
 * docs/TerrainSpec.md の方針に従い、-1 などの魔法数ではなく null で管理する。
 */
export const IMPASSABLE = null;

/** 地形 1 種類ぶんの静的パラメータ */
export interface TerrainData {
  /** 地形種別 */
  readonly terrainType: TerrainType;
  /** 表示名(日本語) */
  readonly terrainName: string;
  /** 防御値。戦闘時の被ダメージ軽減に使う */
  readonly defense: number;
  /** 占領可能な拠点かどうか */
  readonly canCapture: boolean;
  /** ユニットを生産できるかどうか */
  readonly canProduce: boolean;
  /** 移動タイプ別の移動コスト。null(IMPASSABLE) は進入不可 */
  readonly moveCost: Readonly<Record<MovementType, number | null>>;
  /** 描画時の塗り色 */
  readonly color: number;
}

/** 全地形の静的パラメータ表 */
export const TERRAIN_DATA: Readonly<Record<TerrainType, TerrainData>> = {
  plain: {
    terrainType: 'plain',
    terrainName: '平地',
    defense: 1,
    canCapture: false,
    canProduce: false,
    moveCost: { infantry: 1, vehicle: 1 },
    color: 0x6b8f3a,
  },
  forest: {
    terrainType: 'forest',
    terrainName: '森',
    defense: 2,
    canCapture: false,
    canProduce: false,
    moveCost: { infantry: 1, vehicle: 2 },
    color: 0x2f5d34,
  },
  mountain: {
    terrainType: 'mountain',
    terrainName: '山',
    defense: 3,
    canCapture: false,
    canProduce: false,
    moveCost: { infantry: 2, vehicle: IMPASSABLE },
    color: 0x8a6a45,
  },
  road: {
    terrainType: 'road',
    terrainName: '道路',
    defense: 0,
    canCapture: false,
    canProduce: false,
    moveCost: { infantry: 1, vehicle: 1 },
    color: 0xb7a98a,
  },
  city: {
    terrainType: 'city',
    terrainName: '都市',
    defense: 2,
    canCapture: true,
    canProduce: false,
    moveCost: { infantry: 1, vehicle: 1 },
    color: 0x9a9aa8,
  },
  factory: {
    terrainType: 'factory',
    terrainName: '工場',
    defense: 2,
    canCapture: true,
    canProduce: true,
    moveCost: { infantry: 1, vehicle: 1 },
    color: 0x7a7a86,
  },
  headquarters: {
    terrainType: 'headquarters',
    terrainName: '本拠地',
    defense: 3,
    canCapture: true,
    canProduce: true,
    moveCost: { infantry: 1, vehicle: 1 },
    color: 0xc0603a,
  },
};

/** 指定した地形種別の静的パラメータを返す */
export function getTerrainData(terrainType: TerrainType): TerrainData {
  return TERRAIN_DATA[terrainType];
}
