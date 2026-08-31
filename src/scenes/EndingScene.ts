import Phaser from 'phaser';

import { emptyBattleStats, type BattleStats } from '@/core/stats/BattleStats';
import { SoundManager } from '@/audio/SoundManager';
import { DEFAULT_DIMENSIONS } from '@/data/gameConfig';
import { CREDIT_LINES, ENDING_SLIDES, type CreditStyle } from '@/data/endingData';
import { drawEndingCut } from '@/rendering/endingCapture';
import { applyCommander, formatBattleStats } from '@/ui/endingInfo';

/** エピローグのカット(ミニ盤面)を載せるパネルの寸法・位置 */
const CUT_X = 110;
const CUT_Y = 74;
const CUT_WIDTH = 460;
const CUT_HEIGHT = 196;

/** エピローグの見出し・本文の位置と行間 */
const TITLE_Y = 42;
const BODY_TOP = 296;
const BODY_LINE_HEIGHT = 26;

/** エピローグの進捗ドットと「次へ」ボタンの縦位置 */
const DOTS_Y = 400;
const NAV_Y = 436;

/** スタッフロールの流れる速さ(1 秒あたりのピクセル) */
const ROLL_SPEED = 26;
/** スタッフロールの行間(見せ方ごと) */
const ROLL_GAP: Readonly<Record<CreditStyle | 'stat' | 'end', number>> = {
  title: 46,
  heading: 40,
  role: 30,
  note: 34,
  stat: 26,
  end: 60,
};
/** 戦績の行を並べる幅(ラベルを左、値を右に置く) */
const STAT_WIDTH = 320;

/** エピローグのページ送り・スタッフロールで使うボタンの寸法 */
const BUTTON_WIDTH = 132;
const BUTTON_HEIGHT = 34;

/**
 * 激ムズマップを対 CPU で勝利したときに流れるエンディング画面。
 *
 * 前半は後日談のエピローグを 3 ページ(コードで描いたカット + 本文)、
 * 後半は戦績を織り込んだスタッフロールを下から上へ流し、最後に「THE END」を出す。
 * 見終えたら(または「スキップ」を押したら)モード選択画面へ戻る。
 *
 * 発動条件と流れは docs/GameDesign.md「エンディング」を参照。
 */
export class EndingScene extends Phaser.Scene {
  /** 表示中のエピローグのページ番号 */
  private index = 0;
  /** ページごとに作り直す表示物(切り替え時にまとめて破棄する) */
  private pageObjects: Phaser.GameObjects.GameObject[] = [];
  /** エピローグ全体の表示物(スタッフロールへ移るときにまとめて破棄する) */
  private epilogueObjects: Phaser.GameObjects.GameObject[] = [];
  /** 進捗ドット(現在位置を塗り分けるため保持する) */
  private dots: Phaser.GameObjects.Arc[] = [];

  /** スタッフロールの行をまとめたコンテナ(これを上へ動かして流す) */
  private roll: Phaser.GameObjects.Container | null = null;
  /** スタッフロールを止める位置(「THE END」が画面中央に来る高さ) */
  private rollEndY = 0;
  /** スタッフロールが流れている最中か */
  private rolling = false;

  /** このゲームの戦績(スタッフロールに載せる) */
  private stats: BattleStats = emptyBattleStats();
  /** 倒した敵指揮官の名前(エピローグ本文へ差し込む) */
  private commander = '';
  /** インゲームから引き継ぐ音の設定 */
  private muted = false;
  private volume = 1;
  private audio!: SoundManager;

  /** ボタン押下をシーン全体の押下ハンドラが二重に拾わないようにする印 */
  private pointerConsumedByButton = false;

  constructor() {
    super('EndingScene');
  }

  /** インゲームから戦績・対戦相手・音の設定を受け取る */
  init(data: {
    stats?: BattleStats;
    commander?: string;
    muted?: boolean;
    volume?: number;
  }): void {
    this.stats = data.stats ?? emptyBattleStats();
    this.commander = data.commander ?? '';
    this.muted = data.muted ?? false;
    this.volume = data.volume ?? 1;
    this.index = 0;
    this.rolling = false;
    this.roll = null;
  }

  create(): void {
    // 直前がインゲーム(大きなマップ)でも崩れないよう、選択画面用の寸法へ戻す
    this.scale.resize(DEFAULT_DIMENSIONS.gameWidth, DEFAULT_DIMENSIONS.gameHeight);
    const width = DEFAULT_DIMENSIONS.gameWidth;
    const height = DEFAULT_DIMENSIONS.gameHeight;

    this.pageObjects = [];
    this.epilogueObjects = [];
    this.dots = [];

    // 背景(選択画面と同じ暗い下地)
    const bg = this.add.graphics();
    bg.fillStyle(0x12121e, 1);
    bg.fillRect(0, 0, width, height);

    // インゲームから引き継いだ音量・ミュートでエンディングBGMを流す。
    // この画面はクリック(結果画面のボタン)から始まるため、その操作を起点に再生できる。
    this.audio = new SoundManager();
    this.audio.bindPageVisibility();
    this.audio.setVolume(this.volume);
    this.audio.setMuted(this.muted);
    this.audio.unlock();
    this.audio.startBgm('ending');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.audio.dispose());

