import Phaser from 'phaser';

import {
  DEFAULT_GAME_MODE,
  sideLabel,
  versusLabel,
  type GameMode,
  type MapGroup,
  type PlayerSide,
  type VersusMode,
} from '@/core/mode/GameMode';
import { readGameMode, writeGameMode } from '@/core/settings/SettingsStorage';
import { DEFAULT_DIMENSIONS } from '@/data/gameConfig';
import { MAP_LIST, mapsInGroup } from '@/data/maps';

/** 切替ボタン(担当サイド・操作の設定)の寸法と間隔 */
const TOGGLE_HEIGHT = 30;
const TOGGLE_GAP = 10;

/** 担当サイドの行(ボタン中心・説明文)の縦位置 */
const SIDE_ROW_CENTER_Y = 104;
const SIDE_HINT_Y = 130;
/** 担当サイドのボタン幅 */
const SIDE_BUTTON_WIDTH = 130;

/** 操作の設定の行(ボタン中心・説明文)の縦位置 */
const VERSUS_ROW_CENTER_Y = 168;
const VERSUS_HINT_Y = 194;
/** 操作の設定のボタン幅(ラベルが長いため広めに取る) */
const VERSUS_BUTTON_WIDTH = 200;

/** マップ選択画面への入口ボタンの寸法と並べ方 */
const MENU_BUTTON_WIDTH = 420;
const MENU_BUTTON_HEIGHT = 52;
const MENU_BUTTON_GAP = 14;
const MENU_TOP = 224;

/** 行の左に置く見出しラベルと、ボタン列との間隔 */
const ROW_LABEL_GAP = 12;

/** 選択中・未選択のボタンの色 */
const SELECTED_FILL = 0x2d3b5a;
const UNSELECTED_FILL = 0x1f2740;
const SELECTED_STROKE = 0x8ad0ff;
const UNSELECTED_STROKE = 0x3a4a6a;

/** 担当サイドごとの説明文 */
const SIDE_HINT: Readonly<Record<PlayerSide, string>> = {
  '1p': 'マップ本来の自軍(青)を担当します',
  '2p': '自軍と敵軍を入れ替えて敵軍(赤)側を担当し、後手番で戦います',
};

/** 操作の設定ごとの説明文 */
const VERSUS_HINT: Readonly<Record<VersusMode, string>> = {
  cpu: '相手の手番は敵軍AIが自動で行動します',
  human: '1 台の画面を交代で使い、両陣営とも人が操作します',
};

/** マップ選択画面への入口 1 つぶんの定義 */
interface MapMenuItem {
  readonly group: MapGroup;
  readonly title: string;
  readonly caption: string;
}

/** 並べる入口(通常マップ → 新マップ → 4Pマップ) */
const MAP_MENU: readonly MapMenuItem[] = [
  {
    group: 'standard',
    title: '通常マップ',
    caption: 'これまで遊んできたマップから選びます',
  },
  {
    group: 'new',
    title: '新マップ',
    caption: '追加要素を入れたマップから選びます',
  },
  {
    group: 'four',
    title: '4Pマップ',
    caption: '4 人で遊べるマップから選びます',
  },
];

/** 切替ボタン 1 つぶんの表示物(選択状態に応じて塗り替える) */
interface ToggleButton<T> {
  readonly value: T;
  readonly rect: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
}

/**
 * マップ選択画面の前に表示するモード選択画面(起動直後の最初の画面)。
 * ここでは「どう遊ぶか」を決め、マップそのものは次のマップ選択画面で選ぶ。
 *
 * - 担当サイド: 1P側(これまでどおり)か 2P側(自軍・敵軍を入れ替えて後手番)か
 * - 操作の設定: プレイヤー vs CPU か、プレイヤー vs プレイヤー(交代で操作)か
 * - マップ区分: 通常マップ / 新マップ / 4Pマップ のどの一覧へ進むか
 *
 * 選んだ担当サイド・操作の設定はゲーム設定として保存し、次回の起動時にも引き継ぐ。
 * 詳細は docs/GameDesign.md「モード選択」を参照。
 */
export class ModeSelectScene extends Phaser.Scene {
  /** 現在選んでいる遊び方(担当サイド・操作の設定) */
  private mode: GameMode = DEFAULT_GAME_MODE;
  private sideButtons: ToggleButton<PlayerSide>[] = [];
  private versusButtons: ToggleButton<VersusMode>[] = [];
  private sideHint!: Phaser.GameObjects.Text;
  private versusHint!: Phaser.GameObjects.Text;

