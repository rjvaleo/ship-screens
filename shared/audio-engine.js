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
  function hasEmbedParam() {
    try { return new URLSearchParams(global.location.search).has('embed'); }
    catch (e) { return false; }
  }

  class NullVoice {
    setPosition() {}
    setFrequency() {}
    setGain() {}
    stop() {}
  }

  class SpatialVoice {
    constructor(ctx, bus, { freq = 220, type = 'sine', gain = 0 } = {}, onStop = null, sound = null) {
      this.ctx = ctx;
      this._onStop = onStop;
      this._sound = sound || {};
      this._baseFreq = freq;
      this.osc = ctx.createOscillator();
      this.osc.type = this._sound.waveform || type;
      this.osc.frequency.value = freq * (this._sound.pitchMul || 1);

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

    updateSound(sound) {
      this._sound = sound || this._sound || {};
      if (this._sound.waveform) this.osc.type = this._sound.waveform;
    }

    setPosition(x, y, z) {
      const p = this.panner;
      const t = this.ctx.currentTime;
      const spread = this._sound.spread == null ? 1 : this._sound.spread;
      const wobble = this._sound.movement || 0;
      x *= spread; y *= spread; z *= spread;
      if (wobble > 0) {
        x += Math.sin(t * (0.8 + wobble * 2.5) + this._baseFreq * 0.01) * wobble * 0.85;
        y += Math.cos(t * (0.55 + wobble * 1.7) + this._baseFreq * 0.007) * wobble * 0.55;
      }
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
      const drift = this._sound.drift || 0;
      const mod = drift ? (1 + Math.sin(t * (0.9 + drift * 4.2) + freq * 0.01) * drift * 0.035) : 1;
      this.osc.frequency.setTargetAtTime(freq * (this._sound.pitchMul || 1) * mod, t, glideSeconds);
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
      if (this._onStop) this._onStop(this);
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
      this._reactiveFreqData = null;
      this._reactiveTimeData = null;
      this._audioReactivity = 1;
      this._soundProfile = {
        tone: 0.55, movement: 0.45, texture: 0.35,
        pulse: 0.4, drift: 0.35, space: 0.28,
        pitch: 0, cutoff: 9000, modRate: 0.8,
        flangeMix: 0, phaserMix: 0, delayMix: 0.08,
        delayTime: 0.16, feedback: 0.18,
        grainMix: 0, grainRate: 9
      };
      this._audioFeatures = { level: 0, low: 0, mid: 0, high: 0, centroid: 0 };
      this._soundInput = null;
      this._soundFilter = null;
      this._soundDry = null;
      this._soundDelay = null;
      this._soundDelayFeedback = null;
      this._soundDelayWet = null;
      this._soundModDelay = null;
      this._soundModWet = null;
      this._soundModOsc = null;
      this._soundModGain = null;
      this._soundPhaserA = null;
      this._soundPhaserB = null;
      this._soundPhaserWet = null;
      this._soundPulse = null;
      this._soundPulseLfo = null;
      this._soundPulseLfoGain = null;
      this._analysisInput = null;
      this._spatialBus = null;
      this._standardBus = null;
      this._listener = null;
      this._spatialVoices = new Set();
      this._synthNodes = [];
      this._synthBed = null;
      this._micSource = null;
      this._mediaEl = null;
      this._mediaSource = null;
      this._mediaUrl = null;
      this._mediaFileName = '';
      this._mediaDuration = 0;
      this._mediaGain = null;
      this._mediaFilter = null;
      this._mediaDryGain = null;
      this._mediaDelay = null;
      this._mediaDelayFeedback = null;
      this._mediaDelayWet = null;
      this._mediaConvolver = null;
      this._mediaReverbWet = null;
      this._mediaModDelay = null;
      this._mediaModGain = null;
      this._mediaModOsc = null;
      this._mediaModWet = null;
      this._mediaEffect = 'none';
      this._mediaAudible = true;
      this._mediaLoop = true;
      this._fileDeck = null;
      this._fileDeckTimer = null;
      this._masterGain = null;
      this._muted = false;
      this._started = false;
      this.onModeChange = null; // optional callback(mode)
      this.onMuteChange = null; // optional callback(muted)
      // Expose the instance so an embedding shell (app.html) can drive
      // master volume without reaching into each screen's closure. Each
      // screen constructs exactly one engine, so this is unambiguous.
      // Harmless in standalone use.
      if (typeof window !== 'undefined') {
        window.__shipEngine = this;
        window.__shipLoadMediaFile = (file) => this.loadMediaFile(file);
        window.__shipMediaConfig = (cfg) => this.configureMedia(cfg);
        window.__shipMediaTransport = (cmd) => this.mediaTransport(cmd);
        window.__shipMediaState = () => this.getMediaState();
        window.__shipReactivityConfig = (value) => this.setAudioReactivity(value);
        window.__shipSoundConfig = (cfg) => this.setSonicProfile(cfg);
        window.__shipSoundState = () => this.getSonicProfile();
        window.__shipSetMuted = (m) => this.setMuted(m);
        window.__shipToggleMute = () => this.toggleMute();
        window.__shipIsMuted = () => this.isMuted();
      }
      this._queueFileDeckInstall();
    }

    _ensureContext() {
      if (this.ctx) return;
      const Ctx = global.AudioContext || global.webkitAudioContext;
      this.ctx = new Ctx();

      // Master analyser (fed by whichever source we end up with)
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = this.fftSize;
      this.analyser.smoothingTimeConstant = this.smoothing;
      this._freqData = new Uint8Array(this.analyser.frequencyBinCount);
      this._timeData = new Uint8Array(this.analyser.fftSize);
      this._reactiveFreqData = new Uint8Array(this.analyser.frequencyBinCount);
      this._reactiveTimeData = new Uint8Array(this.analyser.fftSize);
      this._analysisInput = this.ctx.createGain();
      this._analysisInput.connect(this.analyser);

      // Master output gain — the single mute point. Everything audible routes
      // through here to the destination; the analyser is fed separately, so
      // muting silences sound without freezing the visuals.
      this._masterGain = this.ctx.createGain();
      this._masterGain.gain.value = this._muted ? 0 : 1;
      this._masterGain.connect(this.ctx.destination);

      // Buses for sonification voices
      this._spatialBus = this.ctx.createGain();
      this._spatialBus.gain.value = 0.8;

      this._standardBus = this.ctx.createGain();
      this._standardBus.gain.value = 0.5;
      this._buildGeneratedSoundChain();
      this._spatialBus.connect(this._soundInput);
      this._standardBus.connect(this._soundInput);

      this._listener = this.ctx.listener;
      this._setListenerPosition(0, 0, 0);
      this._setListenerOrientation(0, 0, -1, 0, 1, 0);
      this._buildMediaChain();
    }

    _buildGeneratedSoundChain() {
      const ctx = this.ctx;
      this._soundInput = ctx.createGain();
      this._soundFilter = ctx.createBiquadFilter();
      this._soundFilter.type = 'lowpass';
      this._soundFilter.frequency.value = 9000;
      this._soundFilter.Q.value = 0.8;

      this._soundPulse = ctx.createGain();
      this._soundPulse.gain.value = 1;
      this._soundDry = ctx.createGain();
      this._soundDry.gain.value = 1;

      this._soundDelay = ctx.createDelay(1.2);
      this._soundDelay.delayTime.value = 0.16;
      this._soundDelayFeedback = ctx.createGain();
      this._soundDelayFeedback.gain.value = 0.18;
      this._soundDelayWet = ctx.createGain();
      this._soundDelayWet.gain.value = 0.08;

      this._soundDelay.connect(this._soundDelayFeedback);
      this._soundDelayFeedback.connect(this._soundDelay);
      this._soundDelay.connect(this._soundDelayWet);

      this._soundModDelay = ctx.createDelay(0.06);
      this._soundModDelay.delayTime.value = 0.006;
      this._soundModGain = ctx.createGain();
      this._soundModGain.gain.value = 0.0015;
      this._soundModOsc = ctx.createOscillator();
      this._soundModOsc.frequency.value = 0.8;
      this._soundModOsc.connect(this._soundModGain);
      this._soundModGain.connect(this._soundModDelay.delayTime);
      this._soundModWet = ctx.createGain();
      this._soundModWet.gain.value = 0;
      this._soundModDelay.connect(this._soundModWet);

      this._soundPhaserA = ctx.createBiquadFilter();
      this._soundPhaserB = ctx.createBiquadFilter();
      this._soundPhaserA.type = 'allpass';
      this._soundPhaserB.type = 'allpass';
      this._soundPhaserA.frequency.value = 700;
      this._soundPhaserB.frequency.value = 1800;
      this._soundPhaserA.Q.value = 1.2;
      this._soundPhaserB.Q.value = 1.2;
      this._soundPhaserWet = ctx.createGain();
      this._soundPhaserWet.gain.value = 0;
      this._soundPhaserA.connect(this._soundPhaserB);
      this._soundPhaserB.connect(this._soundPhaserWet);

      this._soundInput.connect(this._soundFilter);
      this._soundFilter.connect(this._soundPulse);
      this._soundPulse.connect(this._soundDry);
      this._soundPulse.connect(this._soundDelay);
      this._soundPulse.connect(this._soundModDelay);
      this._soundPulse.connect(this._soundPhaserA);
      this._soundDry.connect(this._masterGain);
      this._soundDelayWet.connect(this._masterGain);
      this._soundModWet.connect(this._masterGain);
      this._soundPhaserWet.connect(this._masterGain);

      this._soundPulseLfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0;
      this._soundPulseLfo.frequency.value = 1.4;
      this._soundPulseLfo.connect(lfoGain);
      lfoGain.connect(this._soundPulse.gain);
      this._soundPulseLfo.start();
      this._soundModOsc.start();
      this._soundPulseLfoGain = lfoGain;
      this._applySonicProfile();
    }

    async start() {
      if (this._started) return this.mode;
      this._started = true;
      this._ensureContext();

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const src = this.ctx.createMediaStreamSource(stream);
        this._micSource = src;
        if (!this._mediaSource) src.connect(this._analysisInput);
        if (!this._mediaSource) this.mode = 'mic';
      } catch (err) {
        if (!this._mediaSource) {
          this._startSyntheticSource();
          this.mode = 'synthetic';
        }
      }

      this._publishMode();
      setTimeout(() => this._publishMode(), 0);
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
      bed.connect(this._analysisInput);
      this._synthBed = bed;

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

    _stopSyntheticSource() {
      this._synthNodes.forEach((node) => {
        try { if (node.stop) node.stop(); } catch (e) {}
        try { node.disconnect(); } catch (e) {}
      });
      this._synthNodes = [];
      if (this._synthBed) {
        try { this._synthBed.disconnect(); } catch (e) {}
        this._synthBed = null;
      }
    }

    _buildMediaChain() {
      const ctx = this.ctx;
      this._mediaGain = ctx.createGain();
      this._mediaGain.gain.value = 0;

      this._mediaFilter = ctx.createBiquadFilter();
      this._mediaFilter.type = 'lowpass';
      this._mediaFilter.frequency.value = 16000;
      this._mediaFilter.Q.value = 0.7;

      this._mediaDryGain = ctx.createGain();
      this._mediaDryGain.gain.value = 1;
      this._mediaDryGain.connect(this._masterGain);

      this._mediaDelay = ctx.createDelay(1.5);
      this._mediaDelay.delayTime.value = 0.22;
      this._mediaDelayFeedback = ctx.createGain();
      this._mediaDelayFeedback.gain.value = 0.32;
      this._mediaDelayWet = ctx.createGain();
      this._mediaDelayWet.gain.value = 0;
      this._mediaDelay.connect(this._mediaDelayFeedback);
      this._mediaDelayFeedback.connect(this._mediaDelay);
      this._mediaDelay.connect(this._mediaDelayWet);
      this._mediaDelayWet.connect(this._masterGain);

      this._mediaConvolver = ctx.createConvolver();
      this._mediaConvolver.buffer = this._makeImpulse(2.4, 2.2);
      this._mediaReverbWet = ctx.createGain();
      this._mediaReverbWet.gain.value = 0;
      this._mediaConvolver.connect(this._mediaReverbWet);
      this._mediaReverbWet.connect(this._masterGain);

      this._mediaModDelay = ctx.createDelay(0.05);
      this._mediaModDelay.delayTime.value = 0.008;
      this._mediaModGain = ctx.createGain();
      this._mediaModGain.gain.value = 0.002;
      this._mediaModOsc = ctx.createOscillator();
      this._mediaModOsc.frequency.value = 0.28;
      this._mediaModOsc.connect(this._mediaModGain);
      this._mediaModGain.connect(this._mediaModDelay.delayTime);
      this._mediaModOsc.start();
      this._mediaModWet = ctx.createGain();
      this._mediaModWet.gain.value = 0;
      this._mediaModDelay.connect(this._mediaModWet);
      this._mediaModWet.connect(this._masterGain);

      this._mediaGain.connect(this._mediaFilter);
      this._mediaFilter.connect(this._mediaDryGain);
      this._mediaFilter.connect(this._mediaDelay);
      this._mediaFilter.connect(this._mediaConvolver);
      this._mediaFilter.connect(this._mediaModDelay);
    }

    _makeImpulse(seconds, decay) {
      const ctx = this.ctx;
      const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
      const buffer = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = buffer.getChannelData(ch);
        for (let i = 0; i < len; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
        }
      }
      return buffer;
    }

    async loadMediaFile(file) {
      if (!file) return null;
      this._ensureContext();
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      if (this._mediaEl) {
        try { this._mediaEl.pause(); } catch (e) {}
        try { this._mediaEl.remove(); } catch (e) {}
      }
      if (this._mediaSource) {
        try { this._mediaSource.disconnect(); } catch (e) {}
      }
      if (this._mediaUrl) {
        try { URL.revokeObjectURL(this._mediaUrl); } catch (e) {}
      }
      this._mediaUrl = URL.createObjectURL(file);
      this._mediaFileName = file.name || 'loaded media';
      this._mediaEl = document.createElement('video');
      this._mediaEl.src = this._mediaUrl;
      this._mediaEl.crossOrigin = 'anonymous';
      this._mediaEl.loop = this._mediaLoop;
      this._mediaEl.playsInline = true;
      this._mediaEl.preload = 'auto';
      this._mediaEl.muted = false;
      this._mediaEl.style.display = 'none';
      this._mediaEl.addEventListener('loadedmetadata', () => {
        this._mediaDuration = Number.isFinite(this._mediaEl.duration) ? this._mediaEl.duration : 0;
        this._updateFileDeck();
      });
      this._mediaEl.addEventListener('play', () => {
        this._suspendGeneratedAudio();
        this._updateFileDeck();
      });
      this._mediaEl.addEventListener('pause', () => this._updateFileDeck());
      this._mediaEl.addEventListener('timeupdate', () => this._updateFileDeck());
      (document.body || document.documentElement).appendChild(this._mediaEl);
      this._mediaSource = this.ctx.createMediaElementSource(this._mediaEl);
      this._mediaSource.connect(this._analysisInput);
      this._mediaSource.connect(this._mediaGain);
      this._stopSyntheticSource();
      if (this._micSource) {
        try { this._micSource.disconnect(this._analysisInput); } catch (e) {}
      }
      this.mode = 'file';
      this.configureMedia({ audible: this._mediaAudible, effect: this._mediaEffect, loop: this._mediaLoop });
      await this._mediaEl.play();
      this._updateFileDeck();
      this._publishMode();
      setTimeout(() => this._publishMode(), 0);
      return this.getMediaState();
    }

    configureMedia(cfg) {
      if (!cfg) return this.getMediaState();
      if (cfg.audible != null) this._mediaAudible = !!cfg.audible;
      if (cfg.passThrough != null) this._mediaAudible = !!cfg.passThrough;
      if (cfg.loop != null) {
        this._mediaLoop = !!cfg.loop;
        if (this._mediaEl) this._mediaEl.loop = this._mediaLoop;
      }
      if (cfg.effect) this._mediaEffect = cfg.effect;
      if (cfg.filterType && this._mediaFilter) this._mediaFilter.type = cfg.filterType;
      if (cfg.cutoff != null && this._mediaFilter) this._mediaFilter.frequency.setTargetAtTime(clamp(cfg.cutoff, 80, 18000), this.ctx.currentTime, 0.03);
      if (cfg.resonance != null && this._mediaFilter) this._mediaFilter.Q.setTargetAtTime(clamp(cfg.resonance, 0.1, 18), this.ctx.currentTime, 0.03);
      if (cfg.delayTime != null && this._mediaDelay) this._mediaDelay.delayTime.setTargetAtTime(clamp(cfg.delayTime, 0.02, 1.2), this.ctx.currentTime, 0.03);
      if (cfg.feedback != null && this._mediaDelayFeedback) this._mediaDelayFeedback.gain.setTargetAtTime(clamp(cfg.feedback, 0, 0.82), this.ctx.currentTime, 0.03);
      if (cfg.modRate != null && this._mediaModOsc) this._mediaModOsc.frequency.setTargetAtTime(clamp(cfg.modRate, 0.02, 8), this.ctx.currentTime, 0.03);
      if (cfg.modDepth != null && this._mediaModGain) this._mediaModGain.gain.setTargetAtTime(clamp(cfg.modDepth, 0.0005, 0.018), this.ctx.currentTime, 0.03);
      if (cfg.pitch != null && this._mediaEl) {
        const rate = Math.pow(2, clamp(cfg.pitch, -12, 12) / 12);
        this._mediaEl.preservesPitch = false;
        this._mediaEl.mozPreservesPitch = false;
        this._mediaEl.webkitPreservesPitch = false;
        this._mediaEl.playbackRate = rate;
      }
      this._applyMediaEffect();
      this._updateFileDeck();
      return this.getMediaState();
    }

    setAudioReactivity(value) {
      this._audioReactivity = clamp(Number(value), 0, 2);
      this._updateFileDeck();
      return this._audioReactivity;
    }

    getAudioReactivity() {
      return this._audioReactivity;
    }

    async mediaTransport(cmd) {
      if (!cmd) return this.getMediaState();
      if (!this._mediaEl) return this.getMediaState();
      if (this.ctx && this.ctx.state === 'suspended') await this.ctx.resume();
      if (cmd.action === 'play') {
        this._suspendGeneratedAudio();
        await this._mediaEl.play();
      } else if (cmd.action === 'pause') {
        this._mediaEl.pause();
      } else if (cmd.action === 'toggle') {
        if (this._mediaEl.paused) {
          this._suspendGeneratedAudio();
          await this._mediaEl.play();
        } else {
          this._mediaEl.pause();
        }
      } else if (cmd.action === 'seek' && cmd.time != null) {
        const duration = this._mediaDuration || this._mediaEl.duration || 0;
        this._mediaEl.currentTime = clamp(cmd.time, 0, Math.max(0, duration || 0));
      } else if (cmd.action === 'seekRatio' && cmd.ratio != null) {
        const duration = this._mediaDuration || this._mediaEl.duration || 0;
        if (duration > 0) this._mediaEl.currentTime = clamp(cmd.ratio, 0, 1) * duration;
      } else if (cmd.action === 'restart') {
        this._mediaEl.currentTime = 0;
        this._suspendGeneratedAudio();
        await this._mediaEl.play();
      }
      this._updateFileDeck();
      return this.getMediaState();
    }

    getMediaState() {
      const currentTime = this._mediaEl ? this._mediaEl.currentTime : 0;
      const duration = this._mediaEl ? (this._mediaDuration || this._mediaEl.duration || 0) : 0;
      return {
        loaded: !!this._mediaEl,
        fileName: this._mediaFileName,
        playing: !!(this._mediaEl && !this._mediaEl.paused),
        currentTime: Number.isFinite(currentTime) ? currentTime : 0,
        duration: Number.isFinite(duration) ? duration : 0,
        audible: this._mediaAudible,
        passThrough: this._mediaAudible,
        loop: this._mediaLoop,
        effect: this._mediaEffect,
        mode: this.mode
      };
    }

    setSonicProfile(cfg) {
      if (!cfg) return this.getSonicProfile();
      ['tone', 'movement', 'texture', 'pulse', 'drift', 'space', 'flangeMix', 'phaserMix', 'delayMix', 'grainMix'].forEach((key) => {
        if (cfg[key] != null) this._soundProfile[key] = clamp(Number(cfg[key]), 0, 1);
      });
      if (cfg.pitch != null) this._soundProfile.pitch = clamp(Number(cfg.pitch), -24, 24);
      if (cfg.cutoff != null) this._soundProfile.cutoff = clamp(Number(cfg.cutoff), 80, 18000);
      if (cfg.modRate != null) this._soundProfile.modRate = clamp(Number(cfg.modRate), 0.02, 12);
      if (cfg.delayTime != null) this._soundProfile.delayTime = clamp(Number(cfg.delayTime), 0.015, 1.2);
      if (cfg.feedback != null) this._soundProfile.feedback = clamp(Number(cfg.feedback), 0, 0.86);
      if (cfg.grainRate != null) this._soundProfile.grainRate = clamp(Number(cfg.grainRate), 1, 40);
      this._applySonicProfile();
      this._spatialVoices.forEach((voice) => {
        try { if (voice.updateSound) voice.updateSound(this._soundVoiceConfig()); } catch (e) {}
      });
      return this.getSonicProfile();
    }

    getSonicProfile() {
      return Object.assign({}, this._soundProfile);
    }

    _applySonicProfile() {
      if (!this.ctx || !this._soundFilter) return;
      const t = this.ctx.currentTime;
      const p = this._soundProfile;
      const f = this._audioFeatures;
      const cutoff = clamp(p.cutoff + (p.tone - 0.5) * 3600 + f.high * p.texture * 2400, 80, 18000);
      const q = 0.45 + p.texture * 9 + f.mid * 2.5;
      const delayTime = clamp(p.delayTime + p.space * 0.2 + f.low * p.movement * 0.12, 0.015, 1.2);
      const feedback = clamp(p.feedback + p.space * 0.18, 0, 0.86);
      const wet = clamp(p.delayMix + p.space * (0.04 + f.mid * 0.18), 0, 1);
      this._soundFilter.frequency.setTargetAtTime(cutoff, t, 0.08);
      this._soundFilter.Q.setTargetAtTime(q, t, 0.08);
      this._soundDelay.delayTime.setTargetAtTime(delayTime, t, 0.08);
      this._soundDelayFeedback.gain.setTargetAtTime(feedback, t, 0.08);
      this._soundDelayWet.gain.setTargetAtTime(wet, t, 0.08);
      if (this._soundModDelay) {
        const modRate = p.modRate + f.centroid * p.movement * 5;
        this._soundModOsc.frequency.setTargetAtTime(modRate, t, 0.08);
        this._soundModDelay.delayTime.setTargetAtTime(0.003 + p.flangeMix * 0.009, t, 0.08);
        this._soundModGain.gain.setTargetAtTime(0.0008 + p.flangeMix * 0.008, t, 0.08);
        this._soundModWet.gain.setTargetAtTime(p.flangeMix * (0.12 + f.high * 0.4), t, 0.08);
      }
      if (this._soundPhaserA) {
        const sweep = 240 + (p.modRate * 120) + f.mid * 2600;
        this._soundPhaserA.frequency.setTargetAtTime(sweep, t, 0.08);
        this._soundPhaserB.frequency.setTargetAtTime(sweep * (1.8 + p.texture), t, 0.08);
        this._soundPhaserA.Q.setTargetAtTime(0.7 + p.texture * 5, t, 0.08);
        this._soundPhaserB.Q.setTargetAtTime(0.7 + p.texture * 5, t, 0.08);
        this._soundPhaserWet.gain.setTargetAtTime(p.phaserMix * (0.12 + f.mid * 0.5), t, 0.08);
      }
      if (this._soundPulseLfo && this._soundPulseLfoGain) {
        this._soundPulseLfo.frequency.setTargetAtTime(0.4 + p.pulse * 6 + p.grainMix * p.grainRate + f.low * 2.5, t, 0.08);
        this._soundPulseLfoGain.gain.setTargetAtTime(p.pulse * (0.08 + f.level * 0.28) + p.grainMix * 0.32, t, 0.08);
      }
    }

    _soundVoiceConfig(pan) {
      const p = this._soundProfile;
      const f = this._audioFeatures;
      const semis = p.pitch + (p.tone - 0.5) * 10 + (f.mid - 0.35) * p.drift * 5;
      return {
        pitchMul: Math.pow(2, semis / 12),
        waveform: p.texture > 0.75 ? 'sawtooth' : p.texture > 0.45 ? 'triangle' : 'sine',
        spread: 0.65 + p.movement * 1.9 + f.high * 0.45,
        movement: p.movement * (0.25 + f.level * 1.4),
        drift: p.drift * (0.3 + f.mid) + p.grainMix * 0.7,
        grain: p.grainMix,
        grainRate: p.grainRate
      };
    }

    _updateAudioFeatures(freqData) {
      if (!freqData || !freqData.length) return;
      const band = (lo, hi) => {
        const start = Math.max(0, Math.floor(freqData.length * lo));
        const end = Math.min(freqData.length, Math.max(start + 1, Math.floor(freqData.length * hi)));
        let sum = 0;
        for (let i = start; i < end; i++) sum += freqData[i];
        return sum / ((end - start) * 255);
      };
      let weighted = 0, total = 0;
      for (let i = 0; i < freqData.length; i += 8) {
        const v = freqData[i] / 255;
        weighted += v * (i / freqData.length);
        total += v;
      }
      this._audioFeatures.low = band(0.01, 0.08);
      this._audioFeatures.mid = band(0.08, 0.28);
      this._audioFeatures.high = band(0.28, 0.65);
      this._audioFeatures.centroid = total > 0 ? weighted / total : 0;
      this._applySonicProfile();
    }

    _applyMediaEffect() {
      if (!this._mediaGain) return;
      const t = this.ctx.currentTime;
      const audible = this._mediaAudible ? 1 : 0;
      const effect = this._mediaEffect;
      const dry = (effect === 'none' || effect === 'filter' || effect === 'pitch') ? audible : audible * 0.55;
      this._mediaGain.gain.setTargetAtTime(audible, t, 0.03);
      this._mediaDryGain.gain.setTargetAtTime(dry, t, 0.03);
      this._mediaDelayWet.gain.setTargetAtTime(effect === 'delay' ? audible * 0.55 : 0, t, 0.03);
      this._mediaReverbWet.gain.setTargetAtTime(effect === 'reverb' ? audible * 0.55 : 0, t, 0.03);
      this._mediaModWet.gain.setTargetAtTime((effect === 'chorus' || effect === 'flange') ? audible * 0.55 : 0, t, 0.03);
      if (effect === 'chorus') {
        this._mediaModDelay.delayTime.setTargetAtTime(0.018, t, 0.03);
        this._mediaModOsc.frequency.setTargetAtTime(0.35, t, 0.03);
        this._mediaModGain.gain.setTargetAtTime(0.006, t, 0.03);
      } else if (effect === 'flange') {
        this._mediaModDelay.delayTime.setTargetAtTime(0.004, t, 0.03);
        this._mediaModOsc.frequency.setTargetAtTime(0.9, t, 0.03);
        this._mediaModGain.gain.setTargetAtTime(0.002, t, 0.03);
      }
      if (effect !== 'filter') {
        this._mediaFilter.type = 'lowpass';
        this._mediaFilter.frequency.setTargetAtTime(16000, t, 0.03);
        this._mediaFilter.Q.setTargetAtTime(0.7, t, 0.03);
      }
      if (this._mediaEl && effect !== 'pitch') this._mediaEl.playbackRate = 1;
    }

    _mediaIsPlaying() {
      return !!(this._mediaEl && !this._mediaEl.paused && !this._mediaEl.ended);
    }

    _suspendGeneratedAudio() {
      this._stopSyntheticSource();
      if (this._micSource) {
        try { this._micSource.disconnect(this._analysisInput); } catch (e) {}
      }
      this._spatialVoices.forEach((voice) => {
        try { voice.stop(0.03); } catch (e) {}
      });
      this._spatialVoices.clear();
    }

    _queueFileDeckInstall() {
      if (hasEmbedParam() || !global.document) return;
      const install = () => this._installFileDeck();
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
      else setTimeout(install, 0);
    }

    _installFileDeck() {
      if (this._fileDeck || !document.body) return;
      const deck = document.createElement('div');
      deck.className = 'ship-file-deck';
      deck.innerHTML =
        '<style>' +
        '.ship-file-deck{position:fixed;left:14px;bottom:14px;z-index:7;width:min(330px,calc(100vw - 28px));max-height:min(78vh,620px);overflow:auto;background:rgba(4,7,9,.88);border:1px solid rgba(160,190,190,.34);color:#d9ecec;font:11px/1.35 monospace;padding:10px 11px;box-shadow:0 10px 34px rgba(0,0,0,.36);backdrop-filter:blur(8px)}' +
        '.ship-file-deck *{box-sizing:border-box}.ship-file-deck .head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;text-transform:uppercase;letter-spacing:.12em;color:#8fdad5;font-weight:700}.ship-file-deck .name{color:#8c9b9d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:155px;text-transform:none;letter-spacing:0;font-weight:400}.ship-file-deck input[type=file]{width:100%;font-size:10px;color:#cfe2e2;margin-bottom:8px}.ship-file-deck select,.ship-file-deck input[type=range]{width:100%;accent-color:#8fdad5}.ship-file-deck select{background:#071012;color:#d9ecec;border:1px solid rgba(160,190,190,.32);padding:5px;font:11px monospace}.ship-file-deck label{display:grid;grid-template-columns:82px 1fr;align-items:center;gap:8px;margin-top:7px;color:#9fafb0}.ship-file-deck .inline{display:flex;align-items:center;gap:8px;margin-top:7px}.ship-file-deck .transport{display:grid;grid-template-columns:auto auto 1fr auto;gap:7px;align-items:center;margin-top:8px}.ship-file-deck .time{color:#8c9b9d;font-size:10px;text-align:right}.ship-file-deck button{background:transparent;color:#8fdad5;border:1px solid rgba(143,218,213,.55);font:700 10px monospace;padding:5px 7px;text-transform:uppercase;letter-spacing:.1em;cursor:pointer}.ship-file-deck button.active{background:#8fdad5;color:#041012}' +
        '</style>' +
        '<div class="head"><span>File Driver</span><span class="name" data-role="name">no file</span></div>' +
        '<input data-role="file" type="file" accept="audio/*,video/*">' +
        '<div class="transport"><button data-role="play">Play</button><button data-role="restart">Restart</button><input data-role="seek" type="range" min="0" max="1" value="0" step="0.001"><span class="time" data-role="time">0:00 / 0:00</span></div>' +
        '<div class="inline"><button data-role="audible">File Audio</button><button data-role="loop">Loop</button><span data-role="state">file stops synth</span></div>' +
        '<div class="inline"><button data-role="mute">Mute Output</button><span data-role="mutestate">audio on</span></div>' +
        '<label><span>Reactivity</span><input data-role="reactivity" type="range" min="0" max="2" value="1" step="0.01"></label>' +
        '<label><span>Effect</span><select data-role="effect"><option value="none">Clean</option><option value="filter">Filter</option><option value="delay">Delay</option><option value="reverb">Reverb</option><option value="chorus">Chorus</option><option value="flange">Flange</option><option value="pitch">Pitch Shift</option></select></label>' +
        '<label><span>Cutoff</span><input data-role="cutoff" type="range" min="120" max="16000" value="16000" step="10"></label>' +
        '<label><span>Pitch</span><input data-role="pitch" type="range" min="-12" max="12" value="0" step="1"></label>';
      document.body.appendChild(deck);
      this._fileDeck = deck;
      const file = deck.querySelector('[data-role=file]');
      const play = deck.querySelector('[data-role=play]');
      const restart = deck.querySelector('[data-role=restart]');
      const seek = deck.querySelector('[data-role=seek]');
      const audible = deck.querySelector('[data-role=audible]');
      const loop = deck.querySelector('[data-role=loop]');
      const mute = deck.querySelector('[data-role=mute]');
      const reactivity = deck.querySelector('[data-role=reactivity]');
      const effect = deck.querySelector('[data-role=effect]');
      const cutoff = deck.querySelector('[data-role=cutoff]');
      const pitch = deck.querySelector('[data-role=pitch]');
      file.addEventListener('change', async () => {
        if (file.files && file.files[0]) await this.loadMediaFile(file.files[0]);
      });
      play.addEventListener('click', () => this.mediaTransport({ action: 'toggle' }));
      restart.addEventListener('click', () => this.mediaTransport({ action: 'restart' }));
      seek.addEventListener('input', () => this.mediaTransport({ action: 'seekRatio', ratio: parseFloat(seek.value) }));
      audible.addEventListener('click', () => this.configureMedia({ audible: !this._mediaAudible }));
      loop.addEventListener('click', () => this.configureMedia({ loop: !this._mediaLoop }));
      mute.addEventListener('click', () => { this.setMuted(!this._muted); this._updateFileDeck(); });
      reactivity.addEventListener('input', () => this.setAudioReactivity(parseFloat(reactivity.value)));
      effect.addEventListener('change', () => this.configureMedia({ effect: effect.value }));
      cutoff.addEventListener('input', () => this.configureMedia({ effect: effect.value, cutoff: parseFloat(cutoff.value) }));
      pitch.addEventListener('input', () => this.configureMedia({ effect: 'pitch', pitch: parseFloat(pitch.value) }));
      this._updateFileDeck();
    }

    _updateFileDeck() {
      if (!this._fileDeck) return;
      const name = this._fileDeck.querySelector('[data-role=name]');
      const state = this._fileDeck.querySelector('[data-role=state]');
      const play = this._fileDeck.querySelector('[data-role=play]');
      const seek = this._fileDeck.querySelector('[data-role=seek]');
      const time = this._fileDeck.querySelector('[data-role=time]');
      const audible = this._fileDeck.querySelector('[data-role=audible]');
      const loop = this._fileDeck.querySelector('[data-role=loop]');
      const reactivity = this._fileDeck.querySelector('[data-role=reactivity]');
      const effect = this._fileDeck.querySelector('[data-role=effect]');
      const media = this.getMediaState();
      name.textContent = this._mediaFileName || 'no file';
      state.textContent = media.loaded ? 'media drives visuals; synth off while playing' : 'fallback synth until file loads';
      play.textContent = media.playing ? 'Pause' : 'Play';
      seek.value = media.duration > 0 ? String(clamp(media.currentTime / media.duration, 0, 1)) : '0';
      time.textContent = this._formatTime(media.currentTime) + ' / ' + this._formatTime(media.duration);
      audible.classList.toggle('active', this._mediaAudible);
      audible.textContent = this._mediaAudible ? 'File Audio' : 'Muted';
      loop.classList.toggle('active', this._mediaLoop);
      const mute = this._fileDeck.querySelector('[data-role=mute]');
      const mutestate = this._fileDeck.querySelector('[data-role=mutestate]');
      if (mute) { mute.classList.toggle('active', this._muted); mute.textContent = this._muted ? 'Muted' : 'Mute Output'; }
      if (mutestate) mutestate.textContent = this._muted ? 'all audio off' : 'audio on';
      reactivity.value = String(this._audioReactivity);
      effect.value = this._mediaEffect;
    }

    _formatTime(seconds) {
      if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
      const s = Math.floor(seconds % 60);
      const m = Math.floor(seconds / 60) % 60;
      const h = Math.floor(seconds / 3600);
      if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
      return m + ':' + String(s).padStart(2, '0');
    }

    _publishMode() {
      if (typeof document !== 'undefined') {
        const dot = document.getElementById('mode-dot');
        const txt = document.getElementById('mode-text');
        if (dot && txt) {
          dot.classList.remove('live', 'synth');
          if (this.mode === 'mic') { dot.classList.add('live'); txt.textContent = 'LIVE MIC'; }
          else if (this.mode === 'file') { dot.classList.add('live'); txt.textContent = 'FILE DRIVER'; }
          else { dot.classList.add('synth'); txt.textContent = 'SYNTH FEED'; }
        }
      }
      if (this.onModeChange) this.onModeChange(this.mode);
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
      this._updateAudioFeatures(this._freqData);
      const gain = this._audioReactivity;
      for (let i = 0; i < this._freqData.length; i++) {
        this._reactiveFreqData[i] = clamp(Math.round(this._freqData[i] * gain), 0, 255);
      }
      return this._reactiveFreqData;
    }

    getTimeDomainData() {
      this.analyser.getByteTimeDomainData(this._timeData);
      const gain = this._audioReactivity;
      for (let i = 0; i < this._timeData.length; i++) {
        this._reactiveTimeData[i] = clamp(Math.round(128 + (this._timeData[i] - 128) * gain), 0, 255);
      }
      return this._reactiveTimeData;
    }

    getLevel() {
      const data = this.getTimeDomainData();
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const level = Math.sqrt(sum / data.length);
      this._audioFeatures.level = level;
      this._applySonicProfile();
      return level;
    }

    _rampGain(node, value, seconds) {
      if (!node || !this.ctx) return;
      const t = this.ctx.currentTime;
      const target = clamp(value, 0, 1);
      if (seconds === 0) {
        node.gain.cancelScheduledValues(t);
        node.gain.setValueAtTime(target, t);
        return;
      }
      const ramp = Math.max(0.02, seconds == null ? 0.45 : seconds);
      node.gain.cancelScheduledValues(t);
      node.gain.setValueAtTime(node.gain.value, t);
      node.gain.linearRampToValueAtTime(target, t + ramp);
    }

    setSpatialGain(g, rampSeconds) { this._rampGain(this._spatialBus, g, rampSeconds); }
    setStandardGain(g, rampSeconds) { this._rampGain(this._standardBus, g, rampSeconds); }

    // Master mute — silences all audible output at the final gain stage. The
    // analyser keeps running, so visuals stay live while muted. Safe to call
    // before start(): the flag is remembered and applied when the context is
    // built. A short ramp avoids clicks.
    setMuted(muted) {
      this._muted = !!muted;
      if (this._masterGain) this._rampGain(this._masterGain, this._muted ? 0 : 1, 0.08);
      if (this.onMuteChange) this.onMuteChange(this._muted);
      return this._muted;
    }
    toggleMute() { return this.setMuted(!this._muted); }
    isMuted() { return this._muted; }

    createSpatialVoice(opts) {
      if (this._mediaIsPlaying()) return new NullVoice();
      const voice = new SpatialVoice(this.ctx, this._spatialBus, opts, (v) => this._spatialVoices.delete(v), this._soundVoiceConfig());
      this._spatialVoices.add(voice);
      return voice;
    }

    /** One-shot standard (non-3D, stereo-panned) sonification blip. */
    pingStandard({ freq = 440, pan = 0, duration = 0.3, type = 'sine', gain = 0.5 } = {}) {
      if (this._mediaIsPlaying()) return;
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const sound = this._soundVoiceConfig(pan);
      const osc = ctx.createOscillator();
      osc.type = sound.waveform || type;
      osc.frequency.value = freq * sound.pitchMul * (1 + (Math.random() - 0.5) * sound.drift * 0.08);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      const shapedGain = gain * (0.72 + this._soundProfile.pulse * 0.44 + this._audioFeatures.level * 0.4);
      const grainShorten = 1 - this._soundProfile.grainMix * 0.55;
      const shapedDuration = duration * (0.65 + this._soundProfile.space * 1.05) * grainShorten;
      g.gain.linearRampToValueAtTime(shapedGain, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + shapedDuration);

      const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      osc.connect(g);
      if (panner) {
        panner.pan.value = clamp(pan * sound.spread, -1, 1);
        g.connect(panner);
        panner.connect(this._standardBus);
      } else {
        g.connect(this._standardBus);
      }
      osc.start(t);
      osc.stop(t + shapedDuration + 0.05);
    }
  }

  global.ShipAudioEngine = ShipAudioEngine;
})(window);
