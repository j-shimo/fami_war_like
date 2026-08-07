// 音量調整ウィンドウ(何もないマスの右クリックで出す情報メニューの「音量」で開く)。
// 横向きのスライダーをドラッグ、または目盛りをタップして音量(0〜100%)を調整する。
// 純粋なゲームロジックではなく Phaser の描画・入力を扱うため rendering/ に置く。
// 音量の実際の反映(SoundManager への設定)は呼び出し側(MainScene)が onChange で担う。

import Phaser from 'phaser';

/** 音量ウィンドウを開くときの設定 */
export interface VolumeWindowConfig {
  /** 画面全体(ビューポート + 情報パネル)のピクセル幅・高さ(背景の暗幕用) */
  readonly gameWidth: number;
  readonly gameHeight: number;
  /** マップ表示領域(ビューポート)のピクセル幅・高さ(ウィンドウはこの中央に置く) */
  readonly viewWidth: number;
  readonly viewHeight: number;
  /** 初期音量(0〜1 の正規化値) */
  readonly initialVolume: number;
  /** 音量が変わるたびの通知(0〜1)。ドラッグ・タップの都度呼ばれる */
  readonly onChange: (volume: number) => void;
  /** 暗幕や × でウィンドウが閉じられたときの通知 */
  readonly onClose: () => void;
}

/** ウィンドウの幅(ピクセル) */
const WIN_WIDTH = 280;
/** タイトルバーの高さ */
const TITLE_HEIGHT = 34;
/** タイトルバー下の本体(スライダー領域)の高さ */
const BODY_HEIGHT = 92;
/** ウィンドウ全体の高さ */
const WIN_HEIGHT = TITLE_HEIGHT + BODY_HEIGHT;
/** 左右の内側余白 */
const PADDING = 20;
/** スライダーのつまみの半径 */
const THUMB_RADIUS = 11;
/** スライダーのトラック(溝)の太さ */
const TRACK_THICKNESS = 6;
/** ドラッグとタップを区別する移動量のしきい値(ピクセル) */
const DRAG_THRESHOLD = 4;
/** ウィンドウの描画深度(生産ウィンドウと同じく最前面帯) */
const WINDOW_DEPTH = 300;

/** 色(タイトル・枠・スライダーなど) */
const COLOR = {
  backdrop: 0x000000,
  panel: 0x1a1a2b,
  panelStroke: 0x8ad0ff,
  title: '#8ad0ff',
  close: '#ffffff',
  ends: '#8ad0ff',
  percent: '#ffe08a',
  trackBg: 0x333348,
  trackFill: 0x8ad0ff,
  thumb: 0xffffff,
  thumbStroke: 0x8ad0ff,
} as const;

/**
 * 音量調整ウィンドウ。open() で表示し、close() で片付ける。
 * 1 度作れば使い回せるよう、表示のたびに Phaser オブジェクトを作り直す。
 * 画面固定(setScrollFactor(0))のスクリーン座標で描くため、カメラスクロールの計算は不要。
 */
export class VolumeWindow {
  private config: VolumeWindowConfig | null = null;
  private opened = false;

  /** 生成した Phaser オブジェクト(閉じるときにまとめて破棄する) */
  private objects: Phaser.GameObjects.GameObject[] = [];
  /** スライダー(トラック・つまみ)を描くグラフィックス */
  private slider: Phaser.GameObjects.Graphics | null = null;
  /** 現在の音量を数値(%)で表示するテキスト */
  private percentText: Phaser.GameObjects.Text | null = null;

  /** 現在の音量(0〜1) */
  private volume = 1;

  /** ウィンドウの左上スクリーン座標 */
  private winX = 0;
  private winY = 0;
  /** スライダーのトラック両端のスクリーン X 座標と Y 座標 */
  private trackLeft = 0;
  private trackRight = 0;
  private trackY = 0;

  /**
   * ウィンドウを開いたクリックの「離し(pointerup)」を 1 回だけ無視するフラグ。
   * 「音量」メニューのボタン(ウィンドウ外)を押した離しが、ウィンドウ外タップ=閉じる
   * と誤判定されて即座に閉じてしまうのを防ぐ。
   */
  private ignoreNextUp = false;
  /** つまみ(スライダー)をドラッグ中か */
  private dragging = false;
  /** 押下開始点(ドラッグ判定用) */
  private downX = 0;
  private downY = 0;
  /** 押下がスライダー上で始まったか(ドラッグ対象か) */
  private pressedOnSlider = false;

