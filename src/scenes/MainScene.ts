import Phaser from 'phaser';
import { equals, type GridPosition } from '@/core/map/GridPosition';
import { gridToWorld, gridToWorldCenter, worldToGrid } from '@/core/map/coordinates';
import { MapManager } from '@/core/map/MapManager';
import type { ArmyType } from '@/core/map/TerrainType';
import type { TileData } from '@/core/map/TileData';
import { UnitManager } from '@/core/units/UnitManager';
import {
  GAME_HEIGHT,
  INFO_PANEL_WIDTH,
  MAP_HEIGHT,
  MAP_WIDTH,
  TILE_SIZE,
} from '@/data/gameConfig';
import { TEST_MAP } from '@/data/maps/testMap';
import { getTerrainData } from '@/data/terrainData';
import { formatTerrainInfo } from '@/ui/terrainInfo';
import { formatUnitInfo } from '@/ui/unitInfo';

/** 占領地形の所有者を示す枠の色 */
const OWNER_COLOR: Record<'player' | 'enemy' | 'neutral', number> = {
  player: 0x3a7bd5,
  enemy: 0xd53a3a,
  neutral: 0xdddddd,
};

/** ユニット本体を軍勢ごとに塗り分ける色 */
const UNIT_BODY_COLOR: Record<ArmyType, number> = {
  player: 0x2f5fae,
  enemy: 0xae2f2f,
  neutral: 0x777777,
};

/**
 * ゲーム本体のメインシーン。
 * Phase 2: 10x10 のマップを地形色で描画し、マスをクリックで選択して
 * その地形情報を右側パネルに表示する。
 */
export class MainScene extends Phaser.Scene {
  private map!: MapManager;
  private units!: UnitManager;
  private unitLayer!: Phaser.GameObjects.Container;
  private highlight!: Phaser.GameObjects.Graphics;
  private infoText!: Phaser.GameObjects.Text;
  private selected: GridPosition | null = null;

  constructor() {
    super('MainScene');
  }

  create(): void {
    this.map = MapManager.fromDefinition(TEST_MAP);
    this.units = UnitManager.fromPlacements(TEST_MAP.units ?? [], this.map);

    this.drawTerrain();
    this.drawGridLines();
    this.drawUnits();
    this.createHighlight();
    this.createInfoPanel();
    this.setupInput();
  }

