// Plays the booking alarm. Lives in an offscreen document because a web page
// the user hasn't clicked yet is not allowed to start sound on its own.

let ctx = null;
let timer = null;

function burst(times) {
  ctx ||= new AudioContext();
  for (let i = 0; i < times; i++) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = i % 2 ? 880 : 1320;
    g.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.35);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.35 + 0.3);
    o.start(ctx.currentTime + i * 0.35);
    o.stop(ctx.currentTime + i * 0.35 + 0.32);
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== "offscreen") return;
  if (msg.type === "siren-start") {
    clearInterval(timer);
    burst(6);
    if (msg.once) return;
    let rounds = 0;
    timer = setInterval(() => {
      if (++rounds >= 15) { clearInterval(timer); return; } // ~1 minute max
      burst(4);
    }, 4000);
  }
  if (msg.type === "siren-stop") clearInterval(timer);
});
