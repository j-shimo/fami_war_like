import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '@/data/gameConfig';
import { BootScene } from '@/scenes/BootScene';
import { GuideScene } from '@/scenes/GuideScene';
import { MainScene } from '@/scenes/MainScene';
import { MapSelectScene } from '@/scenes/MapSelectScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#1a1a2e',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, MapSelectScene, GuideScene, MainScene],
};

new Phaser.Game(config);
