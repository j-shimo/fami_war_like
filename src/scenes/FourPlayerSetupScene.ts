import Phaser from 'phaser';

import {
  canStartFourPlayer,
  FOUR_PLAYER_ARMIES,
  MIN_PARTICIPANTS,
  participatingArmies,
  playerNumberLabel,
  SLOT_CONTROLS,
  slotControlLabel,
  withSlot,
  type FourPlayerSetup,
  type SlotControl,
} from '@/core/mode/FourPlayerSetup';
import {
  readFourPlayerSetup,
  writeFourPlayerSetup,
} from '@/core/settings/SettingsStorage';
import type { TurnArmy } from '@/core/turn/TurnManager';
import { aiCharacterLabel, getAiCharacter } from '@/data/aiCharacters';
import { ARMY_TEXT_COLOR, UNIT_BODY_COLOR } from '@/data/armyColors';
import { DEFAULT_DIMENSIONS } from '@/data/gameConfig';
import { AiCharacterWindow } from '@/rendering/AiCharacterWindow';

/** 軍勢 1 行ぶんの縦位置(1 行目の中心と行の間隔) */
const ROW_TOP_CENTER_Y = 118;
const ROW_SPACING = 64;
/** 行の左端に置く軍勢の番号札(1P〜4P)の中心 X と半径 */
const BADGE_CENTER_X = 50;
const BADGE_RADIUS = 18;

/** 操作(プレイヤー / コンピューター / なし)の切替ボタン */
const CONTROL_LEFT = 84;
const CONTROL_BUTTON_WIDTH = 104;
const CONTROL_BUTTON_GAP = 6;
const CONTROL_BUTTON_HEIGHT = 30;

/** 指揮官ボタン(押すと指揮官の一覧を開く) */
const CHARACTER_LEFT = 424;
const CHARACTER_BUTTON_WIDTH = 236;
const CHARACTER_BUTTON_HEIGHT = 30;
const CHARACTER_EMBLEM_RADIUS = 6;
const CHARACTER_EMBLEM_MARGIN = 10;

/** 操作ごとの説明(行の下に小さく出す) */
const CONTROL_HINT: Readonly<Record<SlotControl, string>> = {
  human: 'プレイヤーが操作します(指揮官は攻撃補正のみ)',
  cpu: 'コンピューターが操作します(指揮官の思考パターンで戦います)',
  none: '参加しません(陣地は中立の拠点になります)',
};

/** 「マップ選択へ」ボタンの寸法と位置 */
const START_BUTTON_WIDTH = 240;
const START_BUTTON_HEIGHT = 40;
const START_BUTTON_TOP = 420;
/** 設定の状態(始められない理由など)を出す行の縦位置 */
const STATUS_Y = 398;

/** 左上の「戻る」ボタン */
const BACK_BUTTON_WIDTH = 74;
const BACK_BUTTON_HEIGHT = 30;
const BACK_BUTTON_X = 12;
const BACK_BUTTON_CENTER_Y = 24;

/** 選択中・未選択のボタンの色(モード選択画面とそろえる) */
const SELECTED_FILL = 0x2d3b5a;
const UNSELECTED_FILL = 0x1f2740;
const SELECTED_STROKE = 0x8ad0ff;
const UNSELECTED_STROKE = 0x3a4a6a;
const DISABLED_FILL = 0x181c2a;
const DISABLED_STROKE = 0x2a3350;

/** 軍勢 1 行ぶんの表示物(選択が変わるたびに塗り替える) */
interface SlotRow {
  readonly army: TurnArmy;
  readonly centerY: number;
  readonly controls: readonly {
    readonly control: SlotControl;
    readonly rect: Phaser.GameObjects.Rectangle;
    readonly label: Phaser.GameObjects.Text;
  }[];
  readonly characterRect: Phaser.GameObjects.Rectangle;
  readonly characterEmblem: Phaser.GameObjects.Graphics;
  readonly characterLabel: Phaser.GameObjects.Text;
  readonly characterArrow: Phaser.GameObjects.Text;
  readonly hint: Phaser.GameObjects.Text;
}

/**
 * 4P マップの遊び方を決める設定画面(モード選択画面の「4Pマップ」から入る)。
 * 1P〜4P の軍勢ごとに、次の 2 つを選ぶ。
 *
 * - 操作: プレイヤー / コンピューター / なし(参加しない)
 * - 指揮官: 実装済みの指揮官から選ぶ(操作が「なし」の軍勢では選べない)
 *
 * 参加する軍勢が 2 つ以上あれば「マップ選択へ」で 4P マップの一覧へ進める。
 * 選んだ内容はゲーム設定として保存し、次回もこの画面の初期値に使う。
 * 詳細は docs/GameDesign.md「4Pモード」を参照。
 */
