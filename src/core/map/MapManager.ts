// マップ全体の状態を管理する。Phaser には依存しない純粋なロジックとして実装し、
// 描画側(Scene)からはこのクラスを介してマス情報にアクセスする。

import { gridPosition, isInBounds, type GridPosition } from '@/core/map/GridPosition';
import type { MovementType, TerrainType } from '@/core/map/TerrainType';
import { INITIAL_CAPTURE_HP, type TileData } from '@/core/map/TileData';
import { getTerrainData, type TerrainData } from '@/data/terrainData';
import {
  SYMBOL_TO_TERRAIN,
  type MapDefinition,
  type TerrainSymbol,
} from '@/data/maps/mapDefinition';

/** マップ定義からタイル状態を構築し、マス情報の参照を提供する */
export class MapManager {
  readonly cols: number;
  readonly rows: number;
  readonly name: string;

  /** [row][col] でアクセスするタイル配列 */
  private readonly tiles: TileData[][];

  private constructor(name: string, tiles: TileData[][]) {
    this.name = name;
    this.tiles = tiles;
    this.rows = tiles.length;
    this.cols = tiles[0]?.length ?? 0;
  }

  /** マップ定義から MapManager を生成する */
  static fromDefinition(def: MapDefinition): MapManager {
    const rows = def.terrain.length;
    if (rows === 0) {
      throw new Error('マップ定義に地形行がありません');
    }

    const cols = def.terrain[0].length;
    const tiles: TileData[][] = def.terrain.map((line, row) => {
      if (line.length !== cols) {
        throw new Error(
          `マップの行の長さが不揃いです(row ${row}: ${line.length} 文字、期待値 ${cols})`,
        );
      }
      return Array.from(line).map((char, col) => {
        const terrainType = MapManager.symbolToTerrain(char, col, row);
        return {
          position: gridPosition(col, row),
          terrainType,
          owner: 'neutral',
          captureHp: INITIAL_CAPTURE_HP,
          captureArmy: null,
        } satisfies TileData;
      });
    });

    // 所有者オーバーライドを適用する
    for (const override of def.owners ?? []) {
      if (!isInBounds(gridPosition(override.col, override.row), cols, rows)) {
        throw new Error(
          `所有者指定がマップ範囲外です(col ${override.col}, row ${override.row})`,
        );
      }
      const tile = tiles[override.row][override.col];
      const data = getTerrainData(tile.terrainType);
      if (!data.canCapture) {
        throw new Error(
          `占領できない地形に所有者が指定されています(col ${override.col}, row ${override.row}, ${tile.terrainType})`,
        );
      }
      tile.owner = override.owner;
    }

    return new MapManager(def.name, tiles);
  }

  private static symbolToTerrain(char: string, col: number, row: number): TerrainType {
    const terrainType = SYMBOL_TO_TERRAIN[char as TerrainSymbol];
    if (terrainType === undefined) {
      throw new Error(`未知の地形記号です(col ${col}, row ${row}: '${char}')`);
    }
    return terrainType;
  }

  /** 指定座標がマップ範囲内かどうか */
  isInBounds(pos: GridPosition): boolean {
    return isInBounds(pos, this.cols, this.rows);
  }

  /** 指定座標のタイルを返す。範囲外なら undefined */
  getTile(pos: GridPosition): TileData | undefined {
    if (!this.isInBounds(pos)) {
      return undefined;
    }
    return this.tiles[pos.row][pos.col];
  }

  /** 指定座標の地形パラメータを返す。範囲外なら undefined */
  getTerrainData(pos: GridPosition): TerrainData | undefined {
    const tile = this.getTile(pos);
    return tile ? getTerrainData(tile.terrainType) : undefined;
  }

  /**
   * 指定座標への移動コストを返す。
   * 進入不可、または範囲外の場合は null を返す。
   */
  getMoveCost(pos: GridPosition, movementType: MovementType): number | null {
    const data = this.getTerrainData(pos);
    if (!data) {
      return null;
    }
    return data.moveCost[movementType];
  }

  /** すべてのタイルを row → col の順に走査する */
  forEachTile(callback: (tile: TileData) => void): void {
    for (const rowTiles of this.tiles) {
      for (const tile of rowTiles) {
        callback(tile);
      }
    }
  }
}
