// 「敵の行動アニメ」の設定ウィンドウ(何もないマスの右クリックで出す情報メニューから開く)。
// 「しっかり / 簡単 / 超速」を縦に並べ、押した種別へ設定を切り替える。
// 純粋なゲームロジックではなく Phaser の描画・入力を扱うため rendering/ に置く。
// 設定の保存(SettingsStorage への書き込み)は呼び出し側(MainScene)が onSelect で担う。

import Phaser from 'phaser';

import {
  ENEMY_ANIMATION_MODES,
  type EnemyAnimationMode,
  type EnemyAnimationModeData,
} from '@/data/enemyAnimation';

/** 敵の行動アニメ設定ウィンドウを開くときの設定 */
export interface EnemyAnimationWindowConfig {
  /** 画面全体(ビューポート + 情報パネル)のピクセル幅・高さ(背景の暗幕用) */
  readonly gameWidth: number;
  readonly gameHeight: number;
  /** マップ表示領域(ビューポート)のピクセル幅・高さ(ウィンドウはこの中央に置く) */
  readonly viewWidth: number;
  readonly viewHeight: number;
  /** 現在選ばれている種別(選択中の行を強調表示する) */
  readonly current: EnemyAnimationMode;
  /** 選べる種別が押されたときの通知(ウィンドウは閉じたあとに呼ばれる) */
  readonly onSelect: (mode: EnemyAnimationMode) => void;
  /** 選べない種別(準備中)が押されたときの通知。ウィンドウは開いたままにする */
  readonly onDenied: () => void;
  /** 暗幕や × でウィンドウが閉じられたときの通知 */
  readonly onClose: () => void;
}

/** ウィンドウの幅(ピクセル) */
const WIN_WIDTH = 320;
/** タイトルバーの高さ */
const TITLE_HEIGHT = 34;
/** 選択肢 1 行の高さ(表示名 1 行 + 説明 2 行が収まる高さ) */
const ROW_HEIGHT = 68;
/** 選択肢どうしの間隔 */
const ROW_GAP = 8;
/** 本体の内側余白 */
const PADDING = 14;
/** ウィンドウの描画深度(他のウィンドウと同じ最前面帯) */
const WINDOW_DEPTH = 300;

/** 色(タイトル・枠・選択肢) */
const COLOR = {
  backdrop: 0x000000,
  panel: 0x1a1a2b,
  panelStroke: 0x8ad0ff,
  title: '#8ad0ff',
  close: '#ffffff',
  rowFill: 0x24243a,
  rowStroke: 0x5a6a86,
  currentFill: 0x2f4f7f,
  currentStroke: 0x8ad0ff,
  disabledFill: 0x22222c,
  disabledStroke: 0x44444e,
  label: '#ffffff',
  currentLabel: '#ffe08a',
  disabledLabel: '#77777f',
  description: '#c8d2e0',
  disabledDescription: '#66666e',
} as const;

/** 選択肢 1 行ぶんの当たり判定領域 */
interface RowRect {
  readonly mode: EnemyAnimationModeData;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** 本体(タイトルバーを除く)の高さ */
const BODY_HEIGHT =
  PADDING * 2 +
  ENEMY_ANIMATION_MODES.length * ROW_HEIGHT +
  (ENEMY_ANIMATION_MODES.length - 1) * ROW_GAP;

/** ウィンドウ全体の高さ */
const WIN_HEIGHT = TITLE_HEIGHT + BODY_HEIGHT;

/**
 * 敵の行動アニメ設定ウィンドウ。open() で表示し、close() で片付ける。
 * 他のウィンドウ(生産・音量・確認ダイアログ)と同じく、表示のたびに Phaser
 * オブジェクトを作り直し、画面固定(setScrollFactor(0))のスクリーン座標で描く。
 */
export class EnemyAnimationWindow {
  private config: EnemyAnimationWindowConfig | null = null;
  private opened = false;

  /** 生成した Phaser オブジェクト(閉じるときにまとめて破棄する) */
  private objects: Phaser.GameObjects.GameObject[] = [];
  /** 選択肢の当たり判定(上から順) */
  private rows: RowRect[] = [];

  /** ウィンドウの左上スクリーン座標 */
  private winX = 0;
  private winY = 0;

  /**
   * ウィンドウを開いたクリックの「離し(pointerup)」を 1 回だけ無視するフラグ。
   * 「敵の行動アニメ」メニューのボタンを押した離しが、そのまま選択肢の押下や
   * ウィンドウ外タップ(=閉じる)と誤判定されるのを防ぐ。
   */
  private ignoreNextUp = false;

  private readonly onPointerUp = (p: Phaser.Input.Pointer) => this.handlePointerUp(p);

  constructor(private readonly scene: Phaser.Scene) {}

  /** ウィンドウを表示中か */
  isOpen(): boolean {
    return this.opened;
  }

  /** 設定ウィンドウを開く */
  open(config: EnemyAnimationWindowConfig): void {
    // 二重に開かないよう、開いていれば一度片付けてから作り直す
    this.close();
    this.config = config;
    this.opened = true;
    this.ignoreNextUp = true;

    // ビューポート(マップ領域)の中央に置く。画面固定なのでスクリーン座標をそのまま使う
    this.winX = Math.round((config.viewWidth - WIN_WIDTH) / 2);
    this.winY = Math.round((config.viewHeight - WIN_HEIGHT) / 2);

    this.createBackdrop(config);
    this.createPanel();
    this.createRows(config.current);
    this.scene.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp);
  }

