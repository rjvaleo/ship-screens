/*
  ShipAudioEngine
  ----------------
  Shared audio backbone for all ship data screens.

  Provides:
    - Live microphone capture (falls back to a procedural "deep space
      signal" synth if no mic is available or permission is denied)
    - FFT frequency-domain + time-domain analysis for spectrographs /
      sonographs / oscilloscopes
    - 3D spatial sonification via HRTF PannerNodes ("spatial voices")
    - Standard (non-spatial, stereo-panned) sonification for simple
      data->tone mapping

  Usage:
    const engine = new ShipAudioEngine();
    await engine.start();                 // must be called from a user gesture
    engine.getFrequencyData();            // Uint8Array, length = fftSize/2
    engine.getTimeDomainData();           // Uint8Array, length = fftSize
    engine.getLevel();                    // 0..1 RMS
    const voice = engine.createSpatialVoice({ freq: 220 });
    voice.setPosition(x, y, z);
    voice.setGain(0.4);
    voice.stop();
    engine.pingStandard({ freq: 440, pan: -0.5, duration: 0.4 });

  Exposed as window.ShipAudioEngine (no bundler / module system required,
  so it works when opened directly via file://).
*/
(function (global) {
  'use strict';

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  class SpatialVoice {
    constructor(ctx, bus, { freq = 220, type = 'sine', gain = 0 } = {}) {
      this.ctx = ctx;
      this.osc = ctx.createOscillator();
      this.osc.type = type;
      this.osc.frequency.value = freq;

      this.gainNode = ctx.createGain();
      this.gainNode.gain.value = gain;

      this.panner = ctx.createPanner();
      this.panner.panningModel = 'HRTF';
      this.panner.distanceModel = 'inverse';
      this.panner.refDistance = 1;
      this.panner.maxDistance = 40;
      this.panner.rolloffFactor = 1.1;
      this.panner.coneInnerAngle = 360;
      this.panner.coneOuterAngle = 0;
      this.panner.coneOuterGain = 0;

      this.osc.connect(this.gainNode);
      this.gainNode.connect(this.panner);
      this.panner.connect(bus);

      this.osc.start();
      this._stopped = false;
    }

    setPosition(x, y, z) {
      const p = this.panner;
      const t = this.ctx.currentTime;
      if (p.positionX) {
        p.positionX.setTargetAtTime(x, t, 0.05);
        p.positionY.setTargetAtTime(y, t, 0.05);
        p.positionZ.setTargetAtTime(z, t, 0.05);
      } else if (p.setPosition) {
        p.setPosition(x, y, z);
      }
    }

    setFrequency(freq, glideSeconds = 0.08) {
      const t = this.ctx.currentTime;
      this.osc.frequency.setTargetAtTime(freq, t, glideSeconds);
    }

    setGain(g, rampSeconds = 0.08) {
      const t = this.ctx.currentTime;
      this.gainNode.gain.setTargetAtTime(clamp(g, 0, 1), t, rampSeconds);
    }

    stop(fadeSeconds = 0.15) {
      if (this._stopped) return;
      this._stopped = true;
      const t = this.ctx.currentTime;
      this.gainNode.gain.setTargetAtTime(0, t, fadeSeconds);
      this.osc.stop(t + fadeSeconds * 4 + 0.05);
      const osc = this.osc;
      setTimeout(() => { try { osc.disconnect(); } catch (e) {} }, (fadeSeconds * 4 + 0.2) * 1000);
    }
  }

  class ShipAudioEngine {
    constructor({ fftSize = 2048, smoothing = 0.75 } = {}) {
      this.fftSize = fftSize;
      this.smoothing = smoothing;
      this.ctx = null;
      this.analyser = null;
      this.mode = 'idle'; // 'mic' | 'synthetic' | 'idle'
      this._freqData = null;
      this._timeData = null;
      this._spatialBus = null;
      this._standardBus = null;
      this._listener = null;
      this._synthNodes = [];
      this._started = false;
      this.onModeChange = null; // optional callback(mode)
    }

    async start() {
      if (this._started) return this.mode;
      this._started = true;

      const Ctx = global.AudioContext || global.webkitAudioContext;
      this.ctx = new Ctx();

      // Master analyser (fed by whichever source we end up with)
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = this.fftSize;
      this.analyser.smoothingTimeConstant = this.smoothing;
      this._freqData = new Uint8Array(this.analyser.frequencyBinCount);
      this._timeData = new Uint8Array(this.analyser.fftSize);

      // Buses for sonification voices
      this._spatialBus = this.ctx.createGain();
      this._spatialBus.gain.value = 0.8;
      this._spatialBus.connect(this.ctx.destination);

      this._standardBus = this.ctx.createGain();
      this._standardBus.gain.value = 0.5;
      this._standardBus.connect(this.ctx.destination);

      this._listener = this.ctx.listener;
      this._setListenerPosition(0, 0, 0);
      this._setListenerOrientation(0, 0, -1, 0, 1, 0);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const src = this.ctx.createMediaStreamSource(stream);
        src.connect(this.analyser);
        this.mode = 'mic';
      } catch (err) {
        this._startSyntheticSource();
        this.mode = 'synthetic';
      }

      if (this.onModeChange) this.onModeChange(this.mode);
      return this.mode;
    }

    _startSyntheticSource() {
      // Procedurally generated "deep space signal" bed: layered detuned
      // oscillators + filtered noise, slowly drifting, so every screen
      // always has *something* meaningful to analyse/visualise even
      // without a live microphone.
      const ctx = this.ctx;
      const bed = ctx.createGain();
      bed.gain.value = 0.35;
      bed.connect(this.analyser);

      const baseFreqs = [55, 110, 164.81, 220, 329.63];
      baseFreqs.forEach((f, i) => {
        const osc = ctx.createOscillator();
        osc.type = i % 2 === 0 ? 'sawtooth' : 'triangle';
        osc.frequency.value = f;

        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.03 + i * 0.017;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = f * 0.02;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        lfo.start();

        const g = ctx.createGain();
        g.gain.value = 0.06 / (i + 1);

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = f * 4;
        filter.Q.value = 0.6;

        osc.connect(filter);
        filter.connect(g);
        g.connect(bed);
        osc.start();
        this._synthNodes.push(osc, lfo);
      });

      // Filtered noise layer for spectral texture
      const bufferSize = 2 * ctx.sampleRate;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.value = 900;
      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.05;
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(bed);
      noise.start();
      this._synthNodes.push(noise);
    }

    _setListenerPosition(x, y, z) {
      const l = this._listener;
      if (l.positionX) {
        l.positionX.value = x; l.positionY.value = y; l.positionZ.value = z;
      } else if (l.setPosition) {
        l.setPosition(x, y, z);
      }
    }

    _setListenerOrientation(fx, fy, fz, ux, uy, uz) {
      const l = this._listener;
      if (l.forwardX) {
        l.forwardX.value = fx; l.forwardY.value = fy; l.forwardZ.value = fz;
        l.upX.value = ux; l.upY.value = uy; l.upZ.value = uz;
      } else if (l.setOrientation) {
        l.setOrientation(fx, fy, fz, ux, uy, uz);
      }
    }

    getFrequencyData() {
      this.analyser.getByteFrequencyData(this._freqData);
      return this._freqData;
    }

    getTimeDomainData() {
      this.analyser.getByteTimeDomainData(this._timeData);
      return this._timeData;
    }

    getLevel() {
      const data = this.getTimeDomainData();
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      return Math.sqrt(sum / data.length);
    }

    setSpatialGain(g) { if (this._spatialBus) this._spatialBus.gain.value = clamp(g, 0, 1); }
    setStandardGain(g) { if (this._standardBus) this._standardBus.gain.value = clamp(g, 0, 1); }

    createSpatialVoice(opts) {
      return new SpatialVoice(this.ctx, this._spatialBus, opts);
    }

    /** One-shot standard (non-3D, stereo-panned) sonification blip. */
    pingStandard({ freq = 440, pan = 0, duration = 0.3, type = 'sine', gain = 0.5 } = {}) {
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + duration);

      const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      osc.connect(g);
      if (panner) {
        panner.pan.value = clamp(pan, -1, 1);
        g.connect(panner);
        panner.connect(this._standardBus);
      } else {
        g.connect(this._standardBus);
      }
      osc.start(t);
      osc.stop(t + duration + 0.05);
    }
  }

  global.ShipAudioEngine = ShipAudioEngine;
})(window);
