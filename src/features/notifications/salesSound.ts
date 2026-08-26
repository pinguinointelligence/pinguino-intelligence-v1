/**
 * Original, local two-coin cue synthesized with the browser Web Audio API.
 * It has no downloaded/copyrighted sample and performs no network request.
 */
export class LocalSalesSound {
  private context: AudioContext | null = null;

  async unlock(): Promise<void> {
    this.context ??= new AudioContext();
    await this.context.resume();
    const source = this.context.createBufferSource();
    source.buffer = this.context.createBuffer(1, 1, this.context.sampleRate);
    source.connect(this.context.destination);
    source.start();
  }

  async play(): Promise<void> {
    if (!this.context || this.context.state !== 'running') throw new Error('audio_not_unlocked');
    const now = this.context.currentTime;
    for (const [offset, frequency] of [[0, 1046], [0.095, 1568]] as const) {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, now + offset);
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.18, now + offset + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.16);
      oscillator.connect(gain);
      gain.connect(this.context.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.17);
    }
  }
}