    this.createEpilogue(width);

    // 画面のどこを押してもページを進められるようにする(ボタンの押下は二重に拾わない)
    this.input.on(Phaser.Input.Events.POINTER_DOWN, () => {
      if (this.pointerConsumedByButton) {
        this.pointerConsumedByButton = false;
        return;
      }
      if (!this.rolling && this.roll === null) {
        this.advance();
      }
    });
  }

  /** エピローグ(カット + 本文 + ページ送り)の土台を作る */
  private createEpilogue(width: number): void {
    // スキップボタン(右上)。押すとスタッフロールの最後まで飛ばす
    const skip = this.createButton(
      width - 12 - BUTTON_WIDTH / 2,
      24,
      'スキップ ▶▶',
      () => {
        this.startRoll(width, DEFAULT_DIMENSIONS.gameHeight);
        this.finishRoll();
      },
    );
    this.epilogueObjects.push(...skip.objects);

    // 進捗ドット(ページ数ぶん)
    const gap = 18;
    const left = width / 2 - ((ENDING_SLIDES.length - 1) * gap) / 2;
    ENDING_SLIDES.forEach((_slide, index) => {
      const dot = this.add.circle(left + index * gap, DOTS_Y, 4, 0x3a4a6a);
      this.dots.push(dot);
      this.epilogueObjects.push(dot);
    });

    // 「次へ」ボタン(最後のページでは「スタッフロールへ」に変わる)
    this.nextButton = this.createButton(width / 2, NAV_Y, '', () => this.advance());
    this.epilogueObjects.push(...this.nextButton.objects);

    this.showPage(width);
  }

  /** 「次へ」ボタン(ラベルをページに応じて書き換えるため保持する) */
  private nextButton!: {
    readonly objects: Phaser.GameObjects.GameObject[];
    readonly label: Phaser.GameObjects.Text;
  };

  /** 現在のページ(カット・見出し・本文)を描き直す */
  private showPage(width: number): void {
    for (const object of this.pageObjects) {
      object.destroy();
    }
    this.pageObjects = [];

    const slide = ENDING_SLIDES[this.index];

    this.pageObjects.push(
      this.add
        .text(width / 2, TITLE_Y, slide.title, {
          fontFamily: 'sans-serif',
          fontSize: '20px',
          fontStyle: 'bold',
          color: '#ffd479',
        })
        .setOrigin(0.5),
    );

    // カット(コードで描いたミニ盤面)を枠付きで載せる
    const frame = this.add.graphics();
    frame.fillStyle(0x1a1a2e, 1);
    frame.fillRect(CUT_X - 8, CUT_Y - 8, CUT_WIDTH + 16, CUT_HEIGHT + 16);
    frame.lineStyle(2, 0x3a4a6a, 1);
    frame.strokeRect(CUT_X - 8, CUT_Y - 8, CUT_WIDTH + 16, CUT_HEIGHT + 16);
    this.pageObjects.push(frame);
    this.pageObjects.push(
      ...drawEndingCut(this, slide.cut, {
        x: CUT_X,
        y: CUT_Y,
        width: CUT_WIDTH,
        height: CUT_HEIGHT,
      }),
    );

    slide.body.forEach((line, index) => {
      this.pageObjects.push(
        this.add
          .text(width / 2, BODY_TOP + index * BODY_LINE_HEIGHT, this.text(line), {
            fontFamily: 'sans-serif',
            fontSize: '14px',
            color: '#e8e8f0',
            align: 'center',
            wordWrap: { width: width - 80 },
          })
          .setOrigin(0.5, 0),
      );
    });

    this.dots.forEach((dot, index) => {
      dot.setFillStyle(index === this.index ? 0x8ad0ff : 0x3a4a6a);
    });
    const isLast = this.index === ENDING_SLIDES.length - 1;
    this.nextButton.label.setText(isLast ? 'スタッフロール ▶' : '次へ ▶');

    // ページの切り替わりが分かるよう、カットと本文を淡くフェードインさせる
    for (const object of this.pageObjects) {
      const target = object as Phaser.GameObjects.GameObject & { alpha?: number };
      if (typeof target.alpha === 'number') {
        target.alpha = 0;
      }
    }
    this.tweens.add({ targets: this.pageObjects, alpha: 1, duration: 320 });
  }

  /** 本文の "{commander}" を対戦相手の名前へ差し替える */
  private text(line: string): string {
    return applyCommander(line, this.commander);
  }

  /** 次のページへ進む。最後のページまで見たらスタッフロールを始める */
  private advance(): void {
    if (this.index < ENDING_SLIDES.length - 1) {
      this.index += 1;
      this.showPage(DEFAULT_DIMENSIONS.gameWidth);
      return;
    }
    this.startRoll(DEFAULT_DIMENSIONS.gameWidth, DEFAULT_DIMENSIONS.gameHeight);
  }

  /** エピローグを片付け、スタッフロールを画面下から流し始める */
  private startRoll(width: number, height: number): void {
    if (this.roll !== null) {
      return;
    }
    for (const object of [...this.pageObjects, ...this.epilogueObjects]) {
      object.destroy();
    }
    this.pageObjects = [];
    this.epilogueObjects = [];
    this.dots = [];

    const container = this.add.container(0, height);
    let y = 0;

    const addLine = (
      text: string,
      style: Phaser.Types.GameObjects.Text.TextStyle,
      gap: number,
    ): Phaser.GameObjects.Text => {
      const label = this.add
        .text(width / 2, y, text, { fontFamily: 'sans-serif', ...style })
        .setOrigin(0.5, 0);
      container.add(label);
      y += gap;
      return label;
    };

    addLine(
      'CLEAR!',
      { fontSize: '30px', fontStyle: 'bold', color: '#ffd479' },
      ROLL_GAP.title,
    );
    addLine('戦いの記録', { fontSize: '17px', color: '#8ad0ff' }, 30);

    // 戦績はラベルを左、値を右に置いて表形式に見せる
    const statLeft = width / 2 - STAT_WIDTH / 2;
    for (const row of formatBattleStats(this.stats)) {
      const label = this.add
        .text(statLeft, y, row.label, {
          fontFamily: 'sans-serif',
          fontSize: '14px',
          color: '#c8c8d8',
        })
        .setOrigin(0, 0);
      const value = this.add
        .text(statLeft + STAT_WIDTH, y, row.value, {
          fontFamily: 'sans-serif',
          fontSize: '14px',
          fontStyle: 'bold',
          color: '#8affc0',
        })
        .setOrigin(1, 0);
      container.add([label, value]);
      y += ROLL_GAP.stat;
    }

    y += 24;
    for (const line of CREDIT_LINES) {
      addLine(line.text, CREDIT_STYLE[line.style], ROLL_GAP[line.style]);
    }

    y += 30;
    const theEnd = addLine(
      'THE END',
      { fontSize: '34px', fontStyle: 'bold', color: '#ffffff' },
      ROLL_GAP.end,
    );

    this.roll = container;
    // 「THE END」が画面中央へ来た位置で流れを止める
    this.rollEndY = height / 2 - theEnd.y - theEnd.height / 2;
    this.rolling = true;
  }

  /** スタッフロールを最後まで送り、モード選択へ戻るボタンを出す */
  private finishRoll(): void {
    if (this.roll === null) {
      return;
    }
    this.rolling = false;
    this.roll.setY(this.rollEndY);
    this.createButton(
      DEFAULT_DIMENSIONS.gameWidth / 2,
      DEFAULT_DIMENSIONS.gameHeight - 56,
      'モード選択へ',
      () => {
        this.audio.stopBgm();
        this.scene.start('ModeSelectScene');
      },
    );
  }

  update(_time: number, delta: number): void {
    if (!this.rolling || this.roll === null) {
      return;
    }
    const next = this.roll.y - (ROLL_SPEED * delta) / 1000;
    if (next <= this.rollEndY) {
      this.finishRoll();
      return;
    }
    this.roll.setY(next);
  }

  /** 角丸のない共通のボタン(下地 + ラベル)を作る */
  private createButton(
    centerX: number,
    centerY: number,
    label: string,
    onClick: () => void,
  ): {
    readonly objects: Phaser.GameObjects.GameObject[];
    readonly label: Phaser.GameObjects.Text;
  } {
    const rect = this.add
      .rectangle(centerX, centerY, BUTTON_WIDTH, BUTTON_HEIGHT, 0x1f2740)
      .setStrokeStyle(2, 0x3a4a6a)
      .setInteractive({ useHandCursor: true });
    const text = this.add
      .text(centerX, centerY, label, {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#8ad0ff',
      })
      .setOrigin(0.5);

    rect.on(Phaser.Input.Events.POINTER_OVER, () => {
      rect.setStrokeStyle(2, 0x8ad0ff);
      rect.setFillStyle(0x263255);
    });
    rect.on(Phaser.Input.Events.POINTER_OUT, () => {
      rect.setStrokeStyle(2, 0x3a4a6a);
      rect.setFillStyle(0x1f2740);
    });
    rect.on(Phaser.Input.Events.POINTER_DOWN, () => {
      // 画面全体の押下ハンドラがページ送りとして重ねて拾わないようにする
      this.pointerConsumedByButton = true;
      onClick();
    });

    return { objects: [rect, text], label: text };
  }
}

/** スタッフロールの行の見せ方ごとの文字設定 */
const CREDIT_STYLE: Readonly<
  Record<CreditStyle, Phaser.Types.GameObjects.Text.TextStyle>
> = {
  title: { fontSize: '22px', fontStyle: 'bold', color: '#8ad0ff' },
  heading: { fontSize: '15px', fontStyle: 'bold', color: '#ffd479' },
  role: { fontSize: '14px', color: '#e8e8f0' },
  note: { fontSize: '14px', color: '#8affc0' },
};