  /** 地形を種別ごとの色で塗り、占領拠点には所有者を示す枠を描く */
  private drawTerrain(): void {
    const graphics = this.add.graphics();

    this.map.forEachTile((tile) => {
      const data = getTerrainData(tile.terrainType);
      const { x, y } = gridToWorld(tile.position, TILE_SIZE);

      graphics.fillStyle(data.color, 1);
      graphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);

      if (data.canCapture) {
        graphics.lineStyle(3, OWNER_COLOR[tile.owner], 1);
        graphics.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        this.drawTerrainLabel(tile);
      }
    });
  }

  /** 拠点マスに地形名の頭文字を表示して種別を分かりやすくする */
  private drawTerrainLabel(tile: TileData): void {
    const data = getTerrainData(tile.terrainType);
    const { x, y } = gridToWorld(tile.position, TILE_SIZE);
    const initial = data.terrainName.charAt(0);
    this.add
      .text(x + TILE_SIZE / 2, y + TILE_SIZE / 2, initial, {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
  }

  /** マスの区切り線を描画する */
  private drawGridLines(): void {
    const graphics = this.add.graphics();
    graphics.lineStyle(1, 0x1a1a2e, 0.6);

    for (let col = 0; col <= this.map.cols; col++) {
      const x = col * TILE_SIZE;
      graphics.lineBetween(x, 0, x, MAP_HEIGHT);
    }
    for (let row = 0; row <= this.map.rows; row++) {
      const y = row * TILE_SIZE;
      graphics.lineBetween(0, y, MAP_WIDTH, y);
    }
  }

  /**
   * 全ユニットをグリッド上に描画する。
   * コンテナにまとめて描くことで、移動・撃破時に再描画しやすくする。
   */
  private drawUnits(): void {
    if (!this.unitLayer) {
      this.unitLayer = this.add.container(0, 0);
    }
    this.unitLayer.removeAll(true);

    const graphics = this.add.graphics();
    this.unitLayer.add(graphics);

    const radius = TILE_SIZE * 0.32;
    for (const unit of this.units.getAllUnits()) {
      const { x, y } = gridToWorldCenter(unit.position, TILE_SIZE);

      graphics.fillStyle(UNIT_BODY_COLOR[unit.armyType], 1);
      graphics.fillCircle(x, y, radius);
      graphics.lineStyle(2, 0xffffff, 0.9);
      graphics.strokeCircle(x, y, radius);

      const label = this.add
        .text(x, y, unit.unitName.charAt(0), {
          fontFamily: 'sans-serif',
          fontSize: '18px',
          color: '#ffffff',
        })
        .setOrigin(0.5);
      this.unitLayer.add(label);

      // HP が減っている場合のみ右下に数値を表示する
      if (unit.currentHp < unit.maxHp) {
        const hp = this.add
          .text(x + radius, y + radius, String(unit.currentHp), {
            fontFamily: 'sans-serif',
            fontSize: '12px',
            color: '#ffe08a',
          })
          .setOrigin(1, 1);
        this.unitLayer.add(hp);
      }
    }
  }

  /** 選択マスのハイライト用グラフィックスを用意する(初期は非表示) */
  private createHighlight(): void {
    this.highlight = this.add.graphics();
    this.highlight.setVisible(false);
  }

  /** 右側の情報パネルを作成する */
  private createInfoPanel(): void {
    const panel = this.add.graphics();
    panel.fillStyle(0x12121e, 1);
    panel.fillRect(MAP_WIDTH, 0, INFO_PANEL_WIDTH, GAME_HEIGHT);

    this.add.text(MAP_WIDTH + 12, 12, 'マス情報', {
      fontFamily: 'sans-serif',
      fontSize: '16px',
      color: '#ffd479',
    });

    this.infoText = this.add.text(MAP_WIDTH + 12, 44, 'マスを選択してください', {
      fontFamily: 'sans-serif',
      fontSize: '14px',
      color: '#eaeaea',
      lineSpacing: 6,
      wordWrap: { width: INFO_PANEL_WIDTH - 24 },
    });
  }

  /** クリック入力を設定する */
  private setupInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      // マップ描画領域外(情報パネル側)のクリックは無視する
      if (pointer.x >= MAP_WIDTH || pointer.y >= MAP_HEIGHT) {
        return;
      }
      const pos = worldToGrid(pointer.x, pointer.y, TILE_SIZE);
      this.selectTile(pos);
    });
  }

  /** 指定マスを選択し、ハイライトと情報表示を更新する */
  private selectTile(pos: GridPosition): void {
    const tile = this.map.getTile(pos);
    if (!tile) {
      return;
    }

    // 同じマスを再度クリックしたら選択を解除する
    if (this.selected && equals(this.selected, pos)) {
      this.clearSelection();
      return;
    }

    this.selected = pos;
    this.drawSelectionHighlight(pos);
    this.infoText.setText(this.buildInfo(tile));
  }

  /**
   * 選択マスの情報テキストを組み立てる。
   * ユニットがいる場合はユニット情報を先頭に、続けて地形情報を並べる。
   */
  private buildInfo(tile: TileData): string[] {
    const unit = this.units.getUnitAt(tile.position);
    if (unit) {
      return [...formatUnitInfo(unit), '', ...formatTerrainInfo(tile)];
    }
    return formatTerrainInfo(tile);
  }

  /** 選択を解除する */
  private clearSelection(): void {
    this.selected = null;
    this.highlight.setVisible(false);
    this.infoText.setText('マスを選択してください');
  }

  /** 選択マスの枠を描画する */
  private drawSelectionHighlight(pos: GridPosition): void {
    const { x, y } = gridToWorld(pos, TILE_SIZE);
    this.highlight.clear();
    this.highlight.lineStyle(3, 0xffd479, 1);
    this.highlight.strokeRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    this.highlight.setVisible(true);
  }
}
