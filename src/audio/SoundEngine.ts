import { WeaponClass } from '../types/game';

class ProceduralSoundEngine {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private sfxVolume = 0.8;
  private musicVolume = 0.35;
  private musicEnabled = true;
  private musicTimer: number | null = null;
  private musicStep = 0;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicEnabled ? this.musicVolume * 0.28 : 0;
      this.musicGain.connect(this.ctx.destination);

      // Reusable 1.5s white noise buffer for gunfire & footsteps
      const length = Math.floor(this.ctx.sampleRate * 1.5);
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buffer;
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public unlock() {
    this.ensureContext();
  }

  public updateSettings(sfxVol: number, musicVol: number, musicEnabled: boolean) {
    this.sfxVolume = sfxVol;
    this.musicVolume = musicVol;
    this.musicEnabled = musicEnabled;
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(sfxVol, this.ctx.currentTime, 0.05);
    }
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(
        musicEnabled ? musicVol * 0.28 : 0,
        this.ctx.currentTime,
        0.1,
      );
    }
  }

  public playGunshot(weaponClass: WeaponClass, distanceAttenuation = 1) {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || !this.noiseBuffer || distanceAttenuation <= 0.04) return;

    const now = ctx.currentTime;
    const vol = Math.min(1, distanceAttenuation) * 0.65;

    // Noise burst for explosive crack
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = weaponClass === 'sniper' ? 'bandpass' : 'lowpass';

    const noiseEnv = ctx.createGain();

    // Low-end thump oscillator
    const osc = ctx.createOscillator();
    const oscEnv = ctx.createGain();

    let duration = 0.22;
    let startFreq = 160;
    let endFreq = 45;
    let filterStart = 3200;
    let filterEnd = 420;

    switch (weaponClass) {
      case 'assault':
        duration = 0.2;
        startFreq = 180;
        endFreq = 52;
        filterStart = 3600;
        filterEnd = 520;
        break;
      case 'smg':
        duration = 0.12;
        startFreq = 240;
        endFreq = 85;
        filterStart = 4400;
        filterEnd = 900;
        break;
      case 'shotgun':
        duration = 0.36;
        startFreq = 135;
        endFreq = 32;
        filterStart = 2800;
        filterEnd = 260;
        break;
      case 'sniper':
        duration = 0.48;
        startFreq = 210;
        endFreq = 36;
        filter.Q.value = 1.6;
        filterStart = 2600;
        filterEnd = 340;
        break;
      case 'pistol':
        duration = 0.15;
        startFreq = 260;
        endFreq = 75;
        filterStart = 3800;
        filterEnd = 700;
        break;
    }

    filter.frequency.setValueAtTime(filterStart, now);
    filter.frequency.exponentialRampToValueAtTime(filterEnd, now + duration);

    noiseEnv.gain.setValueAtTime(vol, now);
    noiseEnv.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.type = weaponClass === 'sniper' ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration * 0.7);

    oscEnv.gain.setValueAtTime(vol * 0.75, now);
    oscEnv.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.75);

    noise.connect(filter);
    filter.connect(noiseEnv);
    noiseEnv.connect(this.sfxGain);

    osc.connect(oscEnv);
    oscEnv.connect(this.sfxGain);

    noise.start(now);
    noise.stop(now + duration);
    osc.start(now);
    osc.stop(now + duration);
  }

  public playFootstep(sprinting = false) {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(sprinting ? 720 : 540, now);
    filter.Q.value = 1.8;

    const env = ctx.createGain();
    const peak = sprinting ? 0.16 : 0.09;
    env.gain.setValueAtTime(0.001, now);
    env.gain.linearRampToValueAtTime(peak, now + 0.015);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    noise.connect(filter);
    filter.connect(env);
    env.connect(this.sfxGain);

    noise.start(now, Math.random() * 0.4, 0.1);
  }

  public playReload() {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    [0, 0.22].forEach((offset, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(idx === 0 ? 520 : 780, now + offset);
      osc.frequency.exponentialRampToValueAtTime(idx === 0 ? 310 : 940, now + offset + 0.06);
      gain.gain.setValueAtTime(0.14, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.07);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now + offset);
      osc.stop(now + offset + 0.08);
    });
  }

  public playLootPickup() {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    [523.25, 659.25].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.06);
      gain.gain.setValueAtTime(0.16, now + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.14);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.15);
    });
  }

  public playHitMarker(isHeadshot: boolean) {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isHeadshot ? 1550 : 980, now);
    osc.frequency.exponentialRampToValueAtTime(isHeadshot ? 880 : 420, now + 0.08);
    gain.gain.setValueAtTime(isHeadshot ? 0.28 : 0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.095);
  }

  public playDamageTaken() {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.15);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  public playParachuteOpen() {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(220, now);
    filter.frequency.exponentialRampToValueAtTime(1400, now + 0.18);
    filter.frequency.exponentialRampToValueAtTime(300, now + 0.55);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.32, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    noise.start(now);
    noise.stop(now + 0.62);
  }

  public playVictory() {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t = now + i * 0.14;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.26, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 0.6);
    });
  }

  public playDefeat() {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const notes = [329.63, 277.18, 220.0];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      const t = now + i * 0.18;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 0.42);
    });
  }

  public startMusic(mode: 'lobby' | 'combat') {
    const ctx = this.ensureContext();
    if (!ctx || !this.musicGain) return;
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }

    const bassPattern =
      mode === 'lobby'
        ? [110, 0, 110, 130.81, 98, 0, 146.83, 130.81]
        : [110, 110, 146.83, 110, 130.81, 110, 164.81, 146.83];

    const stepMs = mode === 'lobby' ? 380 : 280;

    this.musicTimer = window.setInterval(() => {
      if (!this.ctx || !this.musicGain || !this.musicEnabled || this.ctx.state !== 'running') {
        return;
      }
      const freq = bassPattern[this.musicStep % bassPattern.length];
      this.musicStep++;
      if (freq <= 0) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = mode === 'lobby' ? 'triangle' : 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(mode === 'lobby' ? 380 : 620, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.45, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (stepMs / 1000) * 0.9);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain);

      osc.start(now);
      osc.stop(now + stepMs / 1000);
    }, stepMs);
  }

  public stopMusic() {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}

export const soundEngine = new ProceduralSoundEngine();