export class FourPlayerSetupScene extends Phaser.Scene {
  /** 現在の設定 */
  private setup!: FourPlayerSetup;
  private rows: SlotRow[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private startRect!: Phaser.GameObjects.Rectangle;
  private startLabel!: Phaser.GameObjects.Text;
  /** 指揮官の一覧・説明を見せるウィンドウ(初回オープン時に生成。全軍勢で共用する) */
  private characterWindow: AiCharacterWindow | null = null;

  constructor() {
    super('FourPlayerSetupScene');
  }

  create(): void {
    // 直前がインゲーム(大きなマップ)でも崩れないよう、選択画面用の寸法へ戻す
    this.scale.resize(DEFAULT_DIMENSIONS.gameWidth, DEFAULT_DIMENSIONS.gameHeight);
    const width = DEFAULT_DIMENSIONS.gameWidth;
    const height = DEFAULT_DIMENSIONS.gameHeight;

    this.setup = readFourPlayerSetup();
    this.rows = [];
    this.characterWindow = null;

    const bg = this.add.graphics();
    bg.fillStyle(0x12121e, 1);
    bg.fillRect(0, 0, width, height);

    this.add
      .text(width / 2, 30, '4Pモード設定', {
        fontFamily: 'sans-serif',
        fontSize: '28px',
        fontStyle: 'bold',
        color: '#8ad0ff',
      })
      .setOrigin(0.5);
    this.add
      .text(
        width / 2,
        60,
        '各軍勢の操作と指揮官を選んでから、マップ選択へ進んでください',
        {
          fontFamily: 'sans-serif',
          fontSize: '13px',
          color: '#aaaaaa',
        },
      )
      .setOrigin(0.5);
    this.add
      .text(CONTROL_LEFT, 82, '操作', {
        fontFamily: 'sans-serif',
        fontSize: '12px',
        color: '#8a8aa0',
      })
      .setOrigin(0, 0.5);
    this.add
      .text(CHARACTER_LEFT, 82, '指揮官', {
        fontFamily: 'sans-serif',
        fontSize: '12px',
        color: '#8a8aa0',
      })
      .setOrigin(0, 0.5);

    this.createBackButton();
    FOUR_PLAYER_ARMIES.forEach((army, index) => {
      this.rows.push(this.createRow(army, ROW_TOP_CENTER_Y + index * ROW_SPACING));
    });
    this.createStartButton(width);
    this.refresh();

    // シーンを抜けるときに、開いたままの指揮官ウィンドウを片付ける
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.characterWindow?.close();
      this.characterWindow = null;
    });
  }

  /** 軍勢 1 行(番号札・操作の切替・指揮官ボタン・説明)を作る */
  private createRow(army: TurnArmy, centerY: number): SlotRow {
    // 軍勢の色の番号札
    const badge = this.add.graphics();
    badge.fillStyle(UNIT_BODY_COLOR[army], 1);
    badge.fillCircle(BADGE_CENTER_X, centerY, BADGE_RADIUS);
    badge.lineStyle(2, 0xffffff, 0.9);
    badge.strokeCircle(BADGE_CENTER_X, centerY, BADGE_RADIUS);
    this.add
      .text(BADGE_CENTER_X, centerY, playerNumberLabel(army), {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const controls = SLOT_CONTROLS.map((control, index) => {
      const x = CONTROL_LEFT + index * (CONTROL_BUTTON_WIDTH + CONTROL_BUTTON_GAP);
      const rect = this.add
        .rectangle(
          x,
          centerY - CONTROL_BUTTON_HEIGHT / 2,
          CONTROL_BUTTON_WIDTH,
          CONTROL_BUTTON_HEIGHT,
          UNSELECTED_FILL,
        )
        .setOrigin(0, 0)
        .setStrokeStyle(2, UNSELECTED_STROKE)
        .setInteractive({ useHandCursor: true });
      const label = this.add
        .text(x + CONTROL_BUTTON_WIDTH / 2, centerY, slotControlLabel(control), {
          fontFamily: 'sans-serif',
          fontSize: '13px',
          fontStyle: 'bold',
          color: '#c8c8d8',
        })
        .setOrigin(0.5);
      rect.on(Phaser.Input.Events.POINTER_DOWN, () => this.selectControl(army, control));
      return { control, rect, label };
    });

    const characterRect = this.add
      .rectangle(
        CHARACTER_LEFT,
        centerY - CHARACTER_BUTTON_HEIGHT / 2,
        CHARACTER_BUTTON_WIDTH,
        CHARACTER_BUTTON_HEIGHT,
        UNSELECTED_FILL,
      )
      .setOrigin(0, 0)
      .setStrokeStyle(2, UNSELECTED_STROKE)
      .setInteractive({ useHandCursor: true });
    const characterEmblem = this.add.graphics();
    const characterLabel = this.add
      .text(
        CHARACTER_LEFT + CHARACTER_EMBLEM_MARGIN + CHARACTER_EMBLEM_RADIUS * 2 + 8,
        centerY,
        '',
        {
          fontFamily: 'sans-serif',
          fontSize: '13px',
          fontStyle: 'bold',
          color: '#8ad0ff',
        },
      )
      .setOrigin(0, 0.5);
    const characterArrow = this.add
      .text(CHARACTER_LEFT + CHARACTER_BUTTON_WIDTH - 8, centerY, '▼', {
        fontFamily: 'sans-serif',
        fontSize: '10px',
        color: '#8ad0ff',
      })
      .setOrigin(1, 0.5);
    characterRect.on(Phaser.Input.Events.POINTER_OVER, () => {
      if (this.setup[army].control !== 'none') {
        characterRect.setStrokeStyle(2, SELECTED_STROKE);
      }
    });
    characterRect.on(Phaser.Input.Events.POINTER_OUT, () => this.refresh());
    characterRect.on(Phaser.Input.Events.POINTER_DOWN, () =>
      this.openCharacterWindow(army),
    );

    const hint = this.add
      .text(CONTROL_LEFT, centerY + CONTROL_BUTTON_HEIGHT / 2 + 4, '', {
        fontFamily: 'sans-serif',
        fontSize: '11px',
        color: '#8a8aa0',
      })
      .setOrigin(0, 0);

    return {
      army,
      centerY,
      controls,
      characterRect,
      characterEmblem,
      characterLabel,
      characterArrow,
      hint,
    };
  }

  /** 「マップ選択へ」ボタンと、その上の状態表示を作る */
  private createStartButton(width: number): void {
    this.statusText = this.add
      .text(width / 2, STATUS_Y, '', {
        fontFamily: 'sans-serif',
        fontSize: '12px',
        color: '#c8c8d8',
      })
      .setOrigin(0.5);

    const left = width / 2 - START_BUTTON_WIDTH / 2;
    this.startRect = this.add
      .rectangle(
        left,
        START_BUTTON_TOP,
        START_BUTTON_WIDTH,
        START_BUTTON_HEIGHT,
        UNSELECTED_FILL,
      )
      .setOrigin(0, 0)
      .setStrokeStyle(2, UNSELECTED_STROKE)
      .setInteractive({ useHandCursor: true });
    this.startLabel = this.add
      .text(width / 2, START_BUTTON_TOP + START_BUTTON_HEIGHT / 2, 'マップ選択へ ▶', {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.startRect.on(Phaser.Input.Events.POINTER_DOWN, () => this.goToMapSelect());
  }

  /** モード選択画面へ戻るボタンを左上に置く */
  private createBackButton(): void {
    const cx = BACK_BUTTON_X + BACK_BUTTON_WIDTH / 2;
    const button = this.add
      .rectangle(
        cx,
        BACK_BUTTON_CENTER_Y,
        BACK_BUTTON_WIDTH,
        BACK_BUTTON_HEIGHT,
        UNSELECTED_FILL,
      )
      .setStrokeStyle(2, UNSELECTED_STROKE)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(cx, BACK_BUTTON_CENTER_Y, '← 戻る', {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#8ad0ff',
      })
      .setOrigin(0.5);
    button.on(Phaser.Input.Events.POINTER_OVER, () => {
      button.setStrokeStyle(2, SELECTED_STROKE);
    });
    button.on(Phaser.Input.Events.POINTER_OUT, () => {
      button.setStrokeStyle(2, UNSELECTED_STROKE);
    });
    button.on(Phaser.Input.Events.POINTER_DOWN, () => {
      if (this.isWindowOpen()) {
        return;
      }
      this.scene.start('ModeSelectScene');
    });
  }

  /** 指揮官の一覧ウィンドウが開いているか(開いている間は背後のボタンを押させない) */
  private isWindowOpen(): boolean {
    return this.characterWindow?.isOpen() === true;
  }

  /** 軍勢の操作を切り替えて保存する */
  private selectControl(army: TurnArmy, control: SlotControl): void {
    if (this.isWindowOpen() || this.setup[army].control === control) {
      return;
    }
    this.updateSetup(withSlot(this.setup, army, { control }));
  }

  /** 軍勢の指揮官を選ぶウィンドウを開く(操作が「なし」の軍勢では開かない) */
  private openCharacterWindow(army: TurnArmy): void {
    const slot = this.setup[army];
    if (this.isWindowOpen() || slot.control === 'none') {
      return;
    }
    const width = DEFAULT_DIMENSIONS.gameWidth;
    const height = DEFAULT_DIMENSIONS.gameHeight;
    this.characterWindow ??= new AiCharacterWindow(this);
    this.characterWindow.open({
      gameWidth: width,
      gameHeight: height,
      viewWidth: width,
      viewHeight: height,
      selectedId: slot.characterId,
      title: `${playerNumberLabel(army)}の指揮官を選ぶ`,
      hint:
        slot.control === 'human'
          ? '一覧から選ぶと指揮官が切り替わります(プレイヤー操作では攻撃補正のみ)'
          : '一覧から選ぶと指揮官が切り替わります',
      onSelect: (id) => {
        if (this.setup[army].characterId !== id) {
          this.updateSetup(withSlot(this.setup, army, { characterId: id }));
        }
      },
      onClose: () => this.refresh(),
    });
  }

  /** 設定を差し替えて保存し、表示を描き直す */
  private updateSetup(setup: FourPlayerSetup): void {
    this.setup = setup;
    writeFourPlayerSetup(setup);
    this.refresh();
  }

  /** 設定が揃っていれば 4P マップの一覧へ進む */
  private goToMapSelect(): void {
    if (this.isWindowOpen() || !canStartFourPlayer(this.setup)) {
      return;
    }
    this.scene.start('MapSelectScene', { group: 'four' });
  }

  /** すべての行と「マップ選択へ」ボタンを、現在の設定に合わせて描き直す */
  private refresh(): void {
    for (const row of this.rows) {
      this.paintRow(row);
    }
    const ready = canStartFourPlayer(this.setup);
    const count = participatingArmies(this.setup).length;
    this.statusText
      .setText(
        ready
          ? `${count} 軍で対戦します(手番は 1P → 2P → 3P → 4P の順)`
          : `参加する軍勢を ${MIN_PARTICIPANTS} つ以上にしてください`,
      )
      .setColor(ready ? '#c8c8d8' : '#ff9a6a');
    this.startRect
      .setFillStyle(ready ? SELECTED_FILL : DISABLED_FILL)
      .setStrokeStyle(2, ready ? SELECTED_STROKE : DISABLED_STROKE);
    this.startLabel.setColor(ready ? '#ffffff' : '#666677');
  }

  /** 軍勢 1 行を現在の設定に合わせて塗り直す */
  private paintRow(row: SlotRow): void {
    const slot = this.setup[row.army];
    for (const button of row.controls) {
      const selected = button.control === slot.control;
      button.rect.setFillStyle(selected ? SELECTED_FILL : UNSELECTED_FILL);
      button.rect.setStrokeStyle(2, selected ? SELECTED_STROKE : UNSELECTED_STROKE);
      button.label.setColor(selected ? '#8ad0ff' : '#c8c8d8');
    }
    row.hint.setText(CONTROL_HINT[slot.control]);

    const cx = CHARACTER_LEFT + CHARACTER_EMBLEM_MARGIN + CHARACTER_EMBLEM_RADIUS;
    row.characterEmblem.clear();
    if (slot.control === 'none') {
      // 参加しない軍勢は指揮官を選べないため、ボタンを暗くして中身を出さない
      row.characterRect.setFillStyle(DISABLED_FILL).setStrokeStyle(2, DISABLED_STROKE);
      row.characterLabel.setText('(参加しない)').setColor('#666677');
      row.characterArrow.setVisible(false);
      return;
    }
    const character = getAiCharacter(slot.characterId);
    const bonus =
      character.attackBonus > 0 ? ` +${Math.round(character.attackBonus * 100)}%` : '';
    row.characterRect.setFillStyle(UNSELECTED_FILL).setStrokeStyle(2, UNSELECTED_STROKE);
    row.characterLabel
      .setText(`${aiCharacterLabel(character)}${bonus}`)
      .setColor(ARMY_TEXT_COLOR[row.army]);
    row.characterArrow.setVisible(true);
    row.characterEmblem.fillStyle(character.emblemColor, 1);
    row.characterEmblem.fillCircle(cx, row.centerY, CHARACTER_EMBLEM_RADIUS);
    row.characterEmblem.lineStyle(2, 0xffffff, 0.9);
    row.characterEmblem.strokeCircle(cx, row.centerY, CHARACTER_EMBLEM_RADIUS);
  }
}
