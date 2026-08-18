// 「はい / いいえ」で答える確認ダイアログ。ゲーム中の「中断」やマップ選択時の
// 中断データ再開の確認に使う。純粋なゲームロジックではなく Phaser の描画・入力を
// 扱うため rendering/ に置く。押されたボタンに応じた処理は呼び出し側が担う。

import Phaser from 'phaser';

/** 確認ダイアログを開くときの設定 */
export interface ConfirmWindowConfig {
  /** 画面全体(ビューポート + 情報パネル)のピクセル幅・高さ(背景の暗幕用) */
  readonly gameWidth: number;
  readonly gameHeight: number;
  /** ダイアログを中央に置く領域のピクセル幅・高さ(ゲーム中はマップ表示領域) */
  readonly viewWidth: number;
  readonly viewHeight: number;
  /** 見出し(タイトルバーに出す短い文言) */
  readonly title: string;
  /** 本文。複数行にしたい場合は配列で渡す */
  readonly message: string | readonly string[];
  /** 「はい」を押したときの通知(ウィンドウは閉じたあとに呼ばれる) */
  readonly onYes: () => void;
  /** 「いいえ」を押したときの通知(ウィンドウは閉じたあとに呼ばれる) */
  readonly onNo: () => void;
}

/** ウィンドウの幅(ピクセル) */
const WIN_WIDTH = 360;
/** タイトルバーの高さ */
const TITLE_HEIGHT = 34;
/** 本文の表示領域の高さ */
const BODY_HEIGHT = 74;
/** ボタン領域の高さ */
const BUTTON_AREA_HEIGHT = 62;
/** ウィンドウ全体の高さ */
const WIN_HEIGHT = TITLE_HEIGHT + BODY_HEIGHT + BUTTON_AREA_HEIGHT;
/** ボタン 1 個の幅・高さ */
const BUTTON_WIDTH = 120;
const BUTTON_HEIGHT = 38;
/** 2 つのボタンの間隔 */
const BUTTON_GAP = 24;
/** ウィンドウの描画深度(他のウィンドウと同じ最前面帯) */
const WINDOW_DEPTH = 300;

/** 色(タイトル・枠・ボタン) */
const COLOR = {
  backdrop: 0x000000,
  panel: 0x1a1a2b,
  panelStroke: 0x8ad0ff,
  title: '#8ad0ff',
  message: '#ffffff',
  yesFill: 0x2f7f4f,
  yesStroke: 0x8affb0,
  noFill: 0x3a3a44,
  noStroke: 0x9aa0b0,
  buttonLabel: '#ffffff',
} as const;

/** ボタン 1 個ぶんの当たり判定領域 */
interface ButtonRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * 「はい / いいえ」の確認ダイアログ。open() で表示し、close() で片付ける。
 * 他のウィンドウ(生産・音量)と同じく、表示のたびに Phaser オブジェクトを作り直し、
 * 画面固定(setScrollFactor(0))のスクリーン座標で描く。
 * 誤操作でゲームや中断データを失わないよう、暗幕(ウィンドウ外)のクリックでは閉じず、
 * 「はい」「いいえ」のどちらかを必ず選ばせる。
 */
export class ConfirmWindow {
  private config: ConfirmWindowConfig | null = null;
  private opened = false;

  /** 生成した Phaser オブジェクト(閉じるときにまとめて破棄する) */
  private objects: Phaser.GameObjects.GameObject[] = [];

  /** ウィンドウの左上スクリーン座標 */
  private winX = 0;
  private winY = 0;
  /** 「はい」「いいえ」ボタンの当たり判定 */
  private yesRect: ButtonRect | null = null;
  private noRect: ButtonRect | null = null;

  /**
   * ウィンドウを開いたクリックの「離し(pointerup)」を 1 回だけ無視するフラグ。
   * ダイアログを開いたボタンの離しが、そのままボタン押下と誤判定されるのを防ぐ。
   */
  private ignoreNextUp = false;

  private readonly onPointerUp = (p: Phaser.Input.Pointer) => this.handlePointerUp(p);

  constructor(private readonly scene: Phaser.Scene) {}

  /** ウィンドウを表示中か */
  isOpen(): boolean {
    return this.opened;
  }

