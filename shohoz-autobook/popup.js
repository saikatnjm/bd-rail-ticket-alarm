const FIELDS = [
  "fromCity", "toCity", "trainQuery", "classPriority", "seatCount", "journeyDate",
  "triggerTime", "preferredCoaches", "preferredSeats", "pollIntervalMs",
  "maxWaitMinutes",
];
const PRESET_FIELDS = [
  "fromCity", "toCity", "trainQuery", "classPriority", "seatCount",
  "preferredCoaches", "preferredSeats",
];
const SALE_WINDOW_DAYS = 10;   // BD Railway sells up to 10 days ahead
const MAX_PLAN_DAYS = 30;      // how far ahead the calendar lets you plan

const $ = (id) => document.getElementById(id);
const statusBox = $("status");
function setStatus(msg) { statusBox.textContent = msg; }

// ---------- i18n ----------
let LANG = "en";
function t(key, vars = {}) {
  let s = I18N[LANG]?.[key] ?? I18N.en[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

function applyLang() {
  $("langToggle").textContent = LANG === "en" ? "বাং" : "EN";
  for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll("[data-i18n-ph]")) el.placeholder = t(el.dataset.i18nPh);
  const auto = $("triggerTime").querySelector('option[value="auto"]');
  if (auto) auto.textContent = t("autoOpt");
  if (routeTrains.length) fillTrainSelect(routeTrains, null);
  renderCal();
  refreshFlow();
  refreshArmState();
  renderLogin();
  loadPresets($("presetSelect")?.value || "");
  renderHistory();
}

// ---------- date helpers ----------
const day0 = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromIso = (s) => { const [y, m, dd] = s.split("-").map(Number); return new Date(y, m - 1, dd); };
const dojFmt = (d) => `${String(d.getDate()).padStart(2, "0")}-${t("monthsShort")[d.getMonth()]}-${d.getFullYear()}`;

// ---------- static data (stations / trains / classes rarely change) ----------
function fillStaticLists() {
  const st = $("stationsList");
  for (const s of RAIL_DATA.stations) {
    const o = document.createElement("option");
    o.value = s;
    st.appendChild(o);
  }
  const tr = $("allTrainsList");
  for (const tn of RAIL_DATA.trains) {
    const o = document.createElement("option");
    o.value = tn;
    tr.appendChild(o);
  }
  const cl = $("classList");
  for (const c of RAIL_DATA.seatClasses) {
    const o = document.createElement("option");
    o.value = c;
    cl.appendChild(o);
  }
  const sel = $("triggerTime");
  const auto = document.createElement("option");
  auto.value = "auto";
  auto.textContent = t("autoOpt");
  sel.appendChild(auto);
  for (let h = 0; h < 24; h++) {
    const o = document.createElement("option");
    o.value = `${String(h).padStart(2, "0")}:00:00`;
    const ampm = h < 12 ? "AM" : "PM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    o.textContent = `${h12}:00 ${ampm}`;
    sel.appendChild(o);
  }
}

function validStation(v) { return RAIL_DATA.stations.includes((v || "").trim()); }

// ---------- calendar (Shohoz-style) ----------
let calMonth; // first day of displayed month

function renderCal() {
  const cal = $("cal");
  const today = day0(new Date());
  const minD = today;
  const maxD = addDays(today, MAX_PLAN_DAYS);
  const selected = $("journeyDate").value ? day0(fromIso($("journeyDate").value)) : null;
  if (!calMonth) calMonth = selected
    ? new Date(selected.getFullYear(), selected.getMonth(), 1)
    : new Date(today.getFullYear(), today.getMonth(), 1);

  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  let html = `<div class="cal-head">
      <button id="cal-prev">‹</button>
      <span>${t("months")[m]} ${y}</span>
      <button id="cal-next">›</button>
    </div><div class="cal-grid">`;
  for (const dow of t("dows")) html += `<span class="cal-dow">${dow}</span>`;
  for (let i = 0; i < firstDow; i++) html += `<span></span>`;
  for (let dd = 1; dd <= daysInMonth; dd++) {
    const d = new Date(y, m, dd);
    const out = d < minD || d > maxD;
    const cls = ["cal-day"];
    if (selected && d.getTime() === selected.getTime()) cls.push("sel");
    if (d.getTime() === today.getTime()) cls.push("today");
    html += `<button class="${cls.join(" ")}" data-d="${iso(d)}" ${out ? "disabled" : ""}>${dd}</button>`;
  }
  html += `</div>`;
  cal.innerHTML = html;

  $("cal-prev").onclick = () => { calMonth = new Date(y, m - 1, 1); renderCal(); };
  $("cal-next").onclick = () => { calMonth = new Date(y, m + 1, 1); renderCal(); };
  for (const btn of cal.querySelectorAll(".cal-day[data-d]:not(:disabled)")) {
    btn.onclick = () => {
      $("journeyDate").value = btn.dataset.d;
      manualOpen[2] = false; // picking a date folds the calendar away
      saveConfig();
      renderCal();
      refreshFlow();
    };
  }
}

// ---------- release time: resolved automatically, never asked ----------
function trainReleaseInfo(trainName) {
  const m = String(trainName).match(/\((\d+)\)/) || String(trainName).trim().match(/^(\d+)$/);
  const num = m ? m[1] : null;
  if (!num || !RAIL_DATA.openingTimes[num]) return null;
  const time = RAIL_DATA.openingTimes[num];
  return { num, time, label: fmtTime12(time), zone: RAIL_DATA.zones[num] || "?" };
}

function fmtTime12(hhmmss) {
  const h = parseInt(hhmmss, 10);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  if (LANG === "bn") {
    const part = h < 4 || h >= 19 ? "রাত" : h < 12 ? "সকাল" : h < 16 ? "দুপুর" : "বিকাল";
    return `${part} ${String(h12).replace(/\d/g, (x) => "০১২৩৪৫৬৭৮৯"[x])}টা`;
  }
  return `${h12}:00 ${h < 12 ? "AM" : "PM"}`;
}

let routeTrains = []; // last loaded/cached train list for the current route

function resolveReleaseTime() {
  const override = $("triggerTime").value;
  if (override && override !== "auto") {
    return { time: override, label: fmtTime12(override), zoneLabel: fmtTime12(override), src: t("srcManual"), manual: true };
  }
  const auto = (time, src) => ({ time, zoneLabel: fmtTime12(time), label: t("twoStage", { t: fmtTime12(time) }), src });
  const info = trainReleaseInfo($("trainQuery").value.trim() || $("trainSelect").value);
  if (info) return auto(info.time, t("srcZone", { zone: info.zone }));
  const times = routeTrains
    .map((x) => trainReleaseInfo(x.name))
    .filter(Boolean)
    .map((i) => i.time);
  if (times.length) return auto(times.sort()[0], t("srcRoute"));
  return auto("08:00:00", t("srcDefault"));
}

// Same rule as the background: the date opens on D - 10, possibly from
// 12 AM, and the zone time is the railway's published release.
function saleState(jdIso, rel) {
  const openDay = addDays(day0(fromIso(jdIso)), -SALE_WINDOW_DAYS);
  const [h, m] = rel.time.split(":").map(Number);
  const zoneAt = new Date(openDay); zoneAt.setHours(h, m, 0, 0);
  const now = Date.now();
  const firstAt = rel.manual ? zoneAt.getTime() : openDay.getTime();
  if (firstAt > now) return { state: "later", openDay };
  if (!rel.manual && zoneAt.getTime() > now) return { state: "today", openDay };
  return { state: "onSale", openDay };
}

// ---------- progressive enable: from/to → date → trains ----------
// Completed steps fold into a one-line summary; tap the header to reopen.
const manualOpen = { 1: false, 2: false, 3: false, 4: false };

function updateFold() {
  const sums = {
    1: `${$("fromCity").value} → ${$("toCity").value}`,
    2: $("journeyDate").value ? dojFmt(fromIso($("journeyDate").value)) : "",
    3: ($("trainQuery").value.trim() || $("trainSelect").value || "").replace(/\s*EXPRESS/i, "") || t("anyTrain"),
    4: `${$("classPriority").value} ×${$("seatCount").value || 1}`,
  };
  for (const i of [1, 2, 3, 4]) {
    const st = $("st" + i);
    const done = st.classList.contains("done");
    const editing = $("sb" + i).contains(document.activeElement); // don't fold mid-typing
    const open = !done || manualOpen[i] || editing;
    $("sb" + i).style.display = open ? "" : "none";
    $("ss" + i).textContent = done && !open ? sums[i] : "";
    st.classList.toggle("foldable", done);
    st.classList.toggle("static", !done);
    $("sc" + i).textContent = done ? (open ? "▾" : "▸") : "";
  }
}

for (const i of [1, 2, 3, 4]) {
  $("st" + i).addEventListener("click", () => {
    if (!$("st" + i).classList.contains("done")) return; // incomplete steps stay open
    manualOpen[i] = $("sb" + i).style.display === "none";
    updateFold();
  });
  // Re-check the fold shortly after focus leaves a section's inputs.
  $("sb" + i).addEventListener("focusout", () => setTimeout(updateFold, 120));
}

function refreshFlow() {
  const routeOk = validStation($("fromCity").value) && validStation($("toCity").value);
  $("cal").classList.toggle("disabled", !routeOk);
  $("loadTrains").disabled = !routeOk;
  $("checkSeats").disabled = !routeOk || !$("journeyDate").value;

  // Wizard ticks: a green ✓ on each completed step.
  $("st1").classList.toggle("done", routeOk);
  $("st2").classList.toggle("done", !!$("journeyDate").value);
  $("st3").classList.toggle("done", !!($("trainQuery").value.trim() || $("trainSelect").value));
  $("st4").classList.toggle("done", !!$("classPriority").value.trim());
  updateFold();

  const jd = $("journeyDate").value;
  if (!routeOk) { $("dojPreview").textContent = t("pickStations"); return; }
  if (!jd) { $("dojPreview").textContent = t("pickDate"); return; }
  const d = day0(fromIso(jd));
  const rel = resolveReleaseTime();
  const sale = saleState(jd, rel);
  $("dojPreview").textContent =
    sale.state === "later" ? t("opensLater", { d: dojFmt(d), od: dojFmt(sale.openDay), t: rel.label, src: rel.src })
    : sale.state === "today" ? t("openingToday", { d: dojFmt(d), t: rel.zoneLabel })
    : t("onSaleNow", { d: dojFmt(d), t: rel.zoneLabel });
  refreshTrainInfo();
}

function refreshTrainInfo() {
  const name = $("trainQuery").value.trim() || $("trainSelect").value;
  const el = $("trainInfo");
  const info = trainReleaseInfo(name);
  if (!name) {
    const rel = resolveReleaseTime();
    el.textContent = t("noTrainPicked", { t: rel.label, src: rel.src });
    el.style.color = "#7fae95";
    return;
  }
  if (!info) {
    el.textContent = t("unknownTrain");
    el.style.color = "#ffd166";
    return;
  }
  let line = t("trainZoneLine", { zone: info.zone, t: info.label });
  const jd = $("journeyDate").value;
  if (jd) {
    const d = day0(fromIso(jd));
    const sale = saleState(jd, resolveReleaseTime());
    line += sale.state === "later" ? t("opensShort", { d: dojFmt(d), od: dojFmt(sale.openDay) })
      : sale.state === "today" ? t("openingTodayShort", { d: dojFmt(d) })
      : t("onSaleNowShort", { d: dojFmt(d) });
  }
  el.textContent = line;
  const override = $("triggerTime").value;
  if (override && override !== "auto" && override !== info.time) {
    el.textContent += t("overrideWarn", { t: fmtTime12(override) });
    el.style.color = "#ffd166";
  } else {
    el.style.color = "#6fe3a5";
  }
}

function routeKey() {
  return `${$("fromCity").value.trim()}|${$("toCity").value.trim()}`;
}

function fillTrainSelect(trains, doj) {
  routeTrains = trains || [];
  const sel = $("trainSelect");
  sel.innerHTML = "";
  const none = document.createElement("option");
  none.value = "";
  none.textContent = t("anyTrain");
  sel.appendChild(none);
  for (const x of routeTrains) {
    const o = document.createElement("option");
    o.value = x.name;
    let times = "";
    if (x.departure && x.arrival) times = ` — ${x.departure} → ${x.arrival}`;
    else if (x.departure) times = ` — ${x.departure}`;
    o.textContent = x.name + times; // release time lives in the info line only
    sel.appendChild(o);
  }
  sel.disabled = false;
  if (doj) setStatus(t("trainsLoaded", { n: routeTrains.length, doj }));
  const q = $("trainQuery").value.trim();
  if (q) sel.value = [...sel.options].some((o) => o.value === q) ? q : "";
}

async function loadCachedTrains() {
  const { trainCache } = await chrome.storage.local.get("trainCache");
  const entry = trainCache?.[routeKey()];
  if (entry) fillTrainSelect(entry.trains, null);
}

async function loadTrains() {
  await saveConfig();
  setStatus(t("loadingTrains"));
  const tabs = await chrome.tabs.query({ url: "https://eticket.railway.gov.bd/*" });
  if (tabs.length === 0) { setStatus(t("loginThenRetry")); return; }
  const today = day0(new Date());
  const dates = [];
  const jd = $("journeyDate").value ? day0(fromIso($("journeyDate").value)) : null;
  const dojApi = (d) => {
    const EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${String(d.getDate()).padStart(2, "0")}-${EN[d.getMonth()]}-${d.getFullYear()}`;
  };
  if (jd) {
    const diff = Math.round((jd - today) / 86400000);
    if (diff >= 1 && diff <= 9) dates.push(dojApi(jd));
  }
  for (const n of [9, 7, 5, 3, 1]) {
    const d = dojApi(addDays(today, n));
    if (!dates.includes(d)) dates.push(d);
  }
  try {
    const res = await chrome.tabs.sendMessage(tabs[0].id, {
      type: "listTrains",
      from: $("fromCity").value.trim(),
      to: $("toCity").value.trim(),
      dates,
    });
    if (!res?.ok) {
      setStatus(t("loadFail", { e: res?.error || "?" }) + (res?.error === "NOT_LOGGED_IN" ? t("loginToLoad") : ""));
      return;
    }
    fillTrainSelect(res.trains, res.doj);
    const { trainCache } = await chrome.storage.local.get("trainCache");
    const cache = trainCache || {};
    cache[routeKey()] = { at: Date.now(), doj: res.doj, trains: res.trains };
    await chrome.storage.local.set({ trainCache: cache });
    refreshFlow();
  } catch (e) {
    setStatus(t("reachFailed"));
  }
}

// ---------- config ----------
async function loadConfig() {
  const { defaults } = await chrome.runtime.sendMessage({ type: "getDefaults" });
  const { config } = await chrome.storage.local.get("config");
  const cfg = { ...defaults, ...(config || {}) };
  LANG = cfg.lang === "bn" ? "bn" : "en";
  for (const f of FIELDS) {
    const el = $(f);
    if (!el) continue;
    if (el.type === "checkbox") el.checked = !!cfg[f];
    else el.value = cfg[f] ?? "";
  }
  // v2 migration: release time is now auto-resolved from the train's zone.
  if (!cfg.autoReleaseTime) {
    $("triggerTime").value = "auto";
    cfg.autoReleaseTime = true;
    await chrome.storage.local.set({ config: { ...cfg, triggerTime: "auto" } });
  }
  if (!$("triggerTime").value) $("triggerTime").value = "auto";
  // Drop a journey date that is already in the past.
  if ($("journeyDate").value && day0(fromIso($("journeyDate").value)) < day0(new Date())) {
    $("journeyDate").value = "";
  }
  return cfg;
}

async function saveConfig() {
  const { config } = await chrome.storage.local.get("config");
  const cfg = { ...(config || {}) }; // keep flags not bound to form fields
  for (const f of FIELDS) {
    const el = $(f);
    if (!el) continue;
    cfg[f] = el.type === "checkbox" ? el.checked : el.value;
  }
  cfg.seatCount = Math.max(1, Math.min(4, parseInt(cfg.seatCount, 10) || 1));
  cfg.pollIntervalMs = Math.max(300, parseInt(cfg.pollIntervalMs, 10) || 700);
  cfg.maxWaitMinutes = parseInt(cfg.maxWaitMinutes, 10) || 5;
  cfg.lang = LANG;
  await chrome.storage.local.set({ config: cfg });
  return cfg;
}

let armedCache = null; // refreshed every 5s; countdown renders from it every 1s

async function refreshArmState() {
  const { armedTrigger, armedStages, config } = await chrome.storage.local.get(["armedTrigger", "armedStages", "config"]);
  armedCache = armedTrigger && armedTrigger > Date.now()
    ? { at: armedTrigger, then: armedStages?.[1] || null, train: config?.trainQuery, from: config?.fromCity, to: config?.toCity, doj: config?.journeyDate }
    : null;
  const btn = $("arm");
  if (armedCache) {
    btn.textContent = t("disarm", { when: new Date(armedCache.at).toLocaleString(LANG === "bn" ? "bn-BD" : undefined) });
    btn.classList.add("armed");
  } else {
    btn.textContent = t("arm");
    btn.classList.remove("armed");
  }
  $("st5").classList.toggle("done", !!armedCache);
  renderNextCard();
}

function renderNextCard() {
  const card = $("nextCard");
  if (!armedCache) { card.style.display = "none"; return; }
  card.style.display = "block";
  const what = (armedCache.train || `${armedCache.from || ""} → ${armedCache.to || ""}`);
  const doj = armedCache.doj ? dojFmt(fromIso(armedCache.doj)) : "";
  $("ncWhat").textContent = `${what} · ${doj}`;
  let left = Math.max(0, armedCache.at - Date.now());
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  $("ncCount").textContent = LANG === "bn"
    ? `${h}ঘ ${m}মি ${s}সে পরে`
    : `in ${h}h ${m}m ${s}s`;
  const loc = LANG === "bn" ? "bn-BD" : undefined;
  $("ncWhen").textContent = new Date(armedCache.at).toLocaleString(loc) +
    (armedCache.then ? t("thenAgain", { t: new Date(armedCache.then).toLocaleTimeString(loc, { hour: "numeric", minute: "2-digit" }) }) : "");
}

// ---------- login indicator ----------
let loginView = { code: "checking", user: null }; // checking | noTab | noReach | in | out

function renderLogin() {
  const txt = $("loginText");
  const map = {
    checking: ["checking", "#9adbb8", {}],
    noTab: ["siteNotOpen", "#ffd166", {}],
    noReach: ["cantReach", "#ffd166", {}],
    in: ["loggedIn", "#6fe3a5", { user: loginView.user ? (LANG === "bn" ? ` (${loginView.user})` : " as " + loginView.user) : "" }],
    out: ["notLoggedIn", "#ff6b6b", {}],
  };
  const [key, color, vars] = map[loginView.code];
  txt.textContent = t(key, vars);
  txt.style.color = color;
  const blocked = loginView.code === "out";
  $("arm").disabled = blocked;
  $("runNow").disabled = blocked;
}

function applyLogin(res) {
  loginView = !res
    ? { code: "noReach", user: null }
    : res.loggedIn
      ? { code: "in", user: res.user }
      : { code: "out", user: null };
  renderLogin();
}

async function askTab(tabId) {
  try { return await chrome.tabs.sendMessage(tabId, { type: "authStatus" }); }
  catch (_) { return null; }
}

async function checkLogin(openIfMissing) {
  loginView = { code: "checking", user: null };
  renderLogin();
  let tabs = await chrome.tabs.query({ url: "https://eticket.railway.gov.bd/*" });
  if (tabs.length === 0) {
    if (!openIfMissing) {
      loginView = { code: "noTab", user: null };
      renderLogin();
      return;
    }
    await chrome.tabs.create({ url: "https://eticket.railway.gov.bd/", active: false });
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      tabs = await chrome.tabs.query({ url: "https://eticket.railway.gov.bd/*" });
      if (tabs.length) {
        const res = await askTab(tabs[0].id);
        if (res) return applyLogin(res);
      }
    }
    return applyLogin(null);
  }
  applyLogin(await askTab(tabs[0].id));
}

// ---------- saved trips (presets) ----------
async function loadPresets(selectName) {
  const { presets } = await chrome.storage.local.get("presets");
  const sel = $("presetSelect");
  sel.innerHTML = "";
  const none = document.createElement("option");
  none.value = "";
  none.textContent = t("presetPick");
  sel.appendChild(none);
  for (const p of presets || []) {
    const o = document.createElement("option");
    o.value = p.name;
    o.textContent = p.name;
    sel.appendChild(o);
  }
  if (selectName) sel.value = selectName;
}

$("savePreset").onclick = async () => {
  const data = {};
  for (const f of PRESET_FIELDS) data[f] = $(f).value;
  const short = (data.trainQuery.match(/\((\d+)\)/) || [])[1] || data.trainQuery || "any";
  data.name = `${short} · ${data.fromCity}→${data.toCity} ×${$("seatCount").value || 1}`;
  const { presets } = await chrome.storage.local.get("presets");
  const list = (presets || []).filter((p) => p.name !== data.name);
  list.unshift(data);
  await chrome.storage.local.set({ presets: list.slice(0, 8) });
  await loadPresets(data.name);
  setStatus(t("presetSaved"));
};

$("delPreset").onclick = async () => {
  const name = $("presetSelect").value;
  if (!name) return;
  const { presets } = await chrome.storage.local.get("presets");
  await chrome.storage.local.set({ presets: (presets || []).filter((p) => p.name !== name) });
  await loadPresets();
  setStatus(t("presetDeleted"));
};

$("presetSelect").addEventListener("change", async () => {
  const name = $("presetSelect").value;
  if (!name) return;
  const { presets } = await chrome.storage.local.get("presets");
  const p = (presets || []).find((x) => x.name === name);
  if (!p) return;
  for (const f of PRESET_FIELDS) $(f).value = p[f] ?? "";
  await saveConfig();
  refreshFlow();
  loadCachedTrains();
  setStatus(t("presetApplied"));
});

// ---------- check seats now ----------
$("checkSeats").onclick = async () => {
  const jd = $("journeyDate").value;
  if (!jd) { setStatus(t("pickDateFirst")); return; }
  setStatus(t("checkingSeats"));
  const tabs = await chrome.tabs.query({ url: "https://eticket.railway.gov.bd/*" });
  if (tabs.length === 0) { setStatus(t("loginThenRetry")); return; }
  const EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const d = fromIso(jd);
  const doj = `${String(d.getDate()).padStart(2, "0")}-${EN[d.getMonth()]}-${d.getFullYear()}`;
  try {
    const res = await chrome.tabs.sendMessage(tabs[0].id, {
      type: "checkSeats",
      from: $("fromCity").value.trim(),
      to: $("toCity").value.trim(),
      doj,
      trainQuery: $("trainQuery").value.trim() || $("trainSelect").value,
    });
    if (!res?.ok) {
      setStatus(res?.error === "NOT_FOUND" ? t("seatsNotOnSale") : t("loadFail", { e: res?.error || "?" }));
      return;
    }
    const lines = res.trains.map((x) => `${x.name}\n   ${x.counts.map((c) => `${c.type}: ${c.online}`).join(" · ")}`);
    setStatus(`${dojFmt(d)}\n` + lines.join("\n"));
  } catch (_) {
    setStatus(t("reachFailed"));
  }
};

// ---------- alarm sound test (same audio path as the real alarm) ----------
$("soundTest").onclick = () => {
  chrome.runtime.sendMessage({ type: "siren", on: true, once: true });
};

// ---------- run history ----------
async function renderHistory() {
  const { runHistory } = await chrome.storage.local.get("runHistory");
  const box = $("historyBox");
  box.innerHTML = "";
  const list = runHistory || [];
  if (list.length === 0) { box.textContent = t("historyEmpty"); return; }
  for (const r of list) {
    const div = document.createElement("div");
    const when = new Date(r.at).toLocaleString(LANG === "bn" ? "bn-BD" : undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    div.textContent = `${when} · ${r.train || "?"} ${r.doj || ""} — ${t("oc_" + r.outcome)}${r.detail ? " · " + r.detail : ""}`;
    box.appendChild(div);
  }
}

// ---------- events ----------
$("langToggle").onclick = async () => {
  LANG = LANG === "en" ? "bn" : "en";
  await saveConfig();
  applyLang();
};

$("loginCheck").onclick = () => checkLogin(true);
$("openSite").onclick = async () => {
  await chrome.runtime.sendMessage({ type: "openSite" });
  window.close();
};

$("trainSelect").addEventListener("change", () => {
  $("trainQuery").value = $("trainSelect").value;
  saveConfig();
  refreshFlow();
});
$("trainQuery").addEventListener("change", () => { saveConfig(); refreshFlow(); });
$("trainQuery").addEventListener("input", refreshTrainInfo);
$("loadTrains").onclick = loadTrains;

$("openTab").onclick = () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("popup.html?tab=1") });
  window.close();
};
if (new URLSearchParams(location.search).get("tab")) $("openTab").style.display = "none";

$("stopRun").onclick = async () => {
  const tabs = await chrome.tabs.query({ url: "https://eticket.railway.gov.bd/*" });
  await chrome.storage.local.set({ mission: null });
  let stopped = 0;
  for (const x of tabs) {
    try {
      const r = await chrome.tabs.sendMessage(x.id, { type: "stopRun" });
      if (r?.wasRunning) stopped++;
    } catch (_) {}
  }
  setStatus(stopped ? t("stopped") : t("stopNone"));
};

$("arm").onclick = async () => {
  const armed = $("arm").classList.contains("armed");
  await saveConfig();
  if (armed) {
    await chrome.runtime.sendMessage({ type: "disarm" });
    setStatus(t("disarmed"));
  } else {
    if (!validStation($("fromCity").value) || !validStation($("toCity").value)) {
      setStatus(t("pickStations"));
      return;
    }
    if (!$("journeyDate").value) { setStatus(t("pickDate")); return; }
    const res = await chrome.runtime.sendMessage({ type: "arm" });
    if (res.ok) setStatus(t("armedFor", { when: new Date(res.trigger).toLocaleString(LANG === "bn" ? "bn-BD" : undefined) }));
    else setStatus(t("couldNotArm", { e: res.error || "?" }));
  }
  refreshArmState();
};

$("runNow").onclick = async () => {
  await saveConfig();
  if (!$("journeyDate").value) { setStatus(t("pickDateFirst")); return; }
  await chrome.runtime.sendMessage({ type: "runNow" });
  setStatus(t("launching"));
  window.close();
};

for (const f of FIELDS) {
  const el = $(f);
  if (el && el.type !== "hidden") el.addEventListener("change", () => { saveConfig(); refreshFlow(); });
}
$("fromCity").addEventListener("input", refreshFlow);
$("toCity").addEventListener("input", refreshFlow);

// ---------- init ----------
fillStaticLists(); // options must exist before loadConfig assigns select values
loadConfig().then(() => {
  applyLang();
  loadCachedTrains();
  checkLogin(false);
  loadPresets();
  renderHistory();
});
setInterval(refreshArmState, 5000);
setInterval(renderNextCard, 1000);
