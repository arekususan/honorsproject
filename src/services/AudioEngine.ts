import { Howl } from 'howler';
import { Genre } from '../components/AudioSurvey';

export class AudioEngine {
  private static instance: AudioEngine;
  private stems: Howl[] = [];
  private flowTrack: Howl | null = null;
  private currentGenre: Genre | null = null;
  private isFlow: boolean = false;
  private sfx: Record<string, Howl> = {};

  private constructor() {
    // Initialize SFX
    this.sfx = {
      win: new Howl({ src: ['https://assets.mixkit.co/sfx/preview/mixkit-winning-chimes-2015.mp3'] }),
      loss: new Howl({ src: ['https://assets.mixkit.co/sfx/preview/mixkit-game-over-dark-orchestra-633.mp3'] }),
      move: new Howl({ src: ['https://assets.mixkit.co/sfx/preview/mixkit-quick-jump-2845.mp3'], volume: 0.2 }),
      trap: new Howl({ src: ['https://assets.mixkit.co/sfx/preview/mixkit-falling-on-metal-749.mp3'] }),
      coin: new Howl({ src: ['https://assets.mixkit.co/sfx/preview/mixkit-digital-quick-win-video-game-2013.mp3'] }),
      calm: new Howl({ src: ['https://assets.mixkit.co/sfx/preview/mixkit-meditation-bowl-single-hit-2093.mp3'], volume: 0.5 }),
    };
  }

  static getInstance() {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  playSFX(name: string) {
    if (this.sfx[name]) this.sfx[name].play();
  }

  stopMusic() {
    this.stems.forEach(s => s.stop());
    if (this.flowTrack) this.flowTrack.stop();
    this.isFlow = false;
  }

  async setGenre(genre: Genre, isTutorial: boolean = false) {
    this.stopMusic();
    if (isTutorial) return; // Only SFX in tutorial

    this.currentGenre = genre;
    console.log(`AUDIO: Setting genre to ${genre}`);
    
    // Placeholder URLs for stems
    const stemUrls = [
      'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', // Stem 1
      'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', // Stem 2
      'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', // Stem 3
      'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3', // Stem 4
    ];

    this.stems = stemUrls.map(url => new Howl({
      src: [url],
      loop: true,
      volume: 0,
      html5: true
    }));

    // Flow tracks named as requested
    const flowUrls: Record<Genre, string> = {
      Rap: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
      Country: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
      Rock: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',
      Classical: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
      Pop: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3',
      EDM: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3',
    };

    this.flowTrack = new Howl({
      src: [flowUrls[genre]],
      loop: true,
      volume: 0,
      html5: true
    });

    // Start all stems muted and synced
    this.stems.forEach(s => s.play());
  }

  updateStems(activeCount: number, triggerFlow: boolean) {
    if (!this.currentGenre || this.isFlow) return;

    if (triggerFlow && this.flowTrack) {
      this.isFlow = true;
      this.stems.forEach(s => s.fade(s.volume(), 0, 1000));
      this.flowTrack.play();
      this.flowTrack.fade(0, 0.7, 1000);
      return;
    }

    this.stems.forEach((s, i) => {
      const targetVol = i < activeCount ? 0.7 : 0;
      if (s.volume() !== targetVol) {
        s.fade(s.volume(), targetVol, 1000);
      }
    });
  }
}
