import Phaser from 'phaser';
import { DEFAULT_DIMENSIONS } from '@/data/gameConfig';
import { MAP_LIST, type MapEntry } from '@/data/maps';

/** 選択画面のカードの寸法・間隔 */
const CARD_MARGIN_X = 40;
const CARD_TOP = 96;
const CARD_HEIGHT = 84;
const CARD_GAP = 16;

/**
 * インゲームの前段階に表示するマップ選択画面。
 * 登録済みマップ(MAP_LIST)をカードとして縦に並べ、
 * クリックすると選んだマップを MainScene へ渡してゲームを開始する。
 */
export class MapSelectScene extends Phaser.Scene {
  constructor() {
    super('MapSelectScene');
  }

  create(): void {
    // 直前に大きなマップを遊んでいた場合に備え、選択画面用の寸法へ戻す
    this.scale.resize(DEFAULT_DIMENSIONS.gameWidth, DEFAULT_DIMENSIONS.gameHeight);

    const width = DEFAULT_DIMENSIONS.gameWidth;

    // 背景
    const bg = this.add.graphics();
    bg.fillStyle(0x12121e, 1);
    bg.fillRect(0, 0, width, DEFAULT_DIMENSIONS.gameHeight);

    // タイトル
    this.add
      .text(width / 2, 36, 'マップを選択', {
        fontFamily: 'sans-serif',
        fontSize: '28px',
        fontStyle: 'bold',
        color: '#8ad0ff',
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 68, '遊ぶマップを選んでください', {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5);

    MAP_LIST.forEach((entry, index) => {
      this.createMapCard(entry, index, width);
    });
  }

  /** マップ 1 枚ぶんの選択カードを作成する */
  private createMapCard(entry: MapEntry, index: number, width: number): void {
    const x = CARD_MARGIN_X;
    const y = CARD_TOP + index * (CARD_HEIGHT + CARD_GAP);
    const cardWidth = width - CARD_MARGIN_X * 2;

    const rows = entry.definition.terrain.length;
    const cols = entry.definition.terrain[0]?.length ?? 0;

    const card = this.add
      .rectangle(x, y, cardWidth, CARD_HEIGHT, 0x1f2740)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x3a4a6a)
      .setInteractive({ useHandCursor: true });

    // マップ名
    this.add.text(x + 16, y + 12, entry.definition.name, {
      fontFamily: 'sans-serif',
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#ffffff',
    });

    // サイズ表記(横×縦)
    this.add.text(x + 16, y + 38, `サイズ: 横${cols} × 縦${rows}`, {
      fontFamily: 'sans-serif',
      fontSize: '13px',
      color: '#ffe08a',
    });

    // 1 行説明
    this.add.text(x + 16, y + 58, entry.description, {
      fontFamily: 'sans-serif',
      fontSize: '12px',
      color: '#c8c8d8',
      wordWrap: { width: cardWidth - 32 },
    });

    // ホバーで枠を強調する
    card.on(Phaser.Input.Events.POINTER_OVER, () => {
      card.setStrokeStyle(2, 0x8ad0ff);
      card.setFillStyle(0x263255);
    });
    card.on(Phaser.Input.Events.POINTER_OUT, () => {
      card.setStrokeStyle(2, 0x3a4a6a);
      card.setFillStyle(0x1f2740);
    });
    card.on(Phaser.Input.Events.POINTER_DOWN, () => {
      this.scene.start('MainScene', { map: entry.definition });
    });
  }
}
