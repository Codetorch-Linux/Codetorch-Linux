/**
 * Codetorch Audio Engine (ct-audio)
 * Path: /src/system/ct-audio.js
 * License: GNU GPL v3
 */

export class CTAudio {
  constructor(bus) {
    this.bus = bus || (typeof window !== "undefined" ? window.CTBus : null);
    this.audioCtx = null;
    this.sampleRate = 44100;
    this.audioQueue = [];
    this.isPlaying = false;

    if (this.bus) {
      this.bindEvents();
    }
  }

  /**
   * Initializes the Web Audio API context upon user interaction.
   */
  async init() {
    if (this.audioCtx) return;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      console.warn("[ct-audio] Web Audio API is not supported in this environment.");
      return;
    }

    this.audioCtx = new AudioContext({ sampleRate: this.sampleRate });
    console.log(`[ct-audio] Audio Context initialized at ${this.audioCtx.sampleRate}Hz.`);
  }

  /**
   * Listens for PCM stream events over ct-bus.
   */
  bindEvents() {
    this.bus.on("audio:play_pcm", (payload) => {
      this.queuePCMData(payload.buffer, payload.channels || 2, payload.sampleRate || this.sampleRate);
    });

    this.bus.on("audio:set_volume", (payload) => {
      if (this.gainNode) {
        this.gainNode.gain.value = Math.max(0, Math.min(1, payload.volume));
      }
    });
  }

  /**
   * Pushes incoming raw PCM buffer chunks to the playback queue.
   */
  async queuePCMData(pcmData, channels = 2, sampleRate = 44100) {
    if (!this.audioCtx) {
      await this.init();
    }

    if (this.audioCtx.state === "suspended") {
      await this.audioCtx.resume();
    }

    const length = pcmData.length / channels;
    const audioBuffer = this.audioCtx.createBuffer(channels, length, sampleRate);

    for (let channel = 0; channel < channels; channel++) {
      const channelData = audioBuffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        // Normalize 16-bit PCM (-32768 to 32767) to Float32 (-1.0 to 1.0)
        channelData[i] = pcmData[i * channels + channel] / 32768.0;
      }
    }

    this.audioQueue.push(audioBuffer);
    if (!this.isPlaying) {
      this.processQueue();
    }
  }

  /**
   * Continuously drains and renders queued audio buffers.
   */
  processQueue() {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const buffer = this.audioQueue.shift();
    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;

    if (!this.gainNode) {
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.connect(this.audioCtx.destination);
    }

    source.connect(this.gainNode);
    source.onended = () => this.processQueue();
    source.start(0);
  }
}
