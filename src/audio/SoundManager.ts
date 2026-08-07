// 効果音と BGM の再生を統括する高レベル API。
// 音源データ(soundDefinitions)を SoundEngine で鳴らし、BGM のループ・ミュートを管理する。
// ゲーム側(MainScene)はこのクラスのメソッドだけを呼べばよい。

import { SoundEngine } from '@/audio/SoundEngine';
import {
  BGM_TRACKS,
  SOUND_EFFECTS,
  beatsToSeconds,
  channelTotalBeats,
  type BgmName,
  type BgmTrack,
  type SfxName,
} from '@/audio/soundDefinitions';

/** 効果音ステップの既定音量(volume 未指定時に使う) */
const DEFAULT_STEP_VOLUME = 0.3;
/**
 * 音量 100%(volumeLevel = 1)のときの実効マスターゲイン。
 * チップチューン音源が歪まない上限として、これを最大音量とする。
 */
const MAX_MASTER_VOLUME = 0.35;
/** BGM スケジューラの先読み時間(秒)。この先までの音を前もって予約する */
const BGM_SCHEDULE_AHEAD = 0.2;
/** BGM スケジューラの起動間隔(ミリ秒) */
const BGM_TIMER_INTERVAL = 40;

/**
 * ゲームのサウンドを統括するマネージャ。
 * - playSfx: 効果音を 1 回鳴らす
 * - startBgm / stopBgm: BGM をループ再生・停止する
 * - setMuted / toggleMuted: 全体のミュートを切り替える
 * - setVolume / volume: マスター音量(0〜1)を調整・取得する
 */
export class SoundManager {
  private readonly engine: SoundEngine;
  private muted = false;
  /** ユーザー設定のマスター音量(0〜1 の正規化値。実効ゲインは MAX_MASTER_VOLUME を掛ける) */
  private volumeLevel = 1;

  /** 現在再生中の BGM 名(なければ null) */
  private currentBgm: BgmName | null = null;
  /** BGM ループの先読みスケジューラのタイマ ID */
  private bgmTimer: ReturnType<typeof setInterval> | null = null;
  /** 次に予約すべきループの開始オーディオ時刻 */
  private nextLoopTime = 0;
  /** 再生中の BGM オシレータ群(停止時に一括で止めるため保持する) */
  private bgmNodes = new Set<OscillatorNode>();

  constructor() {
    // 初期音量は 100%(volumeLevel = 1)なので実効ゲインは MAX_MASTER_VOLUME
    this.engine = new SoundEngine(MAX_MASTER_VOLUME);
  }

  /** 発音可能か(AudioContext が使えるか) */
  get available(): boolean {
    return this.engine.available;
  }

  /** 現在ミュート中か */
  get isMuted(): boolean {
    return this.muted;
  }

  /** 現在のマスター音量(0〜1 の正規化値) */
  get volume(): number {
    return this.volumeLevel;
  }

  /**
   * 初回のユーザー操作時に呼び、サスペンド状態の AudioContext を再開する。
   * ブラウザの自動再生制限に対応するため、クリックなどの起点で呼ぶ。
   */
  unlock(): void {
    this.engine.resume();
  }

