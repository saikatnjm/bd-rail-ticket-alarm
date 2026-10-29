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
  triggerTime: "auto",       // "auto" = from the train's zone; or explicit "HH:MM:SS"
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

// The release time is resolved, not asked: selected train's zone decides it
// (EAST 2 PM, WEST 8 AM); without a train, the earliest among the route's
// known trains; failing that, 8 AM. An explicit cfg.triggerTime overrides.
async function resolveTriggerTime(cfg) {
  if (cfg.triggerTime && cfg.triggerTime !== "auto") return cfg.triggerTime;
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

// When should we fire for this journey date? The sale for date D opens on
// D - 10 days at release time. If that morning is still ahead, fire then;
// if the date is already on sale, fire at the next release time.
function triggerForJourney(cfg, releaseTime) {
  if (!cfg.journeyDate) return null;
  const [h, m, s] = (releaseTime || "08:00:00").split(":").map((x) => parseInt(x, 10) || 0);
  const openDay = parseIso(cfg.journeyDate);
  openDay.setDate(openDay.getDate() - SALE_WINDOW_DAYS);
  openDay.setHours(h, m, s, 0);
  const next = nextTrigger(releaseTime);
  return openDay.getTime() > next.getTime() ? openDay : next;
}

function searchUrl(cfg, doj) {
  const q = new URLSearchParams({
    fromcity: cfg.fromCity,
    tocity: cfg.toCity,
    doj,
    class: (cfg.classPriority.split(",")[0] || "S_CHAIR").trim(),
  });
  return `https://train.shohoz.com/booking/train/search?${q.toString()}`;
}

async function arm() {
  const cfg = await getConfig();
  const releaseTime = await resolveTriggerTime(cfg);
  const trigger = triggerForJourney(cfg, releaseTime);
  if (!trigger) return { error: "no journey date set" };
  if (parseIso(cfg.journeyDate).getTime() < new Date().setHours(0, 0, 0, 0)) {
    return { error: "journey date is in the past" };
  }
  const when = trigger.getTime() - PRELAUNCH_LEAD_MS;
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.alarms.create(ALARM_NAME, { when: Math.max(when, Date.now() + 1000) });
  // Reminders: the day before and one hour before the booking moment.
  await chrome.alarms.clear(REMIND_1D);
  await chrome.alarms.clear(REMIND_1H);
  if (trigger.getTime() - 86_400_000 > Date.now() + 60_000) {
    await chrome.alarms.create(REMIND_1D, { when: trigger.getTime() - 86_400_000 });
  }
  if (trigger.getTime() - 3_600_000 > Date.now() + 60_000) {
    await chrome.alarms.create(REMIND_1H, { when: trigger.getTime() - 3_600_000 });
  }
  await chrome.storage.local.set({
    armedTrigger: trigger.getTime(),
    mission: null,
  });
  return { trigger: trigger.getTime() };
}

async function disarm() {
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.alarms.clear(REMIND_1D);
  await chrome.alarms.clear(REMIND_1H);
  await chrome.storage.local.set({ armedTrigger: null, mission: null });
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

async function launchMission(runNow = false) {
  const cfg = await getConfig();
  if (!cfg.journeyDate) return;
  const releaseTime = await resolveTriggerTime(cfg);
  const trigger = runNow ? new Date(Date.now() + 5000) : (triggerForJourney(cfg, releaseTime) || new Date());
  const doj = dojFormat(parseIso(cfg.journeyDate));
  const url = searchUrl(cfg, doj);

  const mission = {
    createdAt: Date.now(),
    runAt: trigger.getTime(),
    doj,
    status: "launched",
  };
  await chrome.storage.local.set({ mission });

  // Reuse an existing shohoz tab if there is one, else open a new one.
  const tabs = await chrome.tabs.query({ url: "https://train.shohoz.com/*" });
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
  await launchMission(false);
  // One-shot: each arming books one specific journey date.
  await chrome.storage.local.set({ armedTrigger: null });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case "arm": {
        const r = await arm();
        if (r.error) sendResponse({ ok: false, error: r.error });
        else sendResponse({ ok: true, trigger: r.trigger });
        break;
      }
      case "disarm": {
        await disarm();
        sendResponse({ ok: true });
        break;
      }
      case "runNow": {
        await launchMission(true);
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
