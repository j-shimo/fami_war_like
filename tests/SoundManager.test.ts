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
  suspended: number;
  closed: number;
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

    suspend(): Promise<void> {
      recorder.suspended += 1;
      this.state = 'suspended';
      return Promise.resolve();
    }

    close(): Promise<void> {
      recorder.closed += 1;
      this.state = 'closed' as 'running';
      return Promise.resolve();
    }
  };
}

/** addEventListener / removeEventListener を備えた最小のイベント発生源 */
class FakeEventTarget {
  readonly listeners = new Map<string, Set<() => void>>();

  addEventListener(type: string, listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set<() => void>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  /** 登録済みリスナを発火する */
  emit(type: string): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener();
    }
  }

  /** 登録されているリスナの総数 */
  listenerCount(): number {
    let count = 0;
    for (const set of this.listeners.values()) {
      count += set.size;
    }
    return count;
  }
}

let recorder: Recorder;

beforeEach(() => {
  vi.useFakeTimers();
  recorder = {
    oscillators: [],
    bufferSources: [],
    masterGainTargets: [],
    resumed: 0,
    suspended: 0,
    closed: 0,
  };
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

describe('SoundManager - ブラウザ非アクティブ時の停止', () => {
  /** window / document を差し替えたうえで SoundManager を読み込む */
  async function loadManager() {
    const { SoundManager } = await import('@/audio/SoundManager');
    return new SoundManager();
  }

  /** window と document をイベント発火できる偽物に差し替える */
  function installFakeDom(): {
    win: FakeEventTarget;
    doc: FakeEventTarget & { hidden: boolean };
  } {
    const win = new FakeEventTarget() as FakeEventTarget & { AudioContext: unknown };
    win.AudioContext = createFakeAudioContext(recorder);
    const doc = new FakeEventTarget() as FakeEventTarget & { hidden: boolean };
    doc.hidden = false;
    (globalThis as { window?: unknown }).window = win;
    (globalThis as { document?: unknown }).document = doc;
    return { win, doc };
  }

  afterEach(() => {
    delete (globalThis as { document?: unknown }).document;
  });

  it('非アクティブになるとマスター音量が 0 になり AudioContext が止まる', async () => {
    const manager = await loadManager();
    manager.unlock(); // ユーザー操作で起動済みの状態にする
    manager.setPageActive(false);

    expect(manager.isPageActive).toBe(false);
    expect(recorder.masterGainTargets.at(-1)).toBe(0);
    expect(recorder.suspended).toBe(1);
  });

  it('アクティブに戻ると音量が戻り AudioContext が再開する', async () => {
    const manager = await loadManager();
    manager.unlock();
    const resumedAfterUnlock = recorder.resumed;

    manager.setPageActive(false);
    manager.setPageActive(true);

    expect(manager.isPageActive).toBe(true);
    expect(recorder.masterGainTargets.at(-1)).toBeGreaterThan(0);
    expect(recorder.resumed).toBe(resumedAfterUnlock + 1);
  });

  it('同じ状態を続けて指定しても余計な suspend / resume はしない', async () => {
    const manager = await loadManager();
    manager.unlock();
    manager.setPageActive(false);
    manager.setPageActive(false);
    expect(recorder.suspended).toBe(1);
  });

  it('初回のユーザー操作前(unlock 前)は復帰しても resume しない', async () => {
    const manager = await loadManager();
    manager.setPageActive(false);
    manager.setPageActive(true);
    // 自動再生制限に引っかかるため、勝手に鳴らし始めない
    expect(recorder.resumed).toBe(0);
  });

  it('ミュート中に復帰してもマスター音量は 0 のまま', async () => {
    const manager = await loadManager();
    manager.unlock();
    manager.setMuted(true);
    manager.setPageActive(false);
    manager.setPageActive(true);
    expect(recorder.masterGainTargets.at(-1)).toBe(0);
  });

  it('bindPageVisibility でタブ非表示・ウィンドウ blur を拾う', async () => {
    const { win, doc } = installFakeDom();
    const manager = await loadManager();
    manager.unlock();
    manager.bindPageVisibility();

    doc.hidden = true;
    doc.emit('visibilitychange');
    expect(manager.isPageActive).toBe(false);

    doc.hidden = false;
    doc.emit('visibilitychange');
    expect(manager.isPageActive).toBe(true);

    // 別ウィンドウ・別アプリへ切り替えたとき(タブは表示されたまま)
    win.emit('blur');
    expect(manager.isPageActive).toBe(false);
    win.emit('focus');
    expect(manager.isPageActive).toBe(true);
  });

  it('bindPageVisibility を二重に呼んでもリスナは増えない', async () => {
    const { win, doc } = installFakeDom();
    const manager = await loadManager();
    manager.bindPageVisibility();
    const count = win.listenerCount() + doc.listenerCount();
    manager.bindPageVisibility();
    expect(win.listenerCount() + doc.listenerCount()).toBe(count);
  });

  it('dispose で BGM 停止・リスナ解除・AudioContext の破棄を行う', async () => {
    const { win, doc } = installFakeDom();
    const manager = await loadManager();
    manager.unlock();
    manager.bindPageVisibility();
    manager.startBgm('playerBattle');
    expect(recorder.oscillators.length).toBeGreaterThan(0);

    manager.dispose();

    for (const osc of recorder.oscillators) {
      expect(osc.stop).toHaveBeenCalled();
    }
    expect(win.listenerCount() + doc.listenerCount()).toBe(0);
    expect(recorder.closed).toBe(1);
    // 解除済みなのでイベントが来ても状態は変わらない
    doc.hidden = true;
    doc.emit('visibilitychange');
    expect(manager.isPageActive).toBe(true);
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
      manager.bindPageVisibility();
      manager.setPageActive(false);
      manager.setPageActive(true);
      manager.dispose();
    }).not.toThrow();
  });
});