  /** ミュート状態を設定する。BGM 再生自体は止めず、音量だけを絞る */
  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyMasterVolume();
  }

  /** ミュートを切り替え、切り替え後の状態を返す */
  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /**
   * マスター音量を設定する(0〜1 に丸める)。ミュート状態は変えず、音量だけを更新する。
   * ミュート中は値を保持するだけで、ミュート解除時にこの音量が反映される。
   */
  setVolume(level: number): void {
    this.volumeLevel = Math.min(1, Math.max(0, level));
    this.applyMasterVolume();
  }

  /** ミュートと音量設定から実効マスターゲインを求めてエンジンに反映する */
  private applyMasterVolume(): void {
    this.engine.setMasterVolume(this.muted ? 0 : this.volumeLevel * MAX_MASTER_VOLUME);
  }

  /** 効果音を 1 回再生する */
  playSfx(name: SfxName): void {
    if (!this.engine.available) {
      return;
    }
    const effect = SOUND_EFFECTS[name];
    // 各ステップを順番に、直前までの合計時間ぶんずらして予約する
    let offset = 0;
    const base = this.engine.now();
    for (const step of effect.steps) {
      const startTime = base + offset;
      if (step.kind === 'tone') {
        this.engine.playTone(
          step.wave,
          step.note,
          startTime,
          step.duration,
          step.volume ?? DEFAULT_STEP_VOLUME,
          step.slideTo,
        );
      } else if (step.kind === 'noise') {
        this.engine.playNoise(
          startTime,
          step.duration,
          step.volume ?? DEFAULT_STEP_VOLUME,
        );
      }
      offset += step.duration;
    }
  }

  /**
   * BGM をループ再生する。すでに同じ曲が鳴っていれば何もしない。
   * 別の曲が鳴っていれば切り替える。
   */
  startBgm(name: BgmName): void {
    if (!this.engine.available || this.currentBgm === name) {
      return;
    }
    this.stopBgm();
    this.currentBgm = name;
    this.nextLoopTime = this.engine.now() + 0.05;
    // 先読みしながらループを予約し続ける
    this.scheduleBgm();
    this.bgmTimer = setInterval(() => this.scheduleBgm(), BGM_TIMER_INTERVAL);
  }

  /** BGM を停止し、予約済みの音も含めて止める */
  stopBgm(): void {
    if (this.bgmTimer !== null) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
    for (const node of this.bgmNodes) {
      try {
        node.stop();
      } catch {
        // すでに停止済みのノードは無視する
      }
    }
    this.bgmNodes.clear();
    this.currentBgm = null;
  }

  /**
   * 先読み時間内に入ったループを予約する。
   * タイマから繰り返し呼ばれ、常に少し先までの 1 ループぶんの音を確保する。
   */
  private scheduleBgm(): void {
    if (!this.currentBgm) {
      return;
    }
    const track = BGM_TRACKS[this.currentBgm];
    const loopSeconds = this.trackLoopSeconds(track);
    // 先読み範囲に次ループの開始が入っていれば、そのループを丸ごと予約する
    while (this.nextLoopTime < this.engine.now() + BGM_SCHEDULE_AHEAD) {
      this.scheduleLoop(track, this.nextLoopTime);
      this.nextLoopTime += loopSeconds;
    }
  }

  /** トラックの 1 ループ長(秒)を返す。全チャンネルの最大長に合わせる */
  private trackLoopSeconds(track: BgmTrack): number {
    const maxBeats = Math.max(
      ...track.channels.map((channel) => channelTotalBeats(channel)),
    );
    return beatsToSeconds(maxBeats, track.bpm);
  }

  /** 指定時刻を起点に、トラックの全チャンネルを 1 ループぶん予約する */
  private scheduleLoop(track: BgmTrack, startTime: number): void {
    for (const channel of track.channels) {
      let t = startTime;
      for (const note of channel.notes) {
        const seconds = beatsToSeconds(note.beats, track.bpm);
        if (note.note) {
          // 音が隣とつながって聞こえないよう、末尾をわずかに切る
          const gate = Math.max(0.02, seconds * 0.9);
          const osc = this.engine.playTone(
            channel.wave,
            note.note,
            t,
            gate,
            channel.volume,
          );
          if (osc) {
            this.trackBgmNode(osc);
          }
        }
        t += seconds;
      }
    }
  }

  /** BGM オシレータを管理集合へ加え、再生終了で自動的に取り除く */
  private trackBgmNode(osc: OscillatorNode): void {
    this.bgmNodes.add(osc);
    osc.addEventListener('ended', () => {
      this.bgmNodes.delete(osc);
    });
  }
}
