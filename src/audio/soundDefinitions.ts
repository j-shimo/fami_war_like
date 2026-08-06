// 効果音と BGM の「楽譜データ」を定義する純粋モジュール。
// 実際の再生(Web Audio)からは切り離し、音の構成をデータとして外部化しておく。
// これにより音源データをコードから分離でき、Vitest で構造の妥当性を検証できる。

/** オシレータの波形。ファミコン風の音作りには square / triangle を主に使う */
export type WaveType = 'square' | 'triangle' | 'sawtooth' | 'sine';

/** 単一の音(トーン)。音名で高さを指定し、slideTo で終端へ音程を滑らせられる */
export interface ToneStep {
  readonly kind: 'tone';
  readonly wave: WaveType;
  /** 音名(例: "C5") */
  readonly note: string;
  /** 長さ(秒) */
  readonly duration: number;
  /** 音量(0〜1)。省略時はエンジン側の既定値 */
  readonly volume?: number;
  /** 指定すると note からこの音名へ音程を滑らせる(打撃・落下音などに使う) */
  readonly slideTo?: string;
}

/** ノイズ。打撃・爆発・撃破など非音程の効果音に使う */
export interface NoiseStep {
  readonly kind: 'noise';
  readonly duration: number;
  readonly volume?: number;
}

/** 無音。効果音内の間(ま)を作る */
export interface RestStep {
  readonly kind: 'rest';
  readonly duration: number;
}

/** 効果音を構成する 1 ステップ */
export type SfxStep = ToneStep | NoiseStep | RestStep;

/** 効果音 1 種。ステップを順番に鳴らす */
export interface SoundEffect {
  readonly steps: readonly SfxStep[];
}

/** 効果音の種類 */
export type SfxName =
  | 'select'
  | 'move'
  | 'attack'
  | 'defeat'
  | 'capture'
  | 'produce'
  | 'repair'
  | 'button'
  | 'denied'
  | 'turnPlayer'
  | 'turnEnemy'
  | 'victory'
  | 'lose';

/** トーンステップを簡潔に組み立てるヘルパ */
function tone(
  wave: WaveType,
  note: string,
  duration: number,
  options: { volume?: number; slideTo?: string } = {},
): ToneStep {
  return { kind: 'tone', wave, note, duration, ...options };
}

/** ノイズステップを組み立てるヘルパ */
function noise(duration: number, volume?: number): NoiseStep {
  return { kind: 'noise', duration, volume };
}

/** 効果音の定義集。各アクションに対応する短い音を用意する */
export const SOUND_EFFECTS: Record<SfxName, SoundEffect> = {
  // ユニット選択: 上昇する軽いブリップ
  select: {
    steps: [tone('square', 'C5', 0.05), tone('square', 'G5', 0.06)],
  },
  // 移動確定: 柔らかい単発ブリップ
  move: {
    steps: [tone('triangle', 'E4', 0.05), tone('triangle', 'A4', 0.06)],
  },
  // 攻撃: ノイズの打撃音 + 下降するヒット音
  attack: {
    steps: [
      noise(0.06, 0.35),
      tone('square', 'A4', 0.12, { slideTo: 'A2', volume: 0.3 }),
    ],
  },
  // 撃破: 下降ノイズ + 低音の爆発感
  defeat: {
    steps: [
      noise(0.12, 0.4),
      tone('sawtooth', 'A3', 0.22, { slideTo: 'A1', volume: 0.32 }),
      noise(0.1, 0.25),
    ],
  },
  // 占領: 上昇するアルペジオ(達成感)
  capture: {
    steps: [
      tone('square', 'C5', 0.07),
      tone('square', 'E5', 0.07),
      tone('square', 'G5', 0.07),
      tone('square', 'C6', 0.14),
    ],
  },
  // 生産: 確定の 2 音(上昇)
  produce: {
    steps: [tone('square', 'G4', 0.08), tone('square', 'C5', 0.16)],
  },
  // 修理: 穏やかに持ち上がる 2 音
  repair: {
    steps: [tone('triangle', 'E5', 0.09), tone('triangle', 'B5', 0.12)],
  },
  // ボタン操作: ごく短いクリック音
  button: {
    steps: [tone('square', 'E5', 0.04, { volume: 0.22 })],
  },
  // 操作不能(攻撃範囲外の敵を選ぶなど): 下降する 2 音で「できない」ことを伝える
  denied: {
    steps: [
      tone('square', 'A3', 0.08, { volume: 0.25 }),
      tone('square', 'E3', 0.14, { volume: 0.25 }),
    ],
  },
  // 自軍ターン開始: 明るい上昇ファンファーレ
  turnPlayer: {
    steps: [
      tone('square', 'C5', 0.1),
      tone('square', 'E5', 0.1),
      tone('square', 'G5', 0.1),
      tone('square', 'C6', 0.2),
    ],
  },
  // 敵軍ターン開始: 低めで不穏なファンファーレ
  turnEnemy: {
    steps: [
      tone('square', 'A4', 0.1),
      tone('square', 'F4', 0.1),
      tone('square', 'D4', 0.22),
    ],
  },
  // 勝利: 華やかなファンファーレ
  victory: {
    steps: [
      tone('square', 'C5', 0.12),
      tone('square', 'E5', 0.12),
      tone('square', 'G5', 0.12),
      tone('square', 'C6', 0.12),
      tone('square', 'G5', 0.1),
      tone('square', 'C6', 0.34),
    ],
  },
  // 敗北: 力なく下降する音
  lose: {
    steps: [
      tone('square', 'G4', 0.16),
      tone('square', 'E4', 0.16),
      tone('square', 'C4', 0.16),
      tone('triangle', 'G3', 0.4, { slideTo: 'C3' }),
    ],
  },
};

