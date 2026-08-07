import Phaser from 'phaser';

import { DEFAULT_DIMENSIONS } from '@/data/gameConfig';
import { GUIDE_SLIDES } from '@/data/guideData';
import { drawGuideCapture } from '@/rendering/guideCapture';

/** キャプチャ(ミニ盤面)を載せるパネルの寸法・位置 */
const PANEL_X = 120;
const PANEL_Y = 86;
const PANEL_WIDTH = 440;
const PANEL_HEIGHT = 210;

/** 本文の開始位置と行間 */
const BODY_TOP = 312;
const BODY_LINE_HEIGHT = 22;

/** 進捗ドットとナビゲーションの縦位置 */
const DOTS_Y = 404;
const NAV_Y = 432;

/** 1 つのクリック可能なボタン(下地の矩形 + ラベル) */
interface GuideButton {
  readonly rect: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
  setEnabled(enabled: boolean): void;
}

/**
 * マップ選択画面の「ゲーム説明」から開く、ゲームの流れを紹介するスライド画面。
 * GUIDE_SLIDES を 1 枚ずつ、キャプチャ(コードで描いたミニ盤面)付きで表示し、
 * 前へ/次へ/ドットで切り替える。閉じるとマップ選択へ戻る。
 */
export class GuideScene extends Phaser.Scene {
  /** 現在表示しているスライドの番号 */
  private index = 0;

  /** スライドごとに作り直す表示物(切り替え時にまとめて破棄する) */
  private slideObjects: Phaser.GameObjects.GameObject[] = [];

  /** 進捗ドット(現在位置を塗り分けるため保持する) */
  private dots: Phaser.GameObjects.Arc[] = [];

  private prevButton!: GuideButton;
  private nextButton!: GuideButton;
  private pageLabel!: Phaser.GameObjects.Text;

  constructor() {
    super('GuideScene');
  }

  create(): void {
    // マップ選択と同じ選択画面用の寸法に戻す(直前のインゲームが大きなマップでも崩れないように)
    this.scale.resize(DEFAULT_DIMENSIONS.gameWidth, DEFAULT_DIMENSIONS.gameHeight);
    const width = DEFAULT_DIMENSIONS.gameWidth;
    const height = DEFAULT_DIMENSIONS.gameHeight;

    this.index = 0;

    // 背景
    const bg = this.add.graphics();
    bg.fillStyle(0x12121e, 1);
    bg.fillRect(0, 0, width, height);

    // 見出し
    this.add
      .text(width / 2, 26, 'ゲーム説明', {
        fontFamily: 'sans-serif',
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#8ad0ff',
      })
      .setOrigin(0.5);

    // 閉じるボタン(右上)
    this.createButton(width - 56, 24, 88, 30, '閉じる', () => this.close()).setEnabled(
      true,
    );

    // キャプチャを載せるパネル(暗い下地に枠)
    const panel = this.add.graphics();
    panel.fillStyle(0x0e0e18, 1);
    panel.fillRoundedRect(PANEL_X, PANEL_Y, PANEL_WIDTH, PANEL_HEIGHT, 8);
    panel.lineStyle(2, 0x3a4a6a, 1);
    panel.strokeRoundedRect(PANEL_X, PANEL_Y, PANEL_WIDTH, PANEL_HEIGHT, 8);

    // 進捗ドット
    this.createDots(width);

    // ナビゲーション(前へ / ページ表示 / 次へ)
    this.prevButton = this.createButton(96, NAV_Y, 92, 34, '← 前へ', () =>
      this.goTo(this.index - 1),
    );
    this.nextButton = this.createButton(width - 96, NAV_Y, 92, 34, '次へ →', () =>
      this.goTo(this.index + 1),
    );
    this.pageLabel = this.add
      .text(width / 2, NAV_Y, '', {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: '#c8c8d8',
      })
      .setOrigin(0.5);

    // キーボードでも操作できるようにする
    this.input.keyboard?.on('keydown-LEFT', () => this.goTo(this.index - 1));
    this.input.keyboard?.on('keydown-RIGHT', () => this.goTo(this.index + 1));
    this.input.keyboard?.on('keydown-ESC', () => this.close());

    this.showSlide(0);
  }

