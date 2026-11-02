// BD Rail Ticket Alarm — background service worker.
// Owns scheduling: computes the next trigger, sets a chrome.alarm a bit
// before it, opens/focuses the booking tab, and marks a "mission" in
// chrome.storage.local that the content script picks up and executes.

importScripts("rail-data.js"); // RAIL_DATA: stations, trains, per-train release times

const PRELAUNCH_LEAD_MS = 75_000; // open the tab this long before trigger
const ALARM_NAME = "autobook-prelaunch";
const REMIND_1D = "autobook-remind-1d";
const REMIND_1H = "autobook-remind-1h";

const DEFAULTS = {
  fromCity: "Cox's Bazar",
  toCity: "Dhaka",
  trainQuery: "",            // substring of train name/number, "" = first train with seats
  classPriority: "S_CHAIR",  // comma-separated, tried in order
  seatCount: 1,
  preferredCoaches: "",      // comma-separated coach prefixes, e.g. "THA,TA"
  preferredSeats: "",        // comma-separated exact seat numbers, e.g. "THA-21,THA-22"
  journeyDate: "",           // ISO yyyy-mm-dd, picked on the popup calendar
  triggerTime: "auto",       // "auto" = 12 AM on the opening day, then the train's zone time; or explicit "HH:MM:SS"
  startLeadMs: 500,          // tiny head start so the first search lands ~at the release second
  pollIntervalMs: 700,
  maxWaitMinutes: 5,
};

const SALE_WINDOW_DAYS = 10; // BD Railway sells tickets up to 10 days ahead

async function getConfig() {
  const stored = await chrome.storage.local.get("config");
  return { ...DEFAULTS, ...(stored.config || {}) };
}

function nextTrigger(timeStr) {
  const [h, m, s] = (timeStr || "08:00:00").split(":").map((x) => parseInt(x, 10) || 0);
  const now = new Date();
  const t = new Date(now);
  t.setHours(h, m, s, 0);
  if (t.getTime() - 5000 <= now.getTime()) t.setDate(t.getDate() + 1);
  return t;
}

