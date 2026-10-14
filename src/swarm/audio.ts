export type Sfx = "step" | "focus" | "birth" | "page" | "thread" | "stretch" | "skitter" | "gasp" | "bounce";

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
      comp.threshold.value = -12;
      comp.knee.value = 10;
      comp.ratio.value = 2.4;
      comp.attack.value = 0.002;
      comp.release.value = 0.12;
      master.gain.value = isMuted ? 0 : 1;
      sfx.gain.value = 1.55;
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
      if (now - lastStep < 0.055) return;
      lastStep = now;
      tone(180 + Math.random() * 40, 0.045, "sine", 0.07, 0, 90);
      tone(920 + Math.random() * 180, 0.03, "triangle", 0.035, 0.008, 420);
      return;
    }
    if (kind === "skitter") {
      tone(640, 0.04, "sine", 0.05, 0, 880);
      tone(820, 0.035, "sine", 0.04, 0.05, 540);
      tone(500, 0.04, "triangle", 0.03, 0.09, 760);
      return;
    }
    if (kind === "stretch") {
      tone(220, 0.22, "sine", 0.06, 0, 140);
      tone(440, 0.16, "triangle", 0.03, 0.04, 260);
      grit(0.18, 700, 1400, 0.08, 0.7, 0.02);
      return;
    }
    if (kind === "focus") {
      tone(660, 0.12, "sine", 0.07, 0, 880);
      tone(990, 0.1, "triangle", 0.03, 0.03, 1320);
      return;
    }
    if (kind === "thread") {
      tone(392, 0.28, "sine", 0.07, 0, 294);
      tone(588, 0.22, "triangle", 0.035, 0.02, 392);
      tone(784, 0.16, "sine", 0.02, 0.04, 588);
      grit(0.12, 1800, 900, 0.04, 1.2, 0.01);
      return;
    }
    if (kind === "page") {
      grit(0.22, 240, 900, 0.1, 0.5);
      tone(196, 0.2, "sine", 0.06, 0.02, 330);
      tone(392, 0.14, "triangle", 0.025, 0.06, 294);
      return;
    }
    if (kind === "gasp") {
      grit(0.16, 400, 1200, 0.08, 0.6);
      tone(520, 0.14, "sine", 0.06, 0.02, 780);
      return;
    }
    if (kind === "bounce") {
      if (now - lastBounce < 0.05) return;
      lastBounce = now;
      const pitch = 220 + Math.random() * 80;
      tone(pitch, 0.09, "sine", 0.08, 0, pitch * 0.55);
      tone(pitch * 2, 0.05, "triangle", 0.03, 0.01, pitch);
      return;
    }
    tone(262, 0.16, "sine", 0.06);
    tone(330, 0.18, "sine", 0.045, 0.04);
    tone(392, 0.2, "triangle", 0.03, 0.08);
    grit(0.14, 600, 1400, 0.05, 0.8, 0.02);
  }

  return {
    unlock,
    play,
    muted: () => isMuted,
    setMuted: (muted) => {
      isMuted = muted;
      if (!ctx || !master) return;
      master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.02);
    },
  };
}
