// 「データリセット」で消す保存内容の取りまとめ。Phaser には依存しない。
// モード選択画面の「データリセット」ボタンから呼び、遊んだ記録を最初の状態へ戻す。
//
// 消すのは「遊んだ記録」だけで、ゲーム設定(gridwars:settings。担当サイド・操作の設定・
// 敵の行動アニメ)は残す。設定は遊び方の好みであり、クリアデータではないため。

import { clearAllProgress } from '@/core/progress/ClearProgress';
import {
  clearSuspendData,
  defaultStorage,
  type SaveStorageLike,
} from '@/core/save/SaveStorage';

/**
 * クリアデータ(クリア状況と中断データ)をすべて消す。
 *
 * - クリア状況(gridwars:clear): どのマップを何回クリアしたか。激ムズマップ・新マップの解放判定にも使う
 * - 中断データ(gridwars:suspend): 遊びかけの盤面。撃破数・生産数・占領数といった戦績もここに入っている
 *
 * localStorage が使えない環境では静かに何もしない(消せなくても進行は止めない)。
 */
export function resetClearData(storage: SaveStorageLike | null = defaultStorage()): void {
  clearAllProgress(storage);
  clearSuspendData(storage);
}