  private readonly onPointerDown = (p: Phaser.Input.Pointer) => this.handlePointerDown(p);
  private readonly onPointerMove = (p: Phaser.Input.Pointer) => this.handlePointerMove(p);
  private readonly onPointerUp = (p: Phaser.Input.Pointer) => this.handlePointerUp(p);

  constructor(private readonly scene: Phaser.Scene) {}

  /** ウィンドウを表示中か */
  isOpen(): boolean {
    return this.opened;
  }

  /** 音量ウィンドウを開く */
  open(config: VolumeWindowConfig): void {
    // 二重に開かないよう、開いていれば一度片付けてから作り直す
    this.close();
    this.config = config;
    this.opened = true;
    this.volume = Phaser.Math.Clamp(config.initialVolume, 0, 1);
    this.ignoreNextUp = true;
    this.dragging = false;
    this.pressedOnSlider = false;

    // ビューポート(マップ領域)の中央に置く。画面固定なのでスクリーン座標をそのまま使う
    this.winX = Math.round((config.viewWidth - WIN_WIDTH) / 2);
    this.winY = Math.round((config.viewHeight - WIN_HEIGHT) / 2);
    // スライダーのトラックはアイコンぶんの余白を空けて本体中央に横断させる
    this.trackLeft = this.winX + PADDING + 18;
    this.trackRight = this.winX + WIN_WIDTH - PADDING - 18;
    this.trackY = this.winY + TITLE_HEIGHT + BODY_HEIGHT / 2 + 6;

    this.createBackdrop(config);
    this.createPanel();
    this.createSlider();
    this.registerInput();
  }

  /**
   * ウィンドウを片付ける(暗幕・枠・スライダー・入力ハンドラをすべて破棄する)。
   * onClose は呼ばない(暗幕クリックや × による閉じるは requestClose() を使う)。
   */
  close(): void {
    if (!this.opened) {
      return;
    }
    this.opened = false;
    this.unregisterInput();
    for (const obj of this.objects) {
      obj.destroy();
    }
    this.objects = [];
    this.slider = null;
    this.percentText = null;
    this.config = null;
  }

  /** 画面全体を覆う暗幕(クリックで閉じられるよう画面全体を覆う) */
  private createBackdrop(config: VolumeWindowConfig): void {
    const backdrop = this.scene.add
      .rectangle(0, 0, config.gameWidth, config.gameHeight, COLOR.backdrop, 0.5)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(WINDOW_DEPTH);
    this.objects.push(backdrop);
  }