  /**
   * ウィンドウを片付ける(暗幕・枠・選択肢・入力ハンドラをすべて破棄する)。
   * onSelect / onClose は呼ばない(ユーザー操作による確定は handlePointerUp から通知する)。
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
    this.rows = [];
    this.config = null;
  }

  /** 画面全体を覆う暗幕(下のボタンが押せてしまわないよう入力も受け止める) */
  private createBackdrop(config: EnemyAnimationWindowConfig): void {
    const backdrop = this.scene.add
      .rectangle(0, 0, config.gameWidth, config.gameHeight, COLOR.backdrop, 0.5)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(WINDOW_DEPTH)
      .setInteractive();
    this.objects.push(backdrop);
  }

  /** タイトルバー付きの枠と閉じるボタンを描く */
  private createPanel(): void {
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
      .text(this.winX + 16, this.winY + TITLE_HEIGHT / 2, '敵の行動アニメ', {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
        color: COLOR.title,
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(WINDOW_DEPTH + 2);
    this.objects.push(title);

    // 閉じるボタン(×)。当たり判定はタイトルバー右端の領域で扱う(handlePointerUp)
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
  }

  /**
   * 選択肢を縦に並べて描く。
   * 選択中の行は明るい枠と印(▶)で示し、準備中の行はグレーで沈める。
   */
  private createRows(current: EnemyAnimationMode): void {
    const rowWidth = WIN_WIDTH - PADDING * 2;
    const left = this.winX + PADDING;
    let top = this.winY + TITLE_HEIGHT + PADDING;

    for (const mode of ENEMY_ANIMATION_MODES) {
      const rect: RowRect = {
        mode,
        x: left,
        y: top,
        width: rowWidth,
        height: ROW_HEIGHT,
      };
      this.rows.push(rect);
      this.createRow(rect, mode.id === current);
      top += ROW_HEIGHT + ROW_GAP;
    }
  }

  /** 選択肢 1 行ぶんの枠・表示名・説明を描く(押下判定は handlePointerUp で行う) */
  private createRow(rect: RowRect, selected: boolean): void {
    const { mode } = rect;
    const fill = !mode.selectable
      ? COLOR.disabledFill
      : selected
        ? COLOR.currentFill
        : COLOR.rowFill;
    const stroke = !mode.selectable
      ? COLOR.disabledStroke
      : selected
        ? COLOR.currentStroke
        : COLOR.rowStroke;

    const box = this.scene.add
      .rectangle(rect.x, rect.y, rect.width, rect.height, fill)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setStrokeStyle(2, stroke)
      .setDepth(WINDOW_DEPTH + 2)
      .setInteractive({ useHandCursor: mode.selectable });

    const label = this.scene.add
      .text(rect.x + 12, rect.y + 8, selected ? `▶ ${mode.label}` : mode.label, {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
        color: !mode.selectable
          ? COLOR.disabledLabel
          : selected
            ? COLOR.currentLabel
            : COLOR.label,
      })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(WINDOW_DEPTH + 3);

    const description = this.scene.add
      .text(rect.x + 12, rect.y + 30, mode.description as string[], {
        fontFamily: 'sans-serif',
        fontSize: '12px',
        color: mode.selectable ? COLOR.description : COLOR.disabledDescription,
        lineSpacing: 2,
      })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(WINDOW_DEPTH + 3);

    this.objects.push(box, label, description);
  }

  /** 指定のスクリーン座標が矩形内かどうか */
  private hits(rect: RowRect, x: number, y: number): boolean {
    return (
      x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
    );
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    // ウィンドウを開いたクリックの離しは 1 回だけ無視する(即決定・即閉じの防止)
    if (this.ignoreNextUp) {
      this.ignoreNextUp = false;
      return;
    }
    const { x, y } = pointer;

    for (const row of this.rows) {
      if (!this.hits(row, x, y)) {
        continue;
      }
      // 準備中(選べない)種別は閉じずに、選べないことだけを知らせる
      if (!row.mode.selectable) {
        this.config?.onDenied();
        return;
      }
      const onSelect = this.config?.onSelect;
      const mode = row.mode.id;
      this.close();
      onSelect?.(mode);
      return;
    }

    const left = this.winX;
    const top = this.winY;
    const right = left + WIN_WIDTH;
    const bottom = top + WIN_HEIGHT;

    // ウィンドウの外をタップしたら閉じる
    if (x < left || x > right || y < top || y > bottom) {
      this.requestClose();
      return;
    }
    // タイトルバー右端の × 領域なら閉じる
    if (y < top + TITLE_HEIGHT && x >= right - TITLE_HEIGHT) {
      this.requestClose();
    }
  }

  /** ユーザー操作で閉じる(片付けたうえで onClose を通知する) */
  private requestClose(): void {
    const onClose = this.config?.onClose;
    this.close();
    onClose?.();
  }
}