function parseIso(s) {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dojFormat(d) {
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${String(d.getDate()).padStart(2, "0")}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

// The zone time is resolved, not asked: selected train's zone decides it
// (EAST 2 PM, WEST 8 AM); without a train, the earliest among the route's
// known trains; failing that, 8 AM.
async function resolveZoneTime(cfg) {
  const num = (String(cfg.trainQuery).match(/\((\d+)\)/) || String(cfg.trainQuery).trim().match(/^(\d+)$/) || [])[1];
  if (num && RAIL_DATA.openingTimes[num]) return RAIL_DATA.openingTimes[num];
  const { trainCache } = await chrome.storage.local.get("trainCache");
  const entry = trainCache?.[`${cfg.fromCity}|${cfg.toCity}`];
  const times = (entry?.trains || [])
    .map((t) => (String(t.name).match(/\((\d+)\)/) || [])[1])
    .map((n) => n && RAIL_DATA.openingTimes[n])
    .filter(Boolean)
    .sort();
  return times[0] || "08:00:00";
}

function atTime(day, timeStr) {
  const [h, m, s] = timeStr.split(":").map((x) => parseInt(x, 10) || 0);
  const t = new Date(day);
  t.setHours(h, m, s, 0);
  return t;
}

// Checks to run for this journey date D. Its sale opens on D - 10 days, but
// on ordinary days the new date can appear at midnight (the site rolls its
// bookable dates over at 00:00), while the railway publishes per-zone times
// (EAST 2 PM, WEST 8 AM). "auto" covers both: a short check at 12 AM and,
// only if that finds nothing, another at the zone time. An explicit
// triggerTime is a single check. A date already on sale gets one check at
// the next zone time.
async function stagesForJourney(cfg) {
  if (!cfg.journeyDate) return [];
  const openDay = parseIso(cfg.journeyDate);
  openDay.setDate(openDay.getDate() - SALE_WINDOW_DAYS);
  const soon = Date.now() + 5000;
  if (cfg.triggerTime && cfg.triggerTime !== "auto") {
    const t = atTime(openDay, cfg.triggerTime);
    return [t.getTime() > soon ? t.getTime() : nextTrigger(cfg.triggerTime).getTime()];
  }
  const zone = await resolveZoneTime(cfg);
  const stages = [atTime(openDay, "00:00:00"), atTime(openDay, zone)]
    .map((t) => t.getTime())
    .filter((t) => t > soon);
  return stages.length ? stages : [nextTrigger(zone).getTime()];
}

async function setLaunchAlarm(at) {
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.alarms.create(ALARM_NAME, { when: Math.max(at - PRELAUNCH_LEAD_MS, Date.now() + 1000) });
}

function searchUrl(cfg, doj) {
  const q = new URLSearchParams({
    fromcity: cfg.fromCity,
    tocity: cfg.toCity,
    doj,
    class: (cfg.classPriority.split(",")[0] || "S_CHAIR").trim(),
  });
  return `https://eticket.railway.gov.bd/booking/train/search?${q.toString()}`;
}

async function arm() {
  const cfg = await getConfig();
  if (!cfg.journeyDate) return { error: "no journey date set" };
  if (parseIso(cfg.journeyDate).getTime() < new Date().setHours(0, 0, 0, 0)) {
    return { error: "journey date is in the past" };
  }
  const stages = await stagesForJourney(cfg);
  const first = stages[0];
  await setLaunchAlarm(first);
  // Reminders: the day before and one hour before the first check.
  await chrome.alarms.clear(REMIND_1D);
  await chrome.alarms.clear(REMIND_1H);
  if (first - 86_400_000 > Date.now() + 60_000) {
    await chrome.alarms.create(REMIND_1D, { when: first - 86_400_000 });
  }
  if (first - 3_600_000 > Date.now() + 60_000) {
    await chrome.alarms.create(REMIND_1H, { when: first - 3_600_000 });
  }
  await chrome.storage.local.set({ armedTrigger: first, armedStages: stages, mission: null });
  return { trigger: first, stages };
}

async function disarm() {
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.alarms.clear(REMIND_1D);
  await chrome.alarms.clear(REMIND_1H);
  await chrome.storage.local.set({ armedTrigger: null, armedStages: null, mission: null });
}

async function sendReminder(kind) {
  const cfg = await getConfig();
  const { armedTrigger } = await chrome.storage.local.get("armedTrigger");
  if (!armedTrigger || armedTrigger < Date.now()) return; // disarmed or already fired
  const bn = cfg.lang === "bn";
  const when = new Date(armedTrigger).toLocaleString(bn ? "bn-BD" : undefined);
  const what = cfg.trainQuery || `${cfg.fromCity} → ${cfg.toCity}`;
  const title = kind === "1d"
    ? (bn ? "🚆 আগামীকাল টিকিট ছাড়বে!" : "🚆 Tickets open tomorrow!")
    : (bn ? "🚆 ১ ঘণ্টা পরে টিকিট ছাড়বে!" : "🚆 Tickets open in 1 hour!");
  const message = bn
    ? `${what} (${dojFormat(parseIso(cfg.journeyDate))})-এর টিকিট ছাড়বে ${when}-এ — অ্যালার্ম বাজবে, তখন আপনি BOOK NOW চাপবেন। কম্পিউটার চালু, Brave খোলা আর লগইন ঠিক রাখুন।`
    : `${what} for ${dojFormat(parseIso(cfg.journeyDate))} opens at ${when} — the alarm will ring and you click BOOK NOW. Keep this computer on, Brave running, and stay logged in.`;
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon128.png",
    title,
    message,
    priority: 2,
    requireInteraction: true,
  });
}

