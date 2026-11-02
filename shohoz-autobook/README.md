# 🚆 BD Rail Ticket Alarm

**বাংলায় পড়ুন → [README.bn.md](README.bn.md)** · Full guide: https://saikatnjm.github.io/bd-rail-ticket-alarm/

A Brave/Chrome extension that helps you grab Bangladesh Railway tickets
(eticket.railway.gov.bd) the moment they go on sale. You pick the journey date on a
calendar; the extension works out **when** those tickets open, watches for your
train at that exact second, then **rings an alarm and lights up the BOOK NOW
button** on the site. You click it, pick the seats it outlines for you, and do
OTP and payment.

> Why you click BOOK NOW yourself: the site protects the seat map with a
> bot check. The extension stays out of it on purpose — that keeps your
> account safe.

## Everything it does

- **Calendar date picking** — tap your travel date; it works out the opening day (10 days before) and checks at 12 AM, then at the train's zone time (8 AM or 2 PM) if needed)
- **Watches at the exact second** tickets open, synced to the railway server's clock
- **Rings a loud alarm** when your train has seats — keeps ringing until you click the page
- **Lights up BOOK NOW** — scrolls to your train and makes its button glow
- **Rings the best seats in blue** in the seat map — middle of the coach, side by side for 2+ tickets, or your exact seats / coaches if you set them
- **Tells you the fuller coach** if a different coach has more free seats
- **Reminds you beforehand** — a notification 1 day before and 1 hour before
- **Shows if you're logged in** — green tick / red cross; buttons stay off until you log in
- **Big countdown card** — what it's waiting for, and how long until it fires
- **Check seats now** — current online seat count for each class
- **Saved trips** — save a route + train once, reuse in one click
- **Recent runs** — how your last runs ended
- **English / বাংলা** — one tap on the বাং button
- **Careful with the server** — polite speed, backs off when asked, never searches before release time

---

## Install (one time)

1. Open `brave://extensions` (or `chrome://extensions`)
2. Turn on **Developer mode** (top-right)
3. Click **Load unpacked** → select this `shohoz-autobook` folder
4. Pin the 🚆 icon. Click it to open the panel.

> Chrome closes the small popup when you click outside it.
> Use **⧉ open as tab** to keep the panel open.

---

## How to use

The panel has 5 numbered steps. A finished step shrinks to one line with a ✓ —
tap it to open it again.

1. **Route** — type and pick From / To stations from the suggestions.
2. **Date** — tap your travel date. The line below tells you when it goes on sale.
3. **Train** — the route's trains load by themselves (⟳ refreshes); pick yours. Days a train doesn't run are shown, e.g. “not on Wednesday”. The check times are
   set for you: 12 AM on the opening day, then the zone time (WEST 8 AM, EAST 2 PM).
4. **Seats & class** — class (e.g. `S_CHAIR`), how many seats, and optionally
   preferred coaches (`THA,TA`) or exact seats (`THA-21,THA-22`).
5. **Go** — press **ARM**. A green card shows the countdown.

Also make sure you're **logged in** (green tick at the top), and keep Brave
open and the computer awake at release time.

### What happens at release time

1. ~75 seconds before, an eticket.railway.gov.bd tab opens with a small status box (bottom-right).
2. At 12 AM on the opening day it checks for your train, about once a second.
   If nothing opens, it checks again at the zone time (8 AM / 2 PM).
3. As soon as your class has online seats:
   - **the alarm rings** and a notification pops up
   - the page reloads and **scrolls to your train**
   - your class's **BOOK NOW glows yellow**
4. **You click BOOK NOW.** The seat map opens with the **best seats outlined**.
   If another coach has more free seats, the status box says which.
5. Click the outlined seats → **CONTINUE PURCHASE** → OTP → pay.

Click anywhere on the page to stop the alarm.

### How it picks the seats it outlines

1. **Exact seats** you typed — if free
2. **Your preferred coaches**, in your order
3. Otherwise the **middle part of the coach** (away from doors and wheels)
4. For 2+ tickets: **side-by-side seats** as close to the middle as possible

It only outlines. You do the clicking.

### Buttons

| Button | What it does |
|---|---|
| **ARM** | Sets it to fire at the release time (red = armed; press again to cancel) |
| **▶ Test run now** | Runs it right away — use it on a date that's already on sale to see the alarm and glow |
| **■ STOP** (panel or page) | Stops everything at once, including the alarm |
| **Tools → 📊 Check seats now** | Online seat count per class, right now |
| **Tools → 💾 Save / Saved trips** | Save the current setup, reload it later |
| **Tools → 🔔 Test alarm sound** | Hear the alarm so you know the volume |
| **✨ / ◻** (top) | Switch the panel between the classic and the glossy glass look |

---

## Staying safe from blocks

Shohoz blocks you for a while if you ask too often ("You are requesting too
frequently"). The extension is built to stay polite:

- **Nothing before release time.** If the date isn't on sale yet, it refuses
  to start instead of searching for nothing.
- **About one search per second**, with random gaps — like a person pressing refresh.
- **Stops searching the moment your train has seats.**
- **Slows down if the server says so** (waits 2, 4, 8, then 15 seconds).
- **Gives up after 5 minutes** (changeable in Advanced).
- **Never touches the seat map's bot check** — you open the seat map yourself.

Your part:

- Don't test again and again on dates that aren't on sale yet.
- One device per trip — don't arm two computers for the same ticket.

---

## If something goes wrong

| Problem | What to do |
|---|---|
| "You are requesting too frequently" | Press ■ STOP, close the tab, wait 15–30 minutes |
| Red ✖ not logged in | Log in at eticket.railway.gov.bd, then press ↻ re-check |
| "Session expired" in the status box | Log in again |
| No trains in the list | Open shohoz in a tab, log in, then ⟳ Load trains |
| No sound | Press Tools → 🔔 Test alarm sound; check the computer's volume |
| Changed train or date after arming | Press ARM again to cancel, then ARM once more |

---

## Good to know

- OTP, CAPTCHA, seat map and payment are always done by you.
- Settings stay in this browser only. For another computer: copy this folder,
  Load unpacked there, log in and set it up again.
- Personal use only, at your own risk.