  /** 進捗ドットを画面下に並べる。クリックでそのスライドへ飛べる */
  private createDots(width: number): void {
    const gap = 22;
    const totalWidth = (GUIDE_SLIDES.length - 1) * gap;
    const startX = width / 2 - totalWidth / 2;
    GUIDE_SLIDES.forEach((_slide, i) => {
      const dot = this.add
        .circle(startX + i * gap, DOTS_Y, 6, 0x3a4a6a)
        .setInteractive({ useHandCursor: true });
      dot.on(Phaser.Input.Events.POINTER_DOWN, () => this.goTo(i));
      this.dots.push(dot);
    });
  }

  /** 指定番号のスライドへ移動する(範囲外は無視) */
  private goTo(index: number): void {
    if (index < 0 || index >= GUIDE_SLIDES.length || index === this.index) {
      return;
    }
    this.index = index;
    this.showSlide(index);
  }

  /** スライドを描き直す(タイトル・キャプチャ・本文を作り直し、ドット/ナビを更新する) */
  private showSlide(index: number): void {
    for (const obj of this.slideObjects) {
      obj.destroy();
    }
    this.slideObjects = [];

    const slide = GUIDE_SLIDES[index];
    const width = DEFAULT_DIMENSIONS.gameWidth;

    // タイトル
    const title = this.add
      .text(width / 2, 62, slide.title, {
        fontFamily: 'sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#ffe08a',
      })
      .setOrigin(0.5);
    this.slideObjects.push(title);

    // キャプチャ(パネル内に少し余白をとって描く)
    const captureObjects = drawGuideCapture(this, slide.capture, {
      x: PANEL_X + 12,
      y: PANEL_Y + 12,
      width: PANEL_WIDTH - 24,
      height: PANEL_HEIGHT - 24,
    });
    this.slideObjects.push(...captureObjects);

    // 本文(1 行ずつ)
    slide.body.forEach((line, i) => {
      const text = this.add
        .text(width / 2, BODY_TOP + i * BODY_LINE_HEIGHT, line, {
          fontFamily: 'sans-serif',
          fontSize: '14px',
          color: '#d6d6e4',
          align: 'center',
          wordWrap: { width: width - 80 },
        })
        .setOrigin(0.5, 0);
      this.slideObjects.push(text);
    });

    this.updateNav();
  }

  /** ドットの色・ページ表示・前へ/次への有効状態を現在位置に合わせる */
  private updateNav(): void {
    this.dots.forEach((dot, i) => {
      dot.setFillStyle(i === this.index ? 0x8ad0ff : 0x3a4a6a);
    });
    this.pageLabel.setText(`${this.index + 1} / ${GUIDE_SLIDES.length}`);
    this.prevButton.setEnabled(this.index > 0);
    this.nextButton.setEnabled(this.index < GUIDE_SLIDES.length - 1);
  }

  /** 説明を閉じてマップ選択へ戻る */
  private close(): void {
    this.scene.start('MapSelectScene');
  }

  /** 下地の矩形 + ラベルからなるボタンを作る。setEnabled で押下可否を切り替える */
  private createButton(
    centerX: number,
    centerY: number,
    w: number,
    h: number,
    text: string,
    onClick: () => void,
  ): GuideButton {
    const rect = this.add
      .rectangle(centerX, centerY, w, h, 0x1f2740)
      .setStrokeStyle(2, 0x3a4a6a)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(centerX, centerY, text, {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    let enabled = true;

    rect.on(Phaser.Input.Events.POINTER_OVER, () => {
      if (enabled) {
        rect.setStrokeStyle(2, 0x8ad0ff);
        rect.setFillStyle(0x263255);
      }
    });
    rect.on(Phaser.Input.Events.POINTER_OUT, () => {
      if (enabled) {
        rect.setStrokeStyle(2, 0x3a4a6a);
        rect.setFillStyle(0x1f2740);
      }
    });
    rect.on(Phaser.Input.Events.POINTER_DOWN, () => {
      if (enabled) {
        onClick();
      }
    });

    const button: GuideButton = {
      rect,
      label,
      setEnabled(value: boolean): void {
        enabled = value;
        // 無効時は暗くして押せないことを示す
        rect.setFillStyle(value ? 0x1f2740 : 0x161622);
        rect.setStrokeStyle(2, value ? 0x3a4a6a : 0x2a2a36);
        label.setColor(value ? '#ffffff' : '#666677');
      },
    };
    return button;
  }
}
