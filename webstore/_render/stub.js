// Fake extension APIs so popup.html can render outside the browser for store screenshots.
(function () {
  const q = new URLSearchParams(location.search);
  let rel = new Date(2026, 10, 3, 8, 0, 0).getTime();
  if (rel < Date.now()) rel = Date.now() + (1 * 3600 + 54 * 60 + 12) * 1000;
  const rel2 = new Date(rel); rel2.setHours(14, 0, 0, 0);
  const store = {
    config: {
      fromCity: "Dhaka", toCity: "Chattogram", trainQuery: "SUBORNO EXPRESS (702)",
      classPriority: "S_CHAIR", seatCount: 2, preferredCoaches: "", preferredSeats: "",
      journeyDate: "2026-11-13", triggerTime: "auto", pollIntervalMs: 700, maxWaitMinutes: 5,
      autoReleaseTime: true, lang: q.get("lang") === "bn" ? "bn" : "en",
    },
    armedTrigger: q.get("armed") === "0" ? null : rel,
    armedStages: q.get("armed") === "0" ? null : [rel, rel2.getTime()],
    trainCache: { "Dhaka|Chattogram": { at: Date.now(), trains: [
      { name: "SUBORNO EXPRESS (702)", departure: "04:30 PM", arrival: "09:10 PM" },
      { name: "SONAR BANGLA EXPRESS (787)", departure: "07:00 AM", arrival: "12:10 PM" },
      { name: "TURNA (741)", departure: "11:30 PM", arrival: "06:30 AM" },
    ] } },
    runHistory: [
      { at: Date.now() - 86400000, doj: "2026-11-12", train: "SUBORNO (702)", outcome: "found", detail: "" },
    ],
    presets: { "Dhaka → Ctg (Suborno)": {} },
  };
  const pick = (keys) => {
    if (keys == null) return { ...store };
    const out = {};
    for (const k of [].concat(keys)) if (k in store) out[k] = store[k];
    return out;
  };
  window.chrome = {
    storage: { local: {
      get: async (k) => pick(k),
      set: async (o) => { Object.assign(store, o); },
      remove: async () => {},
    } },
    runtime: {
      sendMessage: async (m) => m.type === "getDefaults" ? { defaults: {} } : { ok: true },
      getURL: (p) => p,
      onMessage: { addListener() {} },
    },
    tabs: {
      query: async () => [{ id: 1 }],
      sendMessage: async (id, m) => m.type === "authStatus" ? { loggedIn: true, user: "Rahim" } : { ok: true },
      create: async () => {},
    },
  };
  if (q.get("cal") === "1") {
    window.addEventListener("load", () => setTimeout(() => document.getElementById("st2").click(), 300));
  }
})();
