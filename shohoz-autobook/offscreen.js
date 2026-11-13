// Plays the booking alarm. Lives in an offscreen document because a web page
// the user hasn't clicked yet is not allowed to start sound on its own.
//
// Both sounds are made here from plain tones — no recording is used, so there
// is nothing to license.

let ctx = null;
let timer = null;
let live = []; // oscillators that are sounding or scheduled

// The classic alarm: quick high beeps.
function beeps(ac, out, at, times) {
  const oscs = [];
  for (let i = 0; i < times; i++) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.connect(g);
    g.connect(out);
    o.frequency.value = i % 2 ? 880 : 1320;
    g.gain.setValueAtTime(0.3, at + i * 0.35);
    g.gain.exponentialRampToValueAtTime(0.001, at + i * 0.35 + 0.3);
    o.start(at + i * 0.35);
    o.stop(at + i * 0.35 + 0.32);
    oscs.push(o);
  }
  return { oscs, length: times * 0.35 };
}

// A diesel locomotive's air horn: five notes sounded together, each a buzzy
// tone with its edge filtered off. Blown in the level-crossing pattern
// long – long – short – long.
const HORN_NOTES = [311.1, 370, 415.3, 493.9, 622.3]; // D#4 F#4 G#4 B4 D#5
const HORN_BLASTS = [1.0, 1.0, 0.35, 1.5];
const HORN_GAP = 0.28;

function horn(ac, out, at) {
  const oscs = [];
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1900;
  filter.Q.value = 0.7;
  const squash = ac.createDynamicsCompressor(); // five notes at once must not clip
  filter.connect(squash);
  squash.connect(out);
  let t = at;
  for (const len of HORN_BLASTS) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.07);   // the valve opening
    g.gain.setValueAtTime(0.16, t + len - 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);  // air running out
    g.connect(filter);
    HORN_NOTES.forEach((f, i) => {
      const o = ac.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f * 0.985, t);                    // starts a touch flat,
      o.frequency.linearRampToValueAtTime(f, t + 0.12);            // as a real horn does
      o.detune.value = (i % 2 ? 1 : -1) * 6;
      o.connect(g);
      o.start(t);
      o.stop(t + len + 0.02);
      oscs.push(o);
    });
    t += len + HORN_GAP;
  }
  return { oscs, length: t - at };
}

function play(sound, first) {
  ctx ||= new AudioContext();
  const at = ctx.currentTime + 0.03;
  const made = sound === "beep" ? beeps(ctx, ctx.destination, at, first ? 6 : 4) : horn(ctx, ctx.destination, at);
  live = live.filter((o) => !o.done).concat(made.oscs);
  for (const o of made.oscs) o.onended = () => { o.done = true; };
}

function silence() {
  clearInterval(timer);
  for (const o of live) { try { o.stop(); } catch (_) {} }
  live = [];
}

if (globalThis.chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.target !== "offscreen") return;
    if (msg.type === "siren-start") {
      silence();
      const sound = msg.sound === "beep" ? "beep" : "horn";
      play(sound, true);
      if (msg.once) return;
      // Keep ringing for about a minute, or until the user clicks the page.
      const every = sound === "beep" ? 4000 : 7000;
      let rounds = 0;
      timer = setInterval(() => {
        if (++rounds >= Math.round(60000 / every)) { clearInterval(timer); return; }
        play(sound, false);
      }, every);
    }
    if (msg.type === "siren-stop") silence();
  });
}