  /** タイトルバー付きの枠と、両端のアイコン・% 表示を描く */
  private createPanel(): void {
    const panel = this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(WINDOW_DEPTH + 1);
    // 枠の下地
    panel.fillStyle(COLOR.panel, 1);
    panel.fillRect(this.winX, this.winY, WIN_WIDTH, WIN_HEIGHT);
    // タイトルバー
    panel.fillStyle(COLOR.panelStroke, 0.14);
    panel.fillRect(this.winX, this.winY, WIN_WIDTH, TITLE_HEIGHT);
    // 外枠
    panel.lineStyle(2, COLOR.panelStroke, 1);
    panel.strokeRect(this.winX, this.winY, WIN_WIDTH, WIN_HEIGHT);
    this.objects.push(panel);

    const title = this.scene.add
      .text(this.winX + 16, this.winY + TITLE_HEIGHT / 2, '音量', {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
        color: COLOR.title,
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(WINDOW_DEPTH + 2);
    this.objects.push(title);

    // 閉じるボタン(×)。当たり判定はタイトルバー右端の領域で扱う(handleTap)
    const close = this.scene.add
      .text(this.winX + WIN_WIDTH - 14, this.winY + TITLE_HEIGHT / 2, '✕', {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: COLOR.close,
      })
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setDepth(WINDOW_DEPTH + 2);
    this.objects.push(close);

    // スライダー両端の音量アイコン(小・大)
    const small = this.scene.add
      .text(this.winX + PADDING - 6, this.trackY, '🔈', {
        fontFamily: 'sans-serif',
        fontSize: '15px',
        color: COLOR.ends,
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(WINDOW_DEPTH + 2);
    const large = this.scene.add
      .text(this.winX + WIN_WIDTH - PADDING + 6, this.trackY, '🔊', {
        fontFamily: 'sans-serif',
        fontSize: '15px',
        color: COLOR.ends,
      })
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setDepth(WINDOW_DEPTH + 2);
    this.objects.push(small, large);

    // 現在の音量(%)。本体上部の中央に表示する
    this.percentText = this.scene.add
      .text(this.winX + WIN_WIDTH / 2, this.winY + TITLE_HEIGHT + 22, '', {
        fontFamily: 'sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
        color: COLOR.percent,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(WINDOW_DEPTH + 2);
    this.objects.push(this.percentText);
  }

  /** スライダー(トラック・つまみ)を用意し、現在の音量に合わせて描く */
  private createSlider(): void {
    this.slider = this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(WINDOW_DEPTH + 2);
    this.objects.push(this.slider);
    this.drawSlider();
  }

  /** スライダーと % 表示を現在の音量に合わせて描き直す */
  private drawSlider(): void {
    const g = this.slider;
    if (!g) {
      return;
    }
    const trackWidth = this.trackRight - this.trackLeft;
    const thumbX = this.trackLeft + trackWidth * this.volume;
    const half = TRACK_THICKNESS / 2;

    g.clear();
    // トラック背景(溝の全体)
    g.fillStyle(COLOR.trackBg, 1);
    g.fillRoundedRect(
      this.trackLeft,
      this.trackY - half,
      trackWidth,
      TRACK_THICKNESS,
      half,
    );
    // 現在音量までの塗り
    g.fillStyle(COLOR.trackFill, 1);
    g.fillRoundedRect(
      this.trackLeft,
      this.trackY - half,
      Math.max(TRACK_THICKNESS, thumbX - this.trackLeft),
      TRACK_THICKNESS,
      half,
    );
    // つまみ
    g.fillStyle(COLOR.thumb, 1);
    g.fillCircle(thumbX, this.trackY, THUMB_RADIUS);
    g.lineStyle(2, COLOR.thumbStroke, 1);
    g.strokeCircle(thumbX, this.trackY, THUMB_RADIUS);

    this.percentText?.setText(`${Math.round(this.volume * 100)}%`);
  }

  private registerInput(): void {
    const input = this.scene.input;
    input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown);
    input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove);
    input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp);
  }

  private unregisterInput(): void {
    const input = this.scene.input;
    input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown);
    input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove);
    input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp);
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    this.downX = pointer.x;
    this.downY = pointer.y;
    this.dragging = false;
    // スライダーの当たり判定(トラックを縦に広めにとって掴みやすくする)
    const onTrack =
      pointer.x >= this.trackLeft - THUMB_RADIUS &&
      pointer.x <= this.trackRight + THUMB_RADIUS &&
      Math.abs(pointer.y - this.trackY) <= THUMB_RADIUS + 10;
    this.pressedOnSlider = onTrack;
    if (onTrack) {
      // 押した位置へつまみを移動して即座に反映する
      this.setVolumeFromX(pointer.x);
    }
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.pressedOnSlider || !pointer.isDown) {
      return;
    }
    if (
      !this.dragging &&
      Math.hypot(pointer.x - this.downX, pointer.y - this.downY) > DRAG_THRESHOLD
    ) {
      this.dragging = true;
    }
    if (this.dragging) {
      this.setVolumeFromX(pointer.x);
    }
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    // ウィンドウを開いたクリックの離しは 1 回だけ無視する(即閉じの防止)
    if (this.ignoreNextUp) {
      this.ignoreNextUp = false;
      this.pressedOnSlider = false;
      this.dragging = false;
      return;
    }
    // スライダー操作(ドラッグ・タップ)だったら閉じる判定はしない
    if (this.pressedOnSlider) {
      this.pressedOnSlider = false;
      this.dragging = false;
      return;
    }
    this.handleTap(pointer.x, pointer.y);
  }

  /** スライダー以外をタップしたとき: ウィンドウ外・× なら閉じる */
  private handleTap(screenX: number, screenY: number): void {
    const left = this.winX;
    const top = this.winY;
    const right = left + WIN_WIDTH;
    const bottom = top + WIN_HEIGHT;

    // ウィンドウの外をタップしたら閉じる
    if (screenX < left || screenX > right || screenY < top || screenY > bottom) {
      this.requestClose();
      return;
    }
    // タイトルバー右端の × 領域なら閉じる
    if (screenY < top + TITLE_HEIGHT && screenX >= right - TITLE_HEIGHT) {
      this.requestClose();
    }
  }

  /** ポインタの X 座標から音量を求めて反映する(0〜1 に丸める) */
  private setVolumeFromX(screenX: number): void {
    const ratio = (screenX - this.trackLeft) / (this.trackRight - this.trackLeft);
    const clamped = Phaser.Math.Clamp(ratio, 0, 1);
    if (clamped === this.volume) {
      return;
    }
    this.volume = clamped;
    this.drawSlider();
    this.config?.onChange(clamped);
  }

  /** ユーザー操作で閉じる(片付けたうえで onClose を通知する) */
  private requestClose(): void {
    const onClose = this.config?.onClose;
    this.close();
    onClose?.();
  }
}