/** BGM の 1 音。note が null なら休符 */
export interface BgmNote {
  readonly note: string | null;
  /** 拍数(4 分音符 = 1 拍) */
  readonly beats: number;
}

/** BGM の 1 チャンネル(声部)。旋律・低音などを別チャンネルで重ねる */
export interface BgmChannel {
  readonly wave: WaveType;
  readonly volume: number;
  readonly notes: readonly BgmNote[];
}

/** ループ再生する BGM トラック */
export interface BgmTrack {
  /** テンポ(1 分あたりの拍数) */
  readonly bpm: number;
  /** 同時に鳴らすチャンネル群 */
  readonly channels: readonly BgmChannel[];
}

/** BGM の種類。手番の軍勢で曲調を切り替える */
export type BgmName = 'playerBattle' | 'enemyBattle';

/** BGM ノートを簡潔に書くヘルパ */
function n(note: string | null, beats: number): BgmNote {
  return { note, beats };
}

/**
 * 自軍ターンの戦闘 BGM。ハ長調で行進曲風の明るいループ。
 * 旋律(square)と低音(triangle)の 2 声部からなり、各声部は 16 拍で一巡する。
 */
const PLAYER_BATTLE: BgmTrack = {
  bpm: 132,
  channels: [
    {
      wave: 'square',
      volume: 0.16,
      notes: [
        n('G4', 1),
        n('C5', 1),
        n('E5', 1),
        n('G5', 1),
        n('E5', 1),
        n('C5', 1),
        n('G4', 1),
        n(null, 1),
        n('A4', 1),
        n('C5', 1),
        n('F5', 1),
        n('A5', 1),
        n('G5', 1),
        n('E5', 1),
        n('C5', 2),
      ],
    },
    {
      wave: 'triangle',
      volume: 0.22,
      notes: [
        n('C3', 2),
        n('C3', 2),
        n('G2', 2),
        n('G2', 2),
        n('F2', 2),
        n('F2', 2),
        n('G2', 2),
        n('G2', 2),
      ],
    },
  ],
};

/**
 * 敵軍ターンの戦闘 BGM。イ短調で緊張感のあるループ。
 * 構成は自軍テーマと同じ 2 声部・16 拍で、曲調だけを暗くして手番を聴き分けられるようにする。
 */
const ENEMY_BATTLE: BgmTrack = {
  bpm: 144,
  channels: [
    {
      wave: 'square',
      volume: 0.15,
      notes: [
        n('A4', 1),
        n('C5', 1),
        n('E5', 1),
        n('A5', 1),
        n('G5', 1),
        n('E5', 1),
        n('A4', 1),
        n(null, 1),
        n('F4', 1),
        n('A4', 1),
        n('D5', 1),
        n('F5', 1),
        n('E5', 1),
        n('C5', 1),
        n('A4', 2),
      ],
    },
    {
      wave: 'triangle',
      volume: 0.22,
      notes: [
        n('A2', 2),
        n('A2', 2),
        n('F2', 2),
        n('F2', 2),
        n('G2', 2),
        n('G2', 2),
        n('E2', 2),
        n('E2', 2),
      ],
    },
  ],
};

/** BGM トラックの定義集 */
export const BGM_TRACKS: Record<BgmName, BgmTrack> = {
  playerBattle: PLAYER_BATTLE,
  enemyBattle: ENEMY_BATTLE,
};

/** 拍数をテンポに応じた秒数へ変換する */
export function beatsToSeconds(beats: number, bpm: number): number {
  return (beats / bpm) * 60;
}

/** チャンネルの総拍数(ループ長)を返す */
export function channelTotalBeats(channel: BgmChannel): number {
  return channel.notes.reduce((sum, note) => sum + note.beats, 0);
}
