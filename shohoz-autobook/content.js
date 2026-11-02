// BD Rail Ticket Alarm — content script (booking assistant).
// Runs on eticket.railway.gov.bd with the user's own logged-in session.
// At release time it searches for the chosen train, and as soon as online
// seats exist it reloads the site's own results page, highlights the train's
// BOOK NOW button and rings the alarm. The user opens the seat map, picks
// seats (suggested ones are outlined), and does OTP and payment. The seat map
// is protected by the site's bot check, so the extension never calls it.

(() => {
  // Added again into an already-open tab after an install or update: run once
  // per live extension instance. An instance orphaned by a reload can no
  // longer reach chrome.runtime, so it doesn't count.
  const prev = window.__ticketAlarmAlive;
  if (prev && prev()) return;
  window.__ticketAlarmAlive = ((rt) => () => { try { return !!rt?.id; } catch (_) { return false; } })(chrome.runtime);

  const API = "https://railspaapi.shohoz.com/v1.0/web";
  const ASSIST_TTL_MS = 15 * 60_000; // how long a "seats are open" handoff stays active
  let overlay, logBox, mission, cfg;
  let engineStarted = false;
  let aborted = false;

  // Pick Bangla text when the popup language is Bangla.
  const tx = (en, bn) => (cfg?.lang === "bn" && bn ? bn : en);

  // Abortable sleep: wakes early when STOP is pressed.
  async function sleep(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end && !aborted) {
      await new Promise((r) => setTimeout(r, Math.min(250, Math.max(1, end - Date.now()))));
    }
  }

  // ---------- page styles for highlights ----------
  function injectStyles() {
    if (document.getElementById("ab-styles")) return;
    const st = document.createElement("style");
    st.id = "ab-styles";
    st.textContent = `
      .ab-pulse { outline: 4px solid #ffd166 !important; outline-offset: 3px; animation: abPulse 1s infinite; }
      @keyframes abPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(255,209,102,.9); } 50% { box-shadow: 0 0 0 12px rgba(255,209,102,0); } }
      .ab-hot { border: 2px solid #0b63ff !important; animation: abHot 1.4s ease-in-out infinite; }
      @keyframes abHot { 0%,100% { box-shadow: 0 0 0 0 rgba(11,99,255,.65), 0 8px 28px rgba(0,0,0,.5); } 50% { box-shadow: 0 0 0 9px rgba(11,99,255,0), 0 8px 28px rgba(0,0,0,.5); } }
      .ab-hot #ab-stage { font-size: 18px !important; }
      .ab-hot #ab-sub { font: 600 13.5px/1.45 system-ui, sans-serif !important; }
      .ab-chip { display: inline-block; margin: 6px 6px 0 0; padding: 5px 12px; border-radius: 999px; border: none;
        background: #0b63ff; color: #fff; font: 800 15px/1.2 system-ui, sans-serif; cursor: pointer;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.35), 0 2px 8px rgba(11,99,255,.5); }
      .ab-chip-coach { background: #1c3a2b; color: #d8ffe9; cursor: default; box-shadow: none; border: 1px solid #2e6b50; font-size: 14px; }
      .ab-flash { animation: abFlash .4s ease-in-out 3 !important; }
      @keyframes abFlash { 50% { transform: scale(1.25); } }
      .ab-suggest { outline: 4px solid #0b63ff !important; outline-offset: 3px; animation: abSeat 1.1s ease-in-out infinite; }
      @keyframes abSeat { 0%,100% { box-shadow: 0 0 0 3px rgba(11,99,255,.35), 0 0 14px 4px rgba(11,99,255,.85); } 50% { box-shadow: 0 0 0 7px rgba(11,99,255,.15), 0 0 22px 8px rgba(11,99,255,.55); } }
    `;
    document.documentElement.appendChild(st);
  }

  // ---------- tiny UI overlay ----------
  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;z-index:2147483647;right:12px;bottom:12px;width:340px;max-height:50vh;" +
      "background:#0b1f17;color:#d8ffe9;font:12px/1.5 monospace;border:1px solid #1f6f4e;" +
      "border-radius:10px;padding:10px 12px;box-shadow:0 6px 24px rgba(0,0,0,.45);overflow:auto;";
    overlay.innerHTML =
      `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
         <b style="color:#6fe3a5">🚆 Ticket Alarm</b>
         <span>
           <button id="ab-stop" style="background:#c0392b;border:none;color:#fff;cursor:pointer;border-radius:5px;padding:2px 8px;font-weight:700">■ STOP</button>
           <button id="ab-hide" style="background:none;border:none;color:#9adbb8;cursor:pointer">—</button>
           <button id="ab-close" style="background:none;border:none;color:#9adbb8;cursor:pointer">✕</button>
         </span>
       </div>
       <div id="ab-stage" style="font:700 14px/1.4 system-ui,sans-serif;margin:2px 0"></div>
       <div id="ab-sub" style="color:#9adbb8;margin:2px 0 4px;white-space:pre-wrap"></div>
       <div id="ab-chips" style="margin:0 0 6px"></div>
       <a id="ab-details" style="color:#7fae95;cursor:pointer;text-decoration:underline;font-size:11px"></a>
       <div id="ab-log" style="display:none;margin-top:4px"></div>`;
    document.documentElement.appendChild(overlay);
    window.addEventListener("resize", placeOverlay);
    logBox = overlay.querySelector("#ab-log");
    const details = overlay.querySelector("#ab-details");
    details.textContent = tx("details ▾", "বিস্তারিত ▾");
    details.onclick = () => {
      const open = logBox.style.display !== "none";
      logBox.style.display = open ? "none" : "";
      details.textContent = open ? tx("details ▾", "বিস্তারিত ▾") : tx("hide details ▴", "বিস্তারিত লুকান ▴");
    };
    overlay.querySelector("#ab-stop").onclick = () => {
      aborted = true;
      sirenOff();
      setStage("stopped");
      err(tx("■ STOP pressed — aborting run.", "■ STOP — থামানো হচ্ছে।"));
    };
    overlay.querySelector("#ab-close").onclick = () => { aborted = true; sirenOff(); overlay.remove(); };
    overlay.querySelector("#ab-hide").onclick = () => {
      for (const id of ["ab-stage", "ab-sub", "ab-chips", "ab-details", "ab-log"]) {
        const el = overlay.querySelector("#" + id);
        if (el) el.style.visibility = el.style.visibility === "hidden" ? "" : "hidden";
      }
    };
  }

  // Big plain-language status line.
  function setStage(stage) {
    ensureOverlay();
    const map = {
      wait: [tx("⏳ Waiting for release time…", "⏳ টিকিট ছাড়ার সময়ের অপেক্ষায়…"), "#ffd166"],
      search: [tx("🔎 Searching for your train…", "🔎 ট্রেন খোঁজা হচ্ছে…"), "#9adbb8"],
      found: [tx("✅ SEATS OPEN — click BOOK NOW!", "✅ সিট খুলেছে — BOOK NOW চাপুন!"), "#6fe3a5"],
      seatmap: [tx("🪑 Pick the seats ringed in blue", "🪑 নীল দাগের সিটগুলো বাছুন"), "#6fe3a5"],
      coachfull: [tx("⛔ No free seat in this coach", "⛔ এই বগিতে খালি সিট নেই"), "#ffd166"],
      fail: [tx("❌ Did not succeed — open details", "❌ হয়নি — বিস্তারিত দেখুন"), "#ff6b6b"],
      stopped: [tx("■ Stopped", "■ থামানো হয়েছে"), "#ff6b6b"],
    };
    const [text, color] = map[stage] || [stage, "#9adbb8"];
    const el = overlay.querySelector("#ab-stage");
    el.textContent = text;
    el.style.color = color;
    if (stage !== "seatmap" && stage !== "coachfull") showChips([]);
  }

  function setSub(text, color = "#d8ffe9") {
    const sub = overlay.querySelector("#ab-sub");
    sub.textContent = text;
    sub.style.color = color;
  }

  // Seat chips scroll to the seat and make it bounce; selecting it stays the
  // user's click. Coach chips are labels only.
  function showChips(items) {
    const box = overlay.querySelector("#ab-chips");
    box.innerHTML = "";
    for (const it of items) {
      const c = document.createElement(it.el ? "button" : "span");
      c.className = it.el ? "ab-chip" : "ab-chip ab-chip-coach";
      c.textContent = it.label;
      if (it.el) {
        c.title = tx("Show this seat", "সিটটি দেখান");
        c.onclick = () => {
          it.el.scrollIntoView({ behavior: "smooth", block: "center" });
          it.el.classList.remove("ab-flash");
          void it.el.offsetWidth;
          it.el.classList.add("ab-flash");
        };
      }
      box.appendChild(c);
    }
  }

  // Dock beside what the user is working on (the seat map or the train card)
  // when there's room to its left; otherwise keep the bottom-right corner so
  // the box never covers the seats.
  let dockAnchor = null;
  function placeOverlay() {
    if (!overlay) return;
    const W = 300;
    const r = dockAnchor?.isConnected ? dockAnchor.getBoundingClientRect() : null;
    const st = overlay.style;
    if (r && r.width && r.left >= W + 28) {
      Object.assign(st, { width: W + "px", left: Math.max(12, r.left - W - 20) + "px", top: "50%",
        transform: "translateY(-50%)", right: "auto", bottom: "auto", maxHeight: "75vh" });
    } else {
      Object.assign(st, { width: "340px", left: "auto", top: "auto", transform: "none",
        right: "12px", bottom: "12px", maxHeight: "50vh" });
    }
  }

  function setHot(on) {
    overlay?.classList.toggle("ab-hot", on);
  }

  // Remember how each run ended, for the popup's "Recent runs" list.
  async function recordRun(outcome, detail) {
    try {
      const { runHistory } = await chrome.storage.local.get("runHistory");
      const list = runHistory || [];
      list.unshift({
        at: Date.now(),
        doj: mission?.doj,
        train: (cfg?.trainQuery || "any").replace(/\s*EXPRESS.*\(/, " ("),
        outcome,
        detail: detail || "",
      });
      await chrome.storage.local.set({ runHistory: list.slice(0, 10) });
    } catch (_) {}
  }

  function log(msg, color) {
    ensureOverlay();
    const t = new Date().toISOString().slice(11, 23);
    const line = document.createElement("div");
    if (color) line.style.color = color;
    line.textContent = `[${t}] ${msg}`;
    logBox.appendChild(line);
    logBox.scrollTop = logBox.scrollHeight;
    const sub = overlay.querySelector("#ab-sub");
    if (sub) { sub.textContent = msg; sub.style.color = color || "#9adbb8"; }
    console.log("[autobook]", msg);
  }
  const ok = (m) => log(m, "#6fe3a5");
  const warn = (m) => log(m, "#ffd166");
  const err = (m) => log(m, "#ff6b6b");

  function notify(title, message) {
    chrome.runtime.sendMessage({ type: "notify", title, message }).catch(() => {});
  }

  // The alarm plays from the extension's own audio page: a page the user
  // hasn't clicked is not allowed to make sound by itself.
  function sirenOn() {
    chrome.runtime.sendMessage({ type: "siren", on: true }).catch(() => {});
    const stop = () => sirenOff();
    document.addEventListener("click", stop, { once: true });
    document.addEventListener("keydown", stop, { once: true });
  }
  function sirenOff() {
    chrome.runtime.sendMessage({ type: "siren", on: false }).catch(() => {});
  }

  // ---------- auth / http ----------
  function authHeaders() {
    const token = localStorage.getItem("token");
    if (!token) return null;
    const h = {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Authorization: "Bearer " + token.replace(/^"|"$/g, ""),
    };
    const did = localStorage.getItem("uudid");
    const dk = localStorage.getItem("ssdk");
    if (did) h["X-Device-Id"] = did.replace(/^"|"$/g, "");
    if (dk) h["X-Device-Key"] = dk.replace(/^"|"$/g, "");
    return h;
  }

  async function api(method, path, { params, body } = {}) {
    const h = authHeaders();
    if (!h) throw new Error("NOT_LOGGED_IN");
    let url = API + path;
    if (params) url += "?" + new URLSearchParams(params).toString();
    const res = await fetch(url, {
      method,
      headers: h,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "omit",
    });
    let json = null;
    try { json = await res.json(); } catch (_) {}
    return { status: res.status, json };
  }

  // ---------- server clock sync ----------
  async function serverOffsetMs() {
    // Estimate (serverTime - localTime) from the Date response header of a
    // cheap same-origin asset. Accuracy ~ ±0.5s which is plenty: the poll
    // loop tolerates starting slightly early or late.
    try {
      const t0 = Date.now();
      const res = await fetch("/assets/i18n/common/en.json?cb=" + t0, { cache: "no-store" });
      const t1 = Date.now();
      const dateHdr = res.headers.get("date");
      if (!dateHdr) return 0;
      const server = new Date(dateHdr).getTime() + 500; // header truncates ms
      return server - (t0 + (t1 - t0) / 2);
    } catch (_) {
      return 0;
    }
  }

  // ---------- train / class matching ----------
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

  function matchTrain(trains, query) {
    if (!Array.isArray(trains)) return null;
    // Normalize so "COX'S BAZAR EXPRESS" matches "COXS BAZAR EXPRESS", etc.
    const q = norm(query || "");
    for (const t of trains) {
      const name = norm(t.trip_number || t.train_name || "");
      if (!q || name.includes(q)) return t;
    }
    return null;
  }

  function seatTypeAvail(st) {
    // No counts field at all → unknown; be optimistic and let the page decide.
    if (!st.seat_counts || typeof st.seat_counts !== "object") return 1;
    return Number(st.seat_counts.online ?? st.seat_counts.available ?? 0);
  }

  function classCountsLine(train) {
    return (train.seat_types || [])
      .map((st) => `${st.type}:${st.seat_counts ? (st.seat_counts.online ?? st.seat_counts.available ?? "?") : "?"}`)
      .join(" · ");
  }

  function pickSeatType(train, classPriority) {
    const types = train.seat_types || [];
    const prio = classPriority.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
    for (const cls of prio) {
      const st = types.find((s) => String(s.type || "").toUpperCase() === cls && seatTypeAvail(s) > 0);
      if (st) return st;
    }
    // fallback: any class with seats, in site order
    return types.find((s) => seatTypeAvail(s) > 0) || null;
  }

  // Seat strategy, in order:
  //   1. Exact seats the user asked for (if free).
  //   2. User's preferred coaches, in their order.
  //   3. Otherwise the coach with the MOST free seats.
  //   Inside a coach: seats in the MIDDLE portion first (away from doors/wheels).
  //   For 2+ tickets: a side-by-side block as close to the middle as possible.
  function scoreAndPick(seats, count, preferredCoaches, preferredSeats) {
    const coachPrio = preferredCoaches.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
    const favSeats = preferredSeats.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
    const avail = seats.filter((s) => Number(s.seat_availability) === 1);

    const coachOf = (s) => String(s.seat_number).split("-")[0].toUpperCase();
    const numOf = (s) => parseInt(String(s.seat_number).split("-").pop(), 10) || 0;

    const byCoach = {};
    for (const s of avail) (byCoach[coachOf(s)] ||= []).push(s);
    const mid = {};
    for (const [c, list] of Object.entries(byCoach)) {
      const nums = list.map(numOf);
      mid[c] = (Math.min(...nums) + Math.max(...nums)) / 2;
    }

    const coaches = Object.keys(byCoach).sort((a, b) => {
      const pa = coachPrio.indexOf(a), pb = coachPrio.indexOf(b);
      if (pa >= 0 || pb >= 0) return (pa < 0 ? 1e9 : pa) - (pb < 0 ? 1e9 : pb);
      return byCoach[b].length - byCoach[a].length;
    });

    const favAvail = favSeats
      .map((f) => avail.find((s) => String(s.seat_number).toUpperCase() === f))
      .filter(Boolean);

    const ordered = [...favAvail];
    for (const c of coaches) {
      const list = byCoach[c].slice().sort(
        (a, b) => Math.abs(numOf(a) - mid[c]) - Math.abs(numOf(b) - mid[c]) || numOf(a) - numOf(b)
      );
      for (const s of list) if (!ordered.includes(s)) ordered.push(s);
    }

    if (count > 1 && favAvail.length === 0) {
      for (const c of coaches) {
        const list = byCoach[c].slice().sort((a, b) => numOf(a) - numOf(b));
        let best = null, bestDist = Infinity;
        for (let i = 0; i + count <= list.length; i++) {
          if (numOf(list[i + count - 1]) - numOf(list[i]) === count - 1) {
            const center = (numOf(list[i]) + numOf(list[i + count - 1])) / 2;
            const d = Math.abs(center - mid[c]);
            if (d < bestDist) { bestDist = d; best = list.slice(i, i + count); }
          }
        }
        if (best) return { picked: best, backups: ordered.filter((s) => !best.includes(s)) };
      }
    }
    return { picked: ordered.slice(0, count), backups: ordered.slice(count) };
  }

  // ---------- handoff: point at BOOK NOW, then suggest seats ----------
  // Finds the train's card on the site's own results page and makes its
  // BOOK NOW button pulse. It never clicks it — that's the user's step.
  async function highlightTrainCard(found) {
    injectStyles();
    const want = norm(found.train);
    for (let i = 0; i < 100; i++) { // up to ~30s for the page to render its results
      const h2 = [...document.querySelectorAll("h2")].find((h) => norm(h.textContent).includes(want));
      if (h2) {
        let card = h2;
        while (card && !card.querySelector?.(".single-seat-class")) card = card.parentElement;
        if (card) {
          const boxes = [...card.querySelectorAll(".single-seat-class")];
          const box =
            boxes.find((b) => norm(b.querySelector(".seat-class-name")?.textContent) === norm(found.cls)) ||
            boxes.find((b) => !b.classList.contains("no-seat-available-wrap"));
          const btn = box?.querySelector(".book-now-btn");
          if (btn) {
            btn.classList.add("ab-pulse");
            dockAnchor = card;
            setHot(true);
            placeOverlay();
            box.scrollIntoView({ behavior: "smooth", block: "center" });
            btn.addEventListener("click", () => btn.classList.remove("ab-pulse"), { once: true });
            return true;
          }
        }
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    return false;
  }

  // Outlines the best free seats in the seat map the user opened.
  let lastSuggestion = "";
  function seatMapBox(btns) {
    let el = btns[0].parentElement;
    while (el && !btns.every((b) => el.contains(b))) el = el.parentElement;
    return el;
  }

  function suggestSeats() {
    const BAD = /booked|hidden|selected|progress|blocked|disable|reserved/i;
    const btns = [...document.querySelectorAll("button.btn-seat")]
      .filter((b) => /^[A-Z]{1,5}-\d{1,3}$/.test((b.textContent || "").trim()));
    if (btns.length === 0) return;
    injectStyles();
    ensureOverlay();
    for (const b of document.querySelectorAll(".ab-suggest")) b.classList.remove("ab-suggest");

    const seats = btns.map((b) => ({
      seat_number: b.textContent.trim(),
      seat_availability: !BAD.test(b.className) && !b.disabled ? 1 : 0,
      el: b,
    }));
    const { picked } = scoreAndPick(
      seats, Number(cfg.seatCount) || 1, cfg.preferredCoaches || "", cfg.preferredSeats || ""
    );
    for (const s of picked) s.el.classList.add("ab-suggest");

    // Coaches from the "Select Coach" dropdown ("JHA - 15 Seat(s)"). The
    // site's count also includes seats someone else is paying for.
    let coaches = [], current = "";
    const sel = [...document.querySelectorAll("select")].find((x) =>
      [...x.options].some((o) => /^[A-Z]{1,5}\s*-\s*\d+\s*Seat/i.test(o.textContent.trim())));
    if (sel) {
      coaches = [...sel.options]
        .map((o) => o.textContent.trim().match(/^([A-Z]{1,5})\s*-\s*(\d+)/i))
        .filter(Boolean)
        .map((m) => ({ name: m[1].toUpperCase(), free: +m[2] }))
        .filter((c) => c.free > 0);
      current = (sel.selectedOptions[0]?.textContent.trim().match(/^([A-Z]{1,5})/i) || [])[1]?.toUpperCase() || "";
    }
    const prio = (cfg.preferredCoaches || "").split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
    const others = coaches.filter((c) => c.name !== current).sort((a, b) => b.free - a.free);
    const best = others.find((c) => prio.includes(c.name)) || others[0];

    dockAnchor = seatMapBox(btns);
    setHot(true);
    placeOverlay();

    const signature = picked.map((s) => s.seat_number).join(",") + "|" + current + "|" + others.map((c) => c.name + c.free).join(",");
    if (signature === lastSuggestion) return;
    lastSuggestion = signature;

    if (picked.length) {
      const names = picked.map((s) => s.seat_number).join(", ");
      ok(tx(`Suggested: ${names}`, `পরামর্শ: ${names}`));
      setStage("seatmap");
      let text = tx("Click these seats on the map, then CONTINUE PURCHASE:", "ম্যাপে এই সিটগুলো চাপুন, তারপর CONTINUE PURCHASE:");
      if (best && best.free > picked.length * 3 && !prio.includes(current)) {
        text += tx(`\n👉 Emptier coach: ${best.name} (${best.free} free)`, `\n👉 বেশি খালি বগি: ${best.name} (${best.free}টি খালি)`);
      }
      setSub(text);
      showChips(picked.map((s) => ({ label: s.seat_number, el: s.el })));
    } else if (others.length) {
      warn(tx(`No free seat in ${current || "this coach"}.`, `${current || "এই বগি"}-তে খালি সিট নেই।`));
      setStage("coachfull");
      setSub(tx(`Pick one of these in "Select Coach" (counts may include seats being paid for):`,
                `"Select Coach" থেকে এগুলোর একটি বাছুন (সংখ্যায় পেমেন্ট চলা সিটও থাকতে পারে):`), "#ffd166");
      showChips(others.slice(0, 6).map((c) => ({ label: `${c.name} · ${c.free}` })));
    } else {
      warn(tx("No free seats in any coach of this class.", "এই ক্লাসের কোনো বগিতে খালি সিট নেই।"));
      setStage("coachfull");
      setSub(tx("Every coach in this class is taken or being paid for. Green “In Progress” seats can come back if a payment fails — keep this page open and watch, or try another class.",
                "এই ক্লাসের সব সিট বিক্রি হয়েছে বা পেমেন্ট চলছে। সবুজ \"In Progress\" সিট পেমেন্ট ব্যর্থ হলে আবার খালি হতে পারে — পেজটা খোলা রেখে দেখুন, অথবা অন্য ক্লাস চেষ্টা করুন।"), "#ffd166");
      showChips([]);
    }
  }

  function watchSeatMap() {
    let timer = null;
    const obs = new MutationObserver((mutations) => {
      // Our own overlay log lines must not re-trigger this.
      if (mutations.every((m) => overlay && overlay.contains(m.target))) return;
      clearTimeout(timer);
      timer = setTimeout(suggestSeats, 200);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), ASSIST_TTL_MS);
    suggestSeats();
  }

  // ---------- main engine ----------
  async function runEngine() {
    if (engineStarted) return;
    engineStarted = true;
    ensureOverlay();

    if (!authHeaders()) {
      setStage("fail");
      recordRun("not_logged_in");
      err(tx("Not logged in! Log in to eticket.railway.gov.bd first, then re-arm.",
             "লগইন নেই! আগে eticket.railway.gov.bd-এ লগইন করুন, তারপর আবার ARM করুন।"));
      notify(tx("Ticket Alarm: NOT LOGGED IN", "টিকিট অ্যালার্ম: লগইন নেই"),
             tx("Log in to eticket.railway.gov.bd and re-arm.", "eticket.railway.gov.bd-এ লগইন করে আবার ARM করুন।"));
      sirenOn();
      return;
    }

    const doj = mission.doj;
    ok(`mission: ${cfg.fromCity} → ${cfg.toCity} on ${doj}`);
    ok(`train: "${cfg.trainQuery || "(first with seats)"}" class: ${cfg.classPriority}`);

    // When can this journey date go on sale at the earliest? The opening day
    // is D - 10; on ordinary days the date can appear from 12 AM, so
    // anything before that midnight is certainly too early.
    let releaseAt = null;
    try {
      const M = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
      const [dd, mon, yyyy] = doj.split("-");
      releaseAt = new Date(+yyyy, M[mon], +dd - 10, 0, 0, 0);
      if (releaseAt.getTime() > Date.now())
        warn(`${doj} can open from ${releaseAt.toLocaleString()} at the earliest.`);
      if (releaseAt.getTime() > mission.runAt + (cfg.maxWaitMinutes || 5) * 60_000) {
        setStage("fail");
        recordRun("too_early");
        err(tx("⛔ Release is AFTER this run's window — polling now is pointless and gets you rate-limited. Aborting. Re-ARM: it will fire at the release time.",
               "⛔ এই তারিখের টিকিট এখনো ছাড়েনি — এখন খোঁজা অর্থহীন, উল্টো ব্লক খাওয়ার ঝুঁকি। বন্ধ করা হলো। ARM করুন — ছাড়ার সময়ে নিজেই চলবে।"));
        notify(tx("Ticket Alarm stopped", "টিকিট অ্যালার্ম বন্ধ হয়েছে"),
               tx(`${doj} releases ${releaseAt.toLocaleString()}. Re-ARM for that time.`,
                  `${doj}-এর টিকিট ছাড়বে ${releaseAt.toLocaleString("bn-BD")}। ARM করে রাখুন।`));
        return;
      }
    } catch (_) {}

    // Wait for the exact trigger instant, corrected by server clock offset.
    const offset = await serverOffsetMs();
    log(`server clock offset: ${Math.round(offset)}ms`);
    const startAt = mission.runAt - offset - (cfg.startLeadMs || 500);
    const waitMs = startAt - Date.now();
    if (waitMs > 0) {
      setStage("wait");
      log(`waiting ${(waitMs / 1000).toFixed(1)}s until go-time… (■ STOP any time)`);
      await sleep(waitMs);
    }
    if (aborted) return;

    const deadline = Date.now() + (cfg.maxWaitMinutes || 5) * 60_000;
    const searchParams = {
      from_city: cfg.fromCity,
      to_city: cfg.toCity,
      date_of_journey: doj,
      seat_class: (cfg.classPriority.split(",")[0] || "S_CHAIR").trim(),
    };

    let train = null, seatType = null, attempt = 0, consecutive429 = 0;
    setStage("search");
    ok(tx("GO — polling for trains…", "শুরু — ট্রেন খোঁজা হচ্ছে…"));
    while (Date.now() < deadline && !aborted) {
      attempt++;
      try {
        const { status, json } = await api("GET", "/bookings/search-trips-v2", { params: searchParams });
        if (status === 200) {
          const trains = json?.data?.trains || json?.data || [];
          const n = Array.isArray(trains) ? trains.length : 0;
          const t = matchTrain(trains, cfg.trainQuery);
          if (t) {
            const st = pickSeatType(t, cfg.classPriority);
            if (st) { train = t; seatType = st; break; }
            if (attempt % 10 === 1) {
              const tn = t.trip_number || t.train_name || "?";
              warn(tx(`${tn}: no ONLINE seats yet — ${classCountsLine(t)}`,
                      `${tn}: অনলাইনে সিট নেই — ${classCountsLine(t)}`));
              warn(tx(`(the site's number is Counter+Online; counter-quota seats can't be booked online)`,
                      `(সাইটের সংখ্যাটি কাউন্টার+অনলাইন মিলিয়ে; কাউন্টারের সিট অনলাইনে কেনা যায় না)`));
            }
          } else if (attempt % 10 === 1) {
            if (n === 0) {
              const relNote = releaseAt && releaseAt.getTime() > Date.now()
                ? ` — ${doj} not on sale until ${releaseAt.toLocaleString()}`
                : ` — ${doj} not open yet, still polling`;
              warn(`no trains listed${relNote}`);
            } else {
              const names = trains.slice(0, 5).map((x) => x.trip_number || x.train_name).join(", ");
              warn(`${n} trains listed but none match "${cfg.trainQuery}" (${names}${n > 5 ? ", …" : ""})`);
            }
          }
        } else if (status === 401) {
          setStage("fail");
          recordRun("expired");
          err("Session expired (401). Log in again!");
          notify("Ticket Alarm: session expired", "Log in to eticket.railway.gov.bd again.");
          sirenOn();
          return;
        } else if (status === 429) {
          consecutive429++;
          const backoff = Math.min(15_000, 2000 * 2 ** (consecutive429 - 1));
          const bs = (backoff / 1000).toFixed(0);
          warn(tx(`rate-limited (429) — backing off ${bs}s`,
                  `সার্ভার বলছে খুব ঘন ঘন রিকোয়েস্ট (429) — ${bs} সেকেন্ড অপেক্ষা`));
          await sleep(backoff);
          continue;
        } else if (attempt % 10 === 1) {
          warn(`search ${status}: ${json?.error?.messages?.[0] || json?.message || "not open yet?"}`);
        }
        if (status === 200) consecutive429 = 0;
      } catch (e) {
        if (attempt % 10 === 1) warn("search error: " + e.message);
      }
      await sleep((cfg.pollIntervalMs || 700) + Math.random() * 250);
    }

    if (aborted) {
      setStage("stopped");
      recordRun("stopped");
      err(tx("Run stopped.", "থামানো হয়েছে।"));
      return;
    }
    if (!train) {
      setStage("fail");
      recordRun("no_train");
      err(tx("Gave up: no matching train/seats within the time window.",
             "সময়ের মধ্যে ট্রেন বা সিট পাওয়া যায়নি। বাদ দেওয়া হলো।"));
      if (mission.nextAt) {
        const at = new Date(mission.nextAt);
        warn(tx(`Not open at this check. Still armed: checks again at ${at.toLocaleString()}.`,
                `এই সময়ে খোলেনি। ARM চালু আছে: আবার দেখবে ${at.toLocaleString("bn-BD")}-এ।`));
        notify(tx("Ticket Alarm: not open yet", "টিকিট অ্যালার্ম: এখনো খোলেনি"),
               tx(`Checks again at ${at.toLocaleString()} — leave the computer on.`,
                  `আবার দেখবে ${at.toLocaleString("bn-BD")}-এ — কম্পিউটার চালু রাখুন।`));
      } else {
        notify(tx("Ticket Alarm: no seats", "টিকিট অ্যালার্ম: সিট নেই"),
               tx("No matching train or online seats found in time.", "সময়মতো ট্রেন বা অনলাইন সিট পাওয়া যায়নি।"));
      }
      return;
    }

    // Seats are open: hand over to the user on the site's own page.
    const tn = String(train.trip_number || train.train_name || "");
    const online = seatType.seat_counts?.online ?? seatType.seat_counts?.available ?? "?";
    setStage("found");
    ok(`${tn} | ${seatType.type} | online seats: ${online}`);
    recordRun("found", `${seatType.type} · ${online}`);
    notify(
      tx(`🚆 SEATS OPEN: ${tn}`, `🚆 সিট খুলেছে: ${tn}`),
      tx(`${seatType.type}: ${online} online seats. Click the glowing BOOK NOW in the tab!`,
         `${seatType.type}: ${online}টি অনলাইন সিট। ট্যাবে জ্বলতে থাকা BOOK NOW চাপুন!`)
    );
    await chrome.storage.local.set({
      assistFound: { at: Date.now(), train: tn, cls: seatType.type, online },
    });
    chrome.runtime.sendMessage({ type: "found", scheduled: !!mission.scheduled }).catch(() => {});
    location.href =
      "https://eticket.railway.gov.bd/booking/train/search?" +
      new URLSearchParams({ fromcity: cfg.fromCity, tocity: cfg.toCity, doj, class: seatType.type }).toString();
  }

  // After the reload: glow BOOK NOW, ring, then suggest seats in the seat map.
  async function runHandoff(found) {
    ensureOverlay();
    setStage("found");
    ok(tx(`${found.train} · ${found.cls}: ${found.online} online seats.`,
          `${found.train} · ${found.cls}: ${found.online}টি অনলাইন সিট।`));
    ok(tx("Click the glowing BOOK NOW → pick the outlined seats → CONTINUE PURCHASE → OTP → pay. (Click anywhere to stop the alarm.)",
          "জ্বলতে থাকা BOOK NOW চাপুন → দাগানো সিট বাছুন → CONTINUE PURCHASE → OTP → পেমেন্ট। (অ্যালার্ম থামাতে যেকোনো জায়গায় ক্লিক করুন।)"));
    sirenOn();
    const shown = await highlightTrainCard(found);
    if (!shown) warn(tx("Couldn't find the train card on the page — scroll to it yourself.",
                        "পেজে ট্রেনটি খুঁজে পাওয়া যায়নি — নিজে স্ক্রল করে দেখুন।"));
    watchSeatMap();
  }

  // ---------- train list for the popup dropdown ----------
  // Trains have a weekly day off, so one date's list can miss a train.
  // Merge two dates (consecutive entries in `dates` fall on different
  // weekdays) and remember the weekdays each train was absent.
  async function listTrains(from, to, dates) {
    if (!authHeaders()) return { ok: false, error: "NOT_LOGGED_IN" };
    const M = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
    const weekday = (doj) => { const [d, m, y] = doj.split("-"); return new Date(+y, M[m], +d).getDay(); };
    const timePart = (v) => String(v || "").split(",").pop().trim();
    let lastErr = "no trains found on any date tried";
    const byName = new Map();
    const seenDays = [];
    let firstDoj = null;
    for (const doj of dates) {
      if (seenDays.length >= 2) break;
      if (seenDays.length) await sleep(900);
      try {
        const { status, json } = await api("GET", "/bookings/search-trips-v2", {
          params: { from_city: from, to_city: to, date_of_journey: doj, seat_class: "S_CHAIR" },
        });
        if (status === 401) return { ok: false, error: "NOT_LOGGED_IN" };
        if (status !== 200) {
          lastErr = json?.error?.messages?.[0] || json?.message || `HTTP ${status}`;
          continue;
        }
        const raw = json?.data?.trains || json?.data || [];
        if (!Array.isArray(raw) || raw.length === 0) continue;
        const wd = weekday(doj);
        seenDays.push(wd);
        firstDoj = firstDoj || doj;
        for (const t of raw) {
          const name = String(t.trip_number || t.train_name || "");
          if (!name || byName.has(name)) { if (byName.has(name)) byName.get(name).runsOn.push(wd); continue; }
          byName.set(name, {
            name,
            departure: timePart(t.departure_date_time || t.departure_time),
            arrival: timePart(t.arrival_date_time || t.arrival_time),
            duration: String(t.travel_time || ""),
            classes: (t.seat_types || []).map((x) => x.type).filter(Boolean),
            runsOn: [wd],
          });
        }
      } catch (e) {
        lastErr = e.message;
      }
    }
    if (!byName.size) return { ok: false, error: lastErr };
    const trains = [...byName.values()].map(({ runsOn, ...t }) => ({
      ...t,
      offDays: seenDays.filter((d) => !runsOn.includes(d)),
    }));
    trains.sort((a, b) => toMinutes(a.departure) - toMinutes(b.departure));
    return { ok: true, doj: firstDoj, trains };
  }

  function toMinutes(hhmm) {
    const m = String(hhmm).match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    if (!m) return 9999;
    let h = +m[1] % 12;
    if (m[3] && m[3].toLowerCase() === "pm") h += 12;
    if (!m[3]) h = +m[1];
    return h * 60 + +m[2];
  }


  // ---------- bootstrap ----------
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "listTrains") {
      listTrains(msg.from, msg.to, msg.dates || []).then(sendResponse);
      return true;
    }
    if (msg.type === "authStatus") {
      let user = null;
      try {
        const u = JSON.parse(localStorage.getItem("user") || "null");
        user = u?.display_name || u?.name || u?.phone_number || u?.mobile || null;
      } catch (_) {}
      sendResponse({ ok: true, loggedIn: !!localStorage.getItem("token"), user });
    }
    if (msg.type === "checkSeats") {
      (async () => {
        if (!authHeaders()) return sendResponse({ ok: false, error: "NOT_LOGGED_IN" });
        try {
          const { status, json } = await api("GET", "/bookings/search-trips-v2", {
            params: { from_city: msg.from, to_city: msg.to, date_of_journey: msg.doj, seat_class: "S_CHAIR" },
          });
          if (status !== 200) {
            return sendResponse({ ok: false, error: json?.error?.messages?.[0] || "HTTP " + status });
          }
          const raw = json?.data?.trains || [];
          if (!Array.isArray(raw) || raw.length === 0) return sendResponse({ ok: false, error: "NOT_FOUND" });
          const wanted = matchTrain(raw, msg.trainQuery || "");
          const list = (msg.trainQuery && wanted ? [wanted] : raw).slice(0, 8).map((x) => ({
            name: String(x.trip_number || x.train_name || "?"),
            counts: (x.seat_types || []).map((st) => ({
              type: st.type,
              online: st.seat_counts ? (st.seat_counts.online ?? st.seat_counts.available ?? "?") : "?",
            })),
          }));
          sendResponse({ ok: true, trains: list });
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
      })();
      return true;
    }
    if (msg.type === "stopRun") {
      aborted = true;
      sirenOff();
      if (engineStarted) err("■ STOP (from popup) — aborting run.");
      sendResponse({ ok: true, wasRunning: engineStarted });
    }
    if (msg.type === "ping") {
      sendResponse({ ok: true });
    }
  });

  (async () => {
    const stored = await chrome.storage.local.get(["mission", "config", "assistFound"]);
    mission = stored.mission;
    cfg = { ...(stored.config || {}) };
    const d = await chrome.runtime.sendMessage({ type: "getDefaults" }).catch(() => null);
    if (d?.defaults) cfg = { ...d.defaults, ...cfg };

    // Seats just opened and the page reloaded: hand over to the user.
    if (stored.assistFound && Date.now() - stored.assistFound.at < ASSIST_TTL_MS) {
      chrome.storage.local.remove("assistFound");
      runHandoff(stored.assistFound);
      return;
    }

    if (!mission || mission.status !== "launched") return; // nothing armed for this load
    // Only run for a mission that is upcoming or started < 10 min ago.
    if (Date.now() > mission.runAt + 10 * 60_000) return;

    // Claim the mission so a reload doesn't re-run it after completion.
    mission.status = "running";
    await chrome.storage.local.set({ mission });
    runEngine().catch((e) => {
      err("engine crashed: " + e.message);
      notify("Ticket Alarm error", e.message);
    });
  })();
})();