  /** 確認ダイアログを開く */
  open(config: ConfirmWindowConfig): void {
    // 二重に開かないよう、開いていれば一度片付けてから作り直す
    this.close();
    this.config = config;
    this.opened = true;
    this.ignoreNextUp = true;

    // 表示領域(ゲーム中はマップ領域)の中央に置く。画面固定なのでスクリーン座標をそのまま使う
    this.winX = Math.round((config.viewWidth - WIN_WIDTH) / 2);
    this.winY = Math.round((config.viewHeight - WIN_HEIGHT) / 2);

    this.createBackdrop(config);
    this.createPanel(config);
    this.createButtons();
    this.scene.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp);
  }

  /**
   * ウィンドウを片付ける(暗幕・枠・ボタン・入力ハンドラをすべて破棄する)。
   * onYes / onNo は呼ばない(ボタン押下による確定は requestClose 経由で通知する)。
   */
  close(): void {
    if (!this.opened) {
      return;
    }
    this.opened = false;
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp);
    for (const obj of this.objects) {
      obj.destroy();
    }
    this.objects = [];
    this.yesRect = null;
    this.noRect = null;
    this.config = null;
  }

  /**
   * 画面全体を覆う暗幕。
   * 下にあるボタン(マップ選択のカードなど)が押せてしまわないよう、
   * 暗幕自体を入力対象にして最前面で押下を受け止める。
   */
  private createBackdrop(config: ConfirmWindowConfig): void {
    const backdrop = this.scene.add
      .rectangle(0, 0, config.gameWidth, config.gameHeight, COLOR.backdrop, 0.6)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(WINDOW_DEPTH)
      .setInteractive();
    this.objects.push(backdrop);
  }

  /** タイトルバー付きの枠と本文を描く */
  private createPanel(config: ConfirmWindowConfig): void {
    const panel = this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(WINDOW_DEPTH + 1);
    panel.fillStyle(COLOR.panel, 1);
    panel.fillRect(this.winX, this.winY, WIN_WIDTH, WIN_HEIGHT);
    panel.fillStyle(COLOR.panelStroke, 0.14);
    panel.fillRect(this.winX, this.winY, WIN_WIDTH, TITLE_HEIGHT);
    panel.lineStyle(2, COLOR.panelStroke, 1);
    panel.strokeRect(this.winX, this.winY, WIN_WIDTH, WIN_HEIGHT);
    this.objects.push(panel);

    const title = this.scene.add
      .text(this.winX + 16, this.winY + TITLE_HEIGHT / 2, config.title, {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
        color: COLOR.title,
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(WINDOW_DEPTH + 2);
    this.objects.push(title);

    const message = this.scene.add
      .text(
        this.winX + WIN_WIDTH / 2,
        this.winY + TITLE_HEIGHT + BODY_HEIGHT / 2,
        config.message as string | string[],
        {
          fontFamily: 'sans-serif',
          fontSize: '15px',
          color: COLOR.message,
          align: 'center',
          lineSpacing: 6,
          wordWrap: { width: WIN_WIDTH - 40 },
        },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(WINDOW_DEPTH + 2);
    this.objects.push(message);
  }

  /** 「はい」「いいえ」ボタンを本体下部に横並びで描く */
  private createButtons(): void {
    const centerX = this.winX + WIN_WIDTH / 2;
    const y =
      this.winY + TITLE_HEIGHT + BODY_HEIGHT + (BUTTON_AREA_HEIGHT - BUTTON_HEIGHT) / 2;
    const yesX = centerX - BUTTON_GAP / 2 - BUTTON_WIDTH;
    const noX = centerX + BUTTON_GAP / 2;

    this.yesRect = { x: yesX, y, width: BUTTON_WIDTH, height: BUTTON_HEIGHT };
    this.noRect = { x: noX, y, width: BUTTON_WIDTH, height: BUTTON_HEIGHT };

    this.createButton(this.yesRect, 'はい', COLOR.yesFill, COLOR.yesStroke);
    this.createButton(this.noRect, 'いいえ', COLOR.noFill, COLOR.noStroke);
  }

  /** ボタン 1 個ぶんの枠とラベルを描く(押下判定は handlePointerUp で行う) */
  private createButton(
    rect: ButtonRect,
    label: string,
    fill: number,
    stroke: number,
  ): void {
    const box = this.scene.add
      .rectangle(rect.x, rect.y, rect.width, rect.height, fill)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setStrokeStyle(2, stroke)
      .setDepth(WINDOW_DEPTH + 2)
      .setInteractive({ useHandCursor: true });
    const text = this.scene.add
      .text(rect.x + rect.width / 2, rect.y + rect.height / 2, label, {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
        color: COLOR.buttonLabel,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(WINDOW_DEPTH + 3);
    this.objects.push(box, text);
  }

  /** 指定のスクリーン座標がボタンの矩形内かどうか */
  private hits(rect: ButtonRect | null, x: number, y: number): boolean {
    if (!rect) {
      return false;
    }
    return (
      x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
    );
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    // ウィンドウを開いたクリックの離しは 1 回だけ無視する(即決定の防止)
    if (this.ignoreNextUp) {
      this.ignoreNextUp = false;
      return;
    }
    if (this.hits(this.yesRect, pointer.x, pointer.y)) {
      this.finish(true);
      return;
    }
    if (this.hits(this.noRect, pointer.x, pointer.y)) {
      this.finish(false);
    }
    // ウィンドウ外・本文のクリックでは閉じない(必ずどちらかを選ばせる)
  }

  /** 選択結果を確定する。ウィンドウを片付けてから呼び出し側へ通知する */
  private finish(yes: boolean): void {
    const config = this.config;
    this.close();
    if (yes) {
      config?.onYes();
    } else {
      config?.onNo();
    }
  }
}
