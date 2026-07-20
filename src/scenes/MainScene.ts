import Phaser from 'phaser';
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  MAP_COLS,
  MAP_ROWS,
  TILE_SIZE,
} from '@/data/gameConfig';

/**
 * ゲーム本体のメインシーン。
 * Phase 1 では土台の確認として 10x10 のグリッド枠を描画するのみ。
 * マップ・ユニットの本格描画は Phase 2 以降で実装する。
 */
export class MainScene extends Phaser.Scene {
  constructor() {
    super('MainScene');
  }

  create(): void {
    this.drawPlaceholderGrid();
    this.drawTitle();
  }

  /** 動作確認用のグリッド枠を描画する */
  private drawPlaceholderGrid(): void {
    const graphics = this.add.graphics();
    graphics.lineStyle(1, 0x3a3a5a, 1);

    for (let col = 0; col <= MAP_COLS; col++) {
      const x = col * TILE_SIZE;
      graphics.lineBetween(x, 0, x, GAME_HEIGHT);
    }

    for (let row = 0; row <= MAP_ROWS; row++) {
      const y = row * TILE_SIZE;
      graphics.lineBetween(0, y, GAME_WIDTH, y);
    }
  }

  /** 起動確認用のタイトル表示 */
  private drawTitle(): void {
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'グリッドウォーズ(仮題)', {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: '#eaeaea',
      })
      .setOrigin(0.5);
  }
}
