import { evaporationProfile } from "./atmosphere.js";
// Original procedural sound: small physical gestures, not a melody on every drop.
const noiseBuffers = new WeakMap();
function noise(context) {
  if (noiseBuffers.has(context)) return noiseBuffers.get(context);
  const b = context.createBuffer(
      1,
      Math.ceil(context.sampleRate * 1.2),
      context.sampleRate,
    ),
    data = b.getChannelData(0);
  let seed = 137;
  for (let i = 0; i < data.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    data[i] = (seed / 4294967296) * 2 - 1;
  }
  noiseBuffers.set(context, b);
  return b;
}

// Shared by live playback and offline audio validation.
export function scheduleCue(
  context,
  output,
  type,
  event = {},
  when = context.currentTime,
) {
  const sources = [],
    cleanups = [];
  let duration = 0;
  function voice(source, nodes, start, length, volume, attack = 0.008) {
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.00001, start);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.00001, volume),
      start + attack,
    );
    gain.gain.exponentialRampToValueAtTime(0.00001, start + length);
    let tail = source;
    for (const node of nodes) {
      tail.connect(node);
      tail = node;
    }
    tail.connect(gain);
    gain.connect(output);
    const cleanup = () => {
      source.disconnect();
      nodes.forEach((n) => n.disconnect());
      gain.disconnect();
    };
    sources.push(source);
    cleanups.push(cleanup);
    source.onended = cleanup;
    source.start(start);
    source.stop(start + length + 0.02);
    duration = Math.max(duration, start - when + length + 0.02);
  }
  const note = (frequency, end, length, volume, delay = 0, wave = "sine") => {
    const oscillator = context.createOscillator(),
      t = when + delay;
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, t);
    oscillator.frequency.exponentialRampToValueAtTime(end, t + length);
    voice(oscillator, [], t, length, volume);
  };
  const air = (
    frequency,
    end,
    length,
    volume,
    delay = 0,
    filterType = "lowpass",
  ) => {
    const source = context.createBufferSource(),
      filter = context.createBiquadFilter(),
      t = when + delay;
    source.buffer = noise(context);
    source.loop = true;
    filter.type = filterType;
    filter.Q.value = 0.65;
    filter.frequency.setValueAtTime(frequency, t);
    filter.frequency.exponentialRampToValueAtTime(end, t + length);
    voice(source, [filter], t, length, volume, 0.012);
  };
  if (type === "rain") {
    note(410, 100, 0.2, 0.13);
    air(2200, 520, 0.28, 0.1);
    note(680, 310, 0.12, 0.065, 0.095);
    note(950, 420, 0.15, 0.055, 0.17);
    note(1260, 1150, 0.22, 0.026, 0.11);
  } else if (type === "sun") {
    const profile = evaporationProfile(event);
    air(450, 1600, 0.21, 0.12);
    note(180, 66, 0.25, 0.08);
    air(
      event.removed > 0.1 ? 5400 : 2500,
      900,
      event.removed > 0.1 ? profile.life : 0.34,
      0.07 + profile.strength * 0.065,
      0.09,
      "bandpass",
    );
    if (event.removed > 0.1 && event.earned > 0)
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        note(
          f,
          f * 0.996,
          0.27 + profile.strength * 0.2,
          0.035 + profile.strength * 0.02,
          0.13 + i * (0.07 + profile.strength * 0.08),
          "triangle",
        ),
      );
    if (profile.strength > 0.3) {
      note(320, 1100, 0.55 + profile.strength * 0.5, 0.04);
      [0, 0.12, 0.25].forEach((d) => note(200 + d * 500, 100, 0.15, 0.03, d));
    }
  } else if (type === "warning") {
    note(event.critical ? 160 : 220, 90, 0.3, 0.08, 0, "triangle");
    air(500, 120, 0.26, 0.045);
  } else if (type === "recovery") {
    [392, 523.25, 659.25, 784].forEach((f, i) =>
      note(f, f, 0.35, 0.05, i * 0.1, "triangle"),
    );
  } else if (type === "bomb" || type === "mine" || type === "quake") {
    note(type === "quake" ? 78 : 122, 36, 0.48, 0.18);
    air(2000, 120, 0.5, 0.19);
    air(1700, 360, 0.28, 0.07, 0.1);
    note(250, 90, 0.12, 0.045, 0, "triangle");
  } else if (type === "raise" || type === "lower") {
    note(
      type === "raise" ? 230 : 180,
      type === "raise" ? 115 : 70,
      0.15,
      0.095,
      0,
    );
    air(1400, 230, 0.15, 0.055);
    if (event.repaired > 0)
      [392, 523.25, 659.25].forEach((f, i) =>
        note(f, f, 0.22, 0.035, 0.1 + i * 0.07, "triangle"),
      );
  } else if (type === "ice") {
    [880, 1320, 1760].forEach((f, i) =>
      note(f, f * 0.97, 0.3, 0.05, i * 0.035),
    );
  } else if (type === "weather") {
    air(430, 850, 0.9, 0.045);
    note(294, 294, 0.5, 0.018);
    note(440, 440, 0.5, 0.018, 0.15);
  } else if (type === "drop") {
    air(2400, 700, 0.16, 0.08);
  } else {
    note(460, 310, 0.08, 0.045);
    air(1600, 500, 0.045, 0.022);
  }
  return {
    sources,
    duration,
    stop() {
      sources.forEach((s) => {
        try {
          s.stop();
        } catch {}
      });
      cleanups.forEach((c) => c());
    },
  };
}

