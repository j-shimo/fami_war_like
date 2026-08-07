import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// SoundManager / SoundEngine はブラウザの Web Audio API に依存する。
// ここでは最小限の AudioContext モックを global.window に載せ、
// 発音ロジックが例外なくノードを生成・スケジュール・停止することを検証する。

/** テスト中に生成されたノードを記録するためのコレクタ */
interface Recorder {
  oscillators: FakeOscillator[];
  bufferSources: FakeBufferSource[];
  masterGainTargets: number[];
  resumed: number;
}

class FakeParam {
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
  cancelScheduledValues = vi.fn();
  setTargetAtTime = vi.fn();
  value = 0;
}

class FakeGain {
  gain = new FakeParam();
  connect = vi.fn();
}

class FakeOscillator {
  type = '';
  frequency = new FakeParam();
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
  addEventListener = vi.fn();
}

class FakeBufferSource {
  buffer: unknown = null;
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

function createFakeAudioContext(recorder: Recorder) {
  return class FakeAudioContext {
    currentTime = 0;
    state: 'running' | 'suspended' = 'suspended';
    sampleRate = 44100;
    destination = {};
    private master: FakeGain | null = null;

    createGain(): FakeGain {
      const gain = new FakeGain();
      // 最初に作られる Gain をマスターとみなし、音量変更を記録する
      if (!this.master) {
        this.master = gain;
        gain.gain.setTargetAtTime = vi.fn((v: number) => {
          recorder.masterGainTargets.push(v);
        });
      }
      return gain;
    }

    createOscillator(): FakeOscillator {
      const osc = new FakeOscillator();
      recorder.oscillators.push(osc);
      return osc;
    }

    createBufferSource(): FakeBufferSource {
      const src = new FakeBufferSource();
      recorder.bufferSources.push(src);
      return src;
    }

    createBuffer(
      _channels: number,
      length: number,
    ): { getChannelData: () => Float32Array } {
      const data = new Float32Array(length);
      return { getChannelData: () => data };
    }

    resume(): Promise<void> {
      recorder.resumed += 1;
      this.state = 'running';
      return Promise.resolve();
    }
  };
}

let recorder: Recorder;

beforeEach(() => {
  vi.useFakeTimers();
  recorder = { oscillators: [], bufferSources: [], masterGainTargets: [], resumed: 0 };
  (globalThis as { window?: unknown }).window = {
    AudioContext: createFakeAudioContext(recorder),
  };
});

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as { window?: unknown }).window;
  vi.resetModules();
});

describe('SoundManager', () => {
  async function loadManager() {
    // window を差し込んだ後にモジュールを読み込む(生成時に AudioContext を掴むため)
    const { SoundManager } = await import('@/audio/SoundManager');
    return new SoundManager();
  }

  it('AudioContext が使えるとき available になる', async () => {
    const manager = await loadManager();
    expect(manager.available).toBe(true);
  });

  it('効果音がトーンとノイズのノードを生成する', async () => {
    const manager = await loadManager();
    manager.playSfx('attack'); // ノイズ + スライドするトーン
    expect(recorder.oscillators.length).toBeGreaterThan(0);
    expect(recorder.bufferSources.length).toBeGreaterThan(0);
    // 生成したオシレータは start / stop が予約されている
    for (const osc of recorder.oscillators) {
      expect(osc.start).toHaveBeenCalled();
      expect(osc.stop).toHaveBeenCalled();
    }
  });

  it('BGM を開始するとオシレータが予約され、停止で止まる', async () => {
    const manager = await loadManager();
    manager.startBgm('playerBattle');
    const scheduled = recorder.oscillators.length;
    expect(scheduled).toBeGreaterThan(0);

    manager.stopBgm();
    // 予約済みの全オシレータに stop が呼ばれている
    for (const osc of recorder.oscillators) {
      expect(osc.stop).toHaveBeenCalled();
    }
  });

  it('同じ BGM を二重に開始しても重複再生しない', async () => {
    const manager = await loadManager();
    manager.startBgm('playerBattle');
    const first = recorder.oscillators.length;
    manager.startBgm('playerBattle');
    expect(recorder.oscillators.length).toBe(first);
    manager.stopBgm();
  });

  it('ミュート切替でマスター音量が 0 と既定値を行き来する', async () => {
    const manager = await loadManager();
    expect(manager.isMuted).toBe(false);

    expect(manager.toggleMuted()).toBe(true);
    expect(manager.isMuted).toBe(true);
    expect(recorder.masterGainTargets.at(-1)).toBe(0);

    expect(manager.toggleMuted()).toBe(false);
    expect(recorder.masterGainTargets.at(-1)).toBeGreaterThan(0);
  });

  it('unlock で AudioContext を resume する', async () => {
    const manager = await loadManager();
    manager.unlock();
    expect(recorder.resumed).toBe(1);
  });

  it('初期音量は 100%(1)である', async () => {
    const manager = await loadManager();
    expect(manager.volume).toBe(1);
  });

  it('setVolume で音量を変えるとマスターゲインが更新され、volume に反映される', async () => {
    const manager = await loadManager();
    manager.setVolume(0.5);
    expect(manager.volume).toBe(0.5);
    // 実効ゲインは 0(ミュート)より大きく、100% 時より小さい
    const applied = recorder.masterGainTargets.at(-1) ?? -1;
    expect(applied).toBeGreaterThan(0);
    expect(applied).toBeLessThan(manager.volume);
  });

  it('setVolume は 0〜1 の範囲に丸める', async () => {
    const manager = await loadManager();
    manager.setVolume(2);
    expect(manager.volume).toBe(1);
    manager.setVolume(-1);
    expect(manager.volume).toBe(0);
    expect(recorder.masterGainTargets.at(-1)).toBe(0);
  });

  it('ミュート中に setVolume してもマスターゲインは 0 のまま(解除後に反映)', async () => {
    const manager = await loadManager();
    manager.setMuted(true);
    manager.setVolume(0.5);
    expect(manager.volume).toBe(0.5);
    expect(manager.isMuted).toBe(true);
    // ミュート中は実効ゲイン 0 を保つ
    expect(recorder.masterGainTargets.at(-1)).toBe(0);
    // 解除すると設定した音量が反映される(0 より大きい)
    manager.setMuted(false);
    expect(recorder.masterGainTargets.at(-1)).toBeGreaterThan(0);
  });
});

describe('SoundManager - Web Audio 非対応環境', () => {
  it('window が無ければ available は false で、呼び出しても例外を投げない', async () => {
    delete (globalThis as { window?: unknown }).window;
    vi.resetModules();
    const { SoundManager } = await import('@/audio/SoundManager');
    const manager = new SoundManager();
    expect(manager.available).toBe(false);
    // すべて no-op として安全に呼べる
    expect(() => {
      manager.playSfx('select');
      manager.startBgm('playerBattle');
      manager.stopBgm();
      manager.unlock();
      manager.setMuted(true);
    }).not.toThrow();
  });
});