async function launchMission(runAt, { nextAt = null, scheduled = false } = {}) {
  const cfg = await getConfig();
  if (!cfg.journeyDate) return;
  const doj = dojFormat(parseIso(cfg.journeyDate));
  const url = searchUrl(cfg, doj);

  const mission = {
    createdAt: Date.now(),
    runAt,
    nextAt, // a later check is still armed if this one finds nothing
    scheduled, // false for "Test run now"
    doj,
    status: "launched",
  };
  await chrome.storage.local.set({ mission });

  // Reuse an existing railway site tab if there is one, else open a new one.
  const tabs = await chrome.tabs.query({ url: "https://eticket.railway.gov.bd/*" });
  if (tabs.length > 0) {
    await chrome.tabs.update(tabs[0].id, { url, active: true });
    await chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url, active: true });
  }
}

// The alarm sound plays in an offscreen document: pages the user hasn't
// clicked can't start audio, but the extension's own audio page can.
async function siren(on, once = false) {
  if (on) {
    try {
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["AUDIO_PLAYBACK"],
        justification: "Ring the alarm when train tickets open",
      });
    } catch (_) {} // already open
  }
  chrome.runtime.sendMessage({ target: "offscreen", type: on ? "siren-start" : "siren-stop", once })
    .catch(() => {});
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === REMIND_1D) return sendReminder("1d");
  if (alarm.name === REMIND_1H) return sendReminder("1h");
  if (alarm.name !== ALARM_NAME) return;
  const { armedStages, armedTrigger } = await chrome.storage.local.get(["armedStages", "armedTrigger"]);
  const stages = armedStages?.length ? armedStages : [armedTrigger || Date.now() + 5000];
  const [runAt, ...rest] = stages;
  if (rest.length) {
    await setLaunchAlarm(rest[0]);
    await chrome.storage.local.set({ armedTrigger: rest[0], armedStages: rest });
  } else {
    await chrome.storage.local.set({ armedTrigger: null, armedStages: null });
  }
  await launchMission(runAt, { nextAt: rest[0] || null, scheduled: true });
});

// Content scripts only start when a page loads, so a ticket tab that was
// open before this extension was installed or reloaded has none. Add it.
async function ensureContentScript(tabId) {
  try { if (await chrome.tabs.sendMessage(tabId, { type: "ping" })) return true; } catch (_) {}
  for (const file of ["rail-data.js", "content.js"]) {
    try { await chrome.scripting.executeScript({ target: { tabId }, files: [file] }); } catch (_) {}
  }
  try { return !!(await chrome.tabs.sendMessage(tabId, { type: "ping" })); } catch (_) { return false; }
}

chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: "https://eticket.railway.gov.bd/*" });
  for (const t of tabs) ensureContentScript(t.id);
});

async function openSite() {
  const tabs = await chrome.tabs.query({ url: "https://eticket.railway.gov.bd/*" });
  if (tabs.length > 0) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    await chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: "https://eticket.railway.gov.bd/", active: true });
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case "arm": {
        const r = await arm();
        if (r.error) sendResponse({ ok: false, error: r.error });
        else sendResponse({ ok: true, trigger: r.trigger, stages: r.stages });
        break;
      }
      case "disarm": {
        await disarm();
        sendResponse({ ok: true });
        break;
      }
      case "runNow": {
        await launchMission(Date.now() + 5000);
        sendResponse({ ok: true });
        break;
      }
      case "found": {
        // Seats are open: the later fallback check is no longer needed.
        // A test run must not cancel the real ARM.
        if (msg.scheduled) await disarm();
        sendResponse({ ok: true });
        break;
      }
      case "ensureTab": {
        sendResponse({ ok: await ensureContentScript(msg.tabId) });
        break;
      }
      case "openSite": {
        await openSite();
        sendResponse({ ok: true });
        break;
      }
      case "siren": {
        await siren(!!msg.on, !!msg.once);
        sendResponse({ ok: true });
        break;
      }
      case "notify": {
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icon128.png",
          title: msg.title || "BD Rail Ticket Alarm",
          message: msg.message || "",
          priority: 2,
          requireInteraction: true,
        });
        sendResponse({ ok: true });
        break;
      }
      case "getDefaults": {
        sendResponse({ ok: true, defaults: DEFAULTS });
        break;
      }
      default:
        sendResponse({ ok: false, error: "unknown message" });
    }
  })();
  return true; // async sendResponse
});