export function createSoundBank(enabled = false) {
  let context,
    master,
    compressor,
    lastCue = "",
    active = [],
    ambience = null;
  function stopAmbience() {
    if (!ambience) return;
    ambience.source.stop();
    ambience.source.disconnect();
    ambience.filter.disconnect();
    ambience.gain.disconnect();
    ambience = null;
  }
  function stop() {
    for (const cue of active) cue.stop();
    active = [];
    stopAmbience();
  }
  function unlock() {
    if (!enabled) return;
    try {
      if (!context) {
        context = new (window.AudioContext || window.webkitAudioContext)();
        master = context.createGain();
        master.gain.value = 0.55;
        compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -12;
        compressor.knee.value = 9;
        compressor.ratio.value = 5;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.18;
        master.connect(compressor);
        compressor.connect(context.destination);
      }
      return context.resume().catch(() => {});
    } catch {}
  }
  function play(type, event = {}) {
    if (!enabled || !context || context.state !== "running") return;
    try {
      const now = context.currentTime;
      active = active.filter((c) => c.until > now);
      if (active.length >= 6) active.shift().stop();
      const cue = scheduleCue(context, master, type, event, now);
      cue.until = now + cue.duration;
      active.push(cue);
      lastCue = type;
    } catch {}
  }
  return {
    unlock,
    play,
    stop,
    ambient(amount) {
      if (
        !enabled ||
        !context ||
        context.state !== "running" ||
        amount <= 0.001
      ) {
        stopAmbience();
        return;
      }
      if (!ambience) {
        const source = context.createBufferSource(),
          filter = context.createBiquadFilter(),
          gain = context.createGain();
        source.buffer = noise(context);
        source.loop = true;
        filter.type = "lowpass";
        filter.frequency.value = 1800;
        gain.gain.value = 0;
        source.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        source.start();
        ambience = { source, filter, gain };
      }
      ambience.gain.gain.setTargetAtTime(
        Math.min(1, amount) * 0.085,
        context.currentTime,
        0.25,
      );
    },
    setEnabled(value) {
      enabled = value;
      if (!enabled) stop();
    },
    get stats() {
      return {
        enabled,
        state: context?.state || "uninitialized",
        lastCue,
        activeCues: active.filter((c) => c.until > (context?.currentTime || 0))
          .length,
        activeAmbience: ambience ? 1 : 0,
      };
    },
  };
}