  constructor() {
    super('ModeSelectScene');
  }

  create(): void {
    // 直前がインゲーム(大きなマップ)でも崩れないよう、選択画面用の寸法へ戻す
    this.scale.resize(DEFAULT_DIMENSIONS.gameWidth, DEFAULT_DIMENSIONS.gameHeight);
    const width = DEFAULT_DIMENSIONS.gameWidth;
    const height = DEFAULT_DIMENSIONS.gameHeight;

    this.mode = readGameMode();
    this.sideButtons = [];
    this.versusButtons = [];

    // 背景
    const bg = this.add.graphics();
    bg.fillStyle(0x12121e, 1);
    bg.fillRect(0, 0, width, height);

    this.add
      .text(width / 2, 30, 'モード選択', {
        fontFamily: 'sans-serif',
        fontSize: '28px',
        fontStyle: 'bold',
        color: '#8ad0ff',
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 58, '遊び方を選んでから、マップ選択へ進んでください', {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5);

    this.createSideSelector(width);
    this.createVersusSelector(width);
    this.createMapMenu(width);
  }

  /** 担当サイド(1P側 / 2P側)の切替ボタンを並べる */
  private createSideSelector(width: number): void {
    const values: readonly PlayerSide[] = ['1p', '2p'];
    const left = this.rowLeft(width, SIDE_BUTTON_WIDTH, values.length);
    this.addRowLabel(left, SIDE_ROW_CENTER_Y, 'プレイヤー');

    values.forEach((side, index) => {
      const x = left + index * (SIDE_BUTTON_WIDTH + TOGGLE_GAP);
      this.sideButtons.push(
        this.createToggleButton(
          side,
          sideLabel(side),
          x,
          SIDE_ROW_CENTER_Y,
          SIDE_BUTTON_WIDTH,
          () => this.selectSide(side),
        ),
      );
    });

    this.sideHint = this.add
      .text(width / 2, SIDE_HINT_Y, '', {
        fontFamily: 'sans-serif',
        fontSize: '12px',
        color: '#c8c8d8',
      })
      .setOrigin(0.5);
    this.updateSideSelector();
  }

  /** 操作の設定(対 CPU / 対人戦)の切替ボタンを並べる */
  private createVersusSelector(width: number): void {
    const values: readonly VersusMode[] = ['cpu', 'human'];
    const left = this.rowLeft(width, VERSUS_BUTTON_WIDTH, values.length);
    this.addRowLabel(left, VERSUS_ROW_CENTER_Y, '操作');

    values.forEach((versus, index) => {
      const x = left + index * (VERSUS_BUTTON_WIDTH + TOGGLE_GAP);
      this.versusButtons.push(
        this.createToggleButton(
          versus,
          versusLabel(versus),
          x,
          VERSUS_ROW_CENTER_Y,
          VERSUS_BUTTON_WIDTH,
          () => this.selectVersus(versus),
        ),
      );
    });

    this.versusHint = this.add
      .text(width / 2, VERSUS_HINT_Y, '', {
        fontFamily: 'sans-serif',
        fontSize: '12px',
        color: '#c8c8d8',
      })
      .setOrigin(0.5);
    this.updateVersusSelector();
  }

  /** マップ選択画面への入口ボタン(通常 / 新 / 4P)を縦に並べる */
  private createMapMenu(width: number): void {
    const left = width / 2 - MENU_BUTTON_WIDTH / 2;

    MAP_MENU.forEach((item, index) => {
      const y = MENU_TOP + index * (MENU_BUTTON_HEIGHT + MENU_BUTTON_GAP);
      // まだ 1 枚も用意していない区分は、進んだ先が空であることを先に伝える
      const ready = mapsInGroup(MAP_LIST, item.group).length > 0;

      const button = this.add
        .rectangle(left, y, MENU_BUTTON_WIDTH, MENU_BUTTON_HEIGHT, UNSELECTED_FILL)
        .setOrigin(0, 0)
        .setStrokeStyle(2, ready ? UNSELECTED_STROKE : 0x2a3350)
        .setInteractive({ useHandCursor: true });

      this.add
        .text(left + 16, y + 14, item.title, {
          fontFamily: 'sans-serif',
          fontSize: '17px',
          fontStyle: 'bold',
          color: ready ? '#ffffff' : '#8a8aa0',
        })
        .setOrigin(0, 0);
      this.add
        .text(
          left + MENU_BUTTON_WIDTH - 16,
          y + MENU_BUTTON_HEIGHT / 2,
          ready ? item.caption : '準備中',
          {
            fontFamily: 'sans-serif',
            fontSize: '12px',
            color: ready ? '#c8c8d8' : '#ff9a6a',
          },
        )
        .setOrigin(1, 0.5);

      button.on(Phaser.Input.Events.POINTER_OVER, () => {
        button.setStrokeStyle(2, SELECTED_STROKE);
        button.setFillStyle(0x263255);
      });
      button.on(Phaser.Input.Events.POINTER_OUT, () => {
        button.setStrokeStyle(2, ready ? UNSELECTED_STROKE : 0x2a3350);
        button.setFillStyle(UNSELECTED_FILL);
      });
      button.on(Phaser.Input.Events.POINTER_DOWN, () => {
        this.scene.start('MapSelectScene', { group: item.group });
      });
    });
  }

  /** ボタン列全体を中央へ寄せたときの、左端の X 座標を返す */
  private rowLeft(width: number, buttonWidth: number, count: number): number {
    const totalWidth = buttonWidth * count + TOGGLE_GAP * (count - 1);
    return width / 2 - totalWidth / 2;
  }

  /** ボタン列の左に置く見出しラベルを作る */
  private addRowLabel(left: number, centerY: number, text: string): void {
    this.add
      .text(left - ROW_LABEL_GAP, centerY, text, {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: '#c8c8d8',
      })
      .setOrigin(1, 0.5);
  }

  /** 切替ボタン 1 つを作る(選択状態の塗り分けは呼び出し側が行う) */
  private createToggleButton<T>(
    value: T,
    label: string,
    x: number,
    centerY: number,
    buttonWidth: number,
    onSelect: () => void,
  ): ToggleButton<T> {
    const rect = this.add
      .rectangle(
        x,
        centerY - TOGGLE_HEIGHT / 2,
        buttonWidth,
        TOGGLE_HEIGHT,
        UNSELECTED_FILL,
      )
      .setOrigin(0, 0)
      .setStrokeStyle(2, UNSELECTED_STROKE)
      .setInteractive({ useHandCursor: true });
    const text = this.add
      .text(x + buttonWidth / 2, centerY, label, {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#c8c8d8',
      })
      .setOrigin(0.5);
    rect.on(Phaser.Input.Events.POINTER_DOWN, onSelect);
    return { value, rect, label: text };
  }

  /** 担当サイドを切り替えて保存する */
  private selectSide(side: PlayerSide): void {
    if (this.mode.side === side) {
      return;
    }
    this.mode = { ...this.mode, side };
    writeGameMode(this.mode);
    this.updateSideSelector();
  }

  /** 操作の設定を切り替えて保存する */
  private selectVersus(versus: VersusMode): void {
    if (this.mode.versus === versus) {
      return;
    }
    this.mode = { ...this.mode, versus };
    writeGameMode(this.mode);
    this.updateVersusSelector();
  }

  /** 担当サイドのボタンと説明文を現在の選択に合わせて描き直す */
  private updateSideSelector(): void {
    this.paintToggles(this.sideButtons, this.mode.side);
    this.sideHint.setText(SIDE_HINT[this.mode.side]);
  }

  /** 操作の設定のボタンと説明文を現在の選択に合わせて描き直す */
  private updateVersusSelector(): void {
    this.paintToggles(this.versusButtons, this.mode.versus);
    this.versusHint.setText(VERSUS_HINT[this.mode.versus]);
  }

  /** 切替ボタン列の見た目を、選択中の値に合わせて塗り分ける */
  private paintToggles<T>(buttons: readonly ToggleButton<T>[], selected: T): void {
    for (const button of buttons) {
      const isSelected = button.value === selected;
      button.rect.setFillStyle(isSelected ? SELECTED_FILL : UNSELECTED_FILL);
      button.rect.setStrokeStyle(2, isSelected ? SELECTED_STROKE : UNSELECTED_STROKE);
      button.label.setColor(isSelected ? '#8ad0ff' : '#c8c8d8');
    }
  }
}
