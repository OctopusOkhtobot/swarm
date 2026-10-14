export type Sfx = "step" | "focus" | "birth" | "page" | "thread" | "stretch" | "skitter" | "gasp" | "bounce" | "metal" | "rubber";

export type SwarmAudio = {
  unlock: () => void;
  setMuted: (muted: boolean) => void;
  muted: () => boolean;
  play: (kind: Sfx) => void;
};

export function createAudio(): SwarmAudio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let sfx: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let isMuted = false;
  let lastStep = 0;
  let lastBounce = 0;
  let lastMetal = 0;
  let lastRubber = 0;
  let bound = false;

  function ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor({ latencyHint: "interactive" });
      master = ctx.createGain();
      sfx = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -15;
      comp.knee.value = 12;
      comp.ratio.value = 3.8;
      comp.attack.value = 0.002;
      comp.release.value = 0.12;
      master.gain.value = isMuted ? 0 : 1.35;
      sfx.gain.value = 2.15;
      sfx.connect(comp);
      comp.connect(master);
      master.connect(ctx.destination);
      const seconds = 2;
      noise = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
      const data = noise.getChannelData(0);
      let brown = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        brown = brown * 0.96 + white * 0.04;
        data[i] = Math.max(-1, Math.min(1, white * 0.62 + brown * 1.5));
      }
    }
    return ctx;
  }

  function unlock() {
    const context = ensure();
    if (!context) return;
    if (context.state === "suspended") void context.resume();
    if (!bound) {
      bound = true;
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && ctx?.state === "suspended") void ctx.resume();
      });
    }
  }

  function envGain(peak: number, dur: number, attack = 0.003, when = 0): GainNode | null {
    if (!ctx || !sfx) return null;
    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 0.7 - 0.35;
    const t = ctx.currentTime + when;
    gain.connect(pan);
    pan.connect(sfx);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    window.setTimeout(() => {
      gain.disconnect();
      pan.disconnect();
    }, (when + dur + 0.08) * 1000);
    return gain;
  }

  function tone(freq: number, dur: number, type: OscillatorType, peak: number, when = 0, slideTo?: number) {
    if (!ctx) return;
    const gain = envGain(peak, dur, 0.002, when);
    if (!gain) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    const t = ctx.currentTime + when;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
    osc.connect(gain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    osc.onended = () => osc.disconnect();
  }

  function grit(dur: number, from: number, to: number, peak: number, q: number, when = 0) {
    if (!ctx || !noise) return;
    const gain = envGain(peak, dur, 0.004, when);
    if (!gain) return;
    const source = ctx.createBufferSource();
    source.buffer = noise;
    source.playbackRate.value = 0.7 + Math.random() * 0.7;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = q;
    const t = ctx.currentTime + when;
    filter.frequency.setValueAtTime(Math.max(80, from), t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(90, to), t + dur);
    source.connect(filter);
    filter.connect(gain);
    source.start(t);
    source.stop(t + dur);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
    };
  }

  function tap(peak = 0.34, when = 0) {
    const high = 2600 + Math.random() * 2800;
    grit(0.016 + Math.random() * 0.012, high, high * 0.55, peak, 4.5, when);
    tone(high, 0.007, "triangle", peak * 0.22, when, high * 0.45);
    grit(0.028, 900 + Math.random() * 400, 2200, peak * 0.28, 1.1, when);
  }

  function play(kind: Sfx) {
    if (!ctx || isMuted) return;
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    if (kind === "step") {
      if (now - lastStep < 0.048) return;
      lastStep = now;
      tap(0.42);
      tap(0.2, 0.018 + Math.random() * 0.01);
      return;
    }
    if (kind === "skitter") {
      tap(0.16);
      tap(0.12, 0.03);
      tap(0.1, 0.055 + Math.random() * 0.02);
      return;
    }
    if (kind === "metal") {
      if (now - lastMetal < 0.085) return;
      lastMetal = now;
      const pitch = 760 + Math.random() * 220;
      tone(pitch, 0.18, "sine", 0.19, 0, pitch * 0.38);
      tone(pitch * 1.91, 0.12, "triangle", 0.12, 0.004, pitch * 1.37);
      tone(pitch * 2.62, 0.07, "sine", 0.045, 0.01, pitch * 1.7);
      tone(92, 0.065, "sine", 0.11, 0, 58);
      grit(0.027, 3600, 1050, 0.13, 3.2);
      return;
    }
    if (kind === "rubber") {
      if (now - lastRubber < 0.095) return;
      lastRubber = now;
      const pitch = 235 + Math.random() * 65;
      tone(pitch, 0.12, "sine", 0.28, 0, 72 + Math.random() * 20);
      tone(pitch * 1.8, 0.085, "triangle", 0.12, 0.012, pitch * 0.83);
      tone(470 + Math.random() * 70, 0.055, "sine", 0.06, 0.022, 205);
      grit(0.042, 560, 130, 0.11, 1.2);
      return;
    }
    if (kind === "stretch") {
      grit(0.26, 380, 1680, 0.32, 0.7);
      grit(0.2, 1500, 260, 0.26, 0.85, 0.12);
      tap(0.24, 0.02);
      tap(0.16, 0.14);
      tone(140, 0.18, "sine", 0.08, 0.04, 70);
      return;
    }
    if (kind === "focus") {
      tap(0.36);
      tap(0.22, 0.04);
      grit(0.07, 1400, 3200, 0.14, 2.2, 0.02);
      return;
    }
    if (kind === "thread") {
      grit(0.28, 500, 2400, 0.22, 0.6);
      grit(0.18, 1800, 600, 0.12, 0.8, 0.08);
      return;
    }
    if (kind === "page") {
      grit(0.32, 220, 1900, 0.3, 0.55);
      tap(0.28, 0.02);
      tap(0.2, 0.07);
      tap(0.16, 0.12);
      tone(120, 0.16, "sine", 0.07, 0, 60);
      return;
    }
    if (kind === "gasp") {
      grit(0.18, 320, 1600, 0.26, 0.65);
      tone(380, 0.12, "sine", 0.18, 0.04, 720);
      tone(610, 0.08, "triangle", 0.07, 0.07, 480);
      tap(0.14, 0.15);
      return;
    }
    if (kind === "bounce") {
      if (now - lastBounce < 0.042) return;
      lastBounce = now;
      const pitch = 680 + Math.random() * 460;
      tone(pitch, 0.055, "sine", 0.055, 0, pitch * 0.38);
      tone(pitch * 1.7, 0.028, "triangle", 0.022, 0, pitch * 0.62);
      grit(0.018, 2800, 900, 0.04, 3.4);
      return;
    }
    for (let i = 0; i < 5; i++) tap(0.26 - i * 0.03, i * 0.035);
    grit(0.24, 700, 2200, 0.2, 0.8, 0.02);
    tone(90 + Math.random() * 20, 0.28, "sine", 0.09, 0, 240);
  }

  return {
    unlock,
    play,
    muted: () => isMuted,
    setMuted: (muted) => {
      isMuted = muted;
      if (!ctx || !master) return;
      master.gain.setTargetAtTime(muted ? 0 : 1.35, ctx.currentTime, 0.02);
    },
  };
}
