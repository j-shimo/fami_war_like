// Web Audio API を薄くラップし、トーン(オシレータ)とノイズを鳴らす低レベルエンジン。
// 音源データ(soundDefinitions)から受け取った音を、指定時刻にスケジュールして再生する。
// AudioContext が使えない環境(SSR・テスト・非対応ブラウザ)では静かに無効化する。

import { noteToFrequency } from '@/audio/notes';
import type { WaveType } from '@/audio/soundDefinitions';

/** window から AudioContext コンストラクタを取り出す(webkit 接頭辞にも対応) */
function resolveAudioContext(): typeof AudioContext | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const w = window as typeof window & {
    webkitAudioContext?: typeof AudioContext;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * Web Audio による発音エンジン。
 * マスターゲインを 1 つ持ち、全ての音をそこへ集約する(ミュートや音量調整の起点)。
 */
export class SoundEngine {
  private readonly ctx: AudioContext | null;
  private readonly master: GainNode | null;
  /** ノイズ生成に使い回すホワイトノイズのバッファ */
  private noiseBuffer: AudioBuffer | null = null;

  constructor(masterVolume = 0.35) {
    const Ctor = resolveAudioContext();
    if (!Ctor) {
      this.ctx = null;
      this.master = null;
      return;
    }
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = masterVolume;
    this.master.connect(this.ctx.destination);
  }

  /** 発音可能か(AudioContext が生成できたか) */
  get available(): boolean {
    return this.ctx !== null;
  }

  /** 現在のオーディオ時刻(秒)。無効時は 0 */
  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /**
   * サスペンド状態の AudioContext を再開する。
   * ブラウザの自動再生制限により、初回はユーザー操作起点で呼ぶ必要がある。
   */
  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  /** マスター音量を設定する(0〜1)。ミュートに使う */
  setMasterVolume(volume: number): void {
    if (this.master) {
      // 急な変化のクリックノイズを避けて滑らかに変える
      const t = this.now();
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(volume, t, 0.01);
    }
  }

  /**
   * 指定時刻に 1 音(オシレータ)を鳴らす。
   * slideTo を渡すと duration をかけて周波数を滑らせる。
   * 生成した OscillatorNode を返す(BGM の一括停止のため)。無効時は null。
   */
  playTone(
    wave: WaveType,
    note: string,
    startTime: number,
    duration: number,
    volume: number,
    slideTo?: string,
  ): OscillatorNode | null {
    if (!this.ctx || !this.master) {
      return null;
    }
    const osc = this.ctx.createOscillator();
    osc.type = wave;
    const startFreq = noteToFrequency(note);
    osc.frequency.setValueAtTime(startFreq, startTime);
    if (slideTo) {
      osc.frequency.linearRampToValueAtTime(
        noteToFrequency(slideTo),
        startTime + duration,
      );
    }

    const gain = this.ctx.createGain();
    this.applyEnvelope(gain, startTime, duration, volume);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
    return osc;
  }

  /**
   * 指定時刻にノイズ(打撃・爆発など)を鳴らす。
   * 生成した AudioBufferSourceNode を返す。無効時は null。
   */
  playNoise(
    startTime: number,
    duration: number,
    volume: number,
  ): AudioBufferSourceNode | null {
    if (!this.ctx || !this.master) {
      return null;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = this.getNoiseBuffer();

    const gain = this.ctx.createGain();
    this.applyEnvelope(gain, startTime, duration, volume);

    source.connect(gain);
    gain.connect(this.master);
    source.start(startTime);
    source.stop(startTime + duration + 0.05);
    return source;
  }

  /**
   * ゲインに簡単なエンベロープ(素早い立ち上がり→減衰)を設定する。
   * クリックノイズを避けつつ、チップチューンらしい歯切れのよい音にする。
   */
  private applyEnvelope(
    gain: GainNode,
    startTime: number,
    duration: number,
    volume: number,
  ): void {
    const attack = Math.min(0.008, duration / 2);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + attack);
    // 終端に向けて指数的に減衰させる(0 は指定できないため微小値へ)
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  }

  /** ホワイトノイズのバッファを生成して使い回す */
  private getNoiseBuffer(): AudioBuffer {
    if (this.noiseBuffer) {
      return this.noiseBuffer;
    }
    const ctx = this.ctx as AudioContext;
    const length = Math.floor(ctx.sampleRate * 0.4);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }
}
