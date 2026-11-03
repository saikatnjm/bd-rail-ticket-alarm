# Chrome Web Store listing — copy and paste

Everything you need to fill in the Developer Dashboard, field by field.
Images are in [images/](images/).

---

## Package tab

Upload: `bd-rail-ticket-alarm-<version>.zip` (built by `./build-zip.sh`, lands in this folder).

---

## Store listing tab

**Name** (from the manifest, can't be edited here)
```
BD Rail Ticket Alarm
```

**Summary** (from the manifest description, max 132 characters)
```
Rings an alarm the second Bangladesh Railway tickets for your train go on sale, then highlights BOOK NOW and good seats.
```

**Description**
```
Never miss the 10-day ticket release again.

BD Rail Ticket Alarm watches for your train on eticket.railway.gov.bd at the exact second its tickets go on sale. When your class has online seats, it rings a loud alarm, jumps to your train and makes the BOOK NOW button glow. In the seat map it outlines good seats for you. You click, you pay — nothing is booked behind your back.

WHAT IT DOES
• Pick your travel date on a calendar — it works out the opening day (10 days before) and checks at 8 AM, when tickets open — plus 2 PM for East trains during Eid
• Big countdown, plus reminders a day before and an hour before
• At release time it checks for your train about once a second
• Loud alarm the moment seats open — keeps ringing until you click the page
• Scrolls to your train and lights up BOOK NOW
• Outlines good seats: middle of the coach, side by side for 2+ tickets, or your own preferred coaches/seats
• Suggests forward-facing seats first, and shows which way each seat likely faces: forward ⬆ or backward ⬇ (a common rule of thumb, not official)
• Tells you if another coach has more free seats
• Shows whether you're logged in
• Saved trips and recent run history
• Full English and Bangla (বাংলা) interface

GENTLE ON THE SERVER
• Never checks before release time
• About one check per second, only for a few minutes, stops as soon as seats appear
• Slows down automatically if the server asks
• Never touches the site's bot check, never logs in for you, never handles OTP or payment

HOW TO USE
1. Log in at eticket.railway.gov.bd
2. Open the extension, choose From / To stations
3. Tap your journey date
4. Load trains and pick yours
5. Choose class and number of seats
6. Press ARM — and be at your computer at release time

Tip: try "Test run now" on a date that's already on sale to see the alarm and the glowing button before the real day.

PRIVACY
Everything stays in your browser. The only data sent anywhere is the train searches it makes to the railway's own ticketing servers with your existing login, just like the website's own Search button. No analytics, no tracking, no third parties. Full policy: https://saikatnjm.github.io/bd-rail-ticket-alarm/privacy.html

Full guide (English and Bangla): https://saikatnjm.github.io/bd-rail-ticket-alarm/
Source code: https://github.com/saikatnjm/bd-rail-ticket-alarm

This is an independent, free project. It is not made by, approved by or connected to Bangladesh Railway or Shohoz. It doesn't guarantee a ticket.
```

**Category**
```
Productivity → Tools
```
(If the dashboard shows the older single list, choose **Productivity**.)

**Language**: English (United States)

**Store icon (128×128)**: `../shohoz-autobook/icon128.png`

**Screenshots (1280×800)** — upload in this order:
1. `images/screenshot-1.png` — panel with countdown
2. `images/screenshot-2.png` — alarm + glowing BOOK NOW
3. `images/screenshot-3.png` — outlined seats
4. `images/screenshot-4.png` — Bangla interface

**Small promo tile (440×280)**: `images/promo-small-440x280.png`

**Marquee promo tile (1400×560, optional)**: `images/promo-marquee-1400x560.png`

**Official URL**: leave as *None*.

**Homepage URL**
```
https://saikatnjm.github.io/bd-rail-ticket-alarm/
```

**Support URL**
```
https://github.com/saikatnjm/bd-rail-ticket-alarm/issues
```

**Mature content**: No.

---

## Privacy tab

**Single purpose description**
```
Alerts the user the moment Bangladesh Railway tickets for their chosen train go on sale on eticket.railway.gov.bd, then highlights the site's BOOK NOW button and suggested seats so the user can book them manually.
```

**Permission justifications**

`alarms`
```
Starts the ticket check at the exact release time the user picked and shows reminders one day and one hour before.
```

`storage`
```
Saves the user's trip settings (route, date, train, class, seat count), saved trips and recent run results locally in the browser.
```

`notifications`
```
Tells the user when seats for their train open, when their login has expired, and reminds them before the release time.
```

`tabs`
```
Opens (or reuses) the eticket.railway.gov.bd tab shortly before the release time so the check runs on the ticket site and the user lands on the right page.
```

`offscreen`
```
Plays the alarm sound. Browsers block audio in tabs the user hasn't clicked, and the ticket tab is opened automatically at release time, so the sound plays from an offscreen document.
```

`scripting`
```
Adds the extension's own content script to an eticket.railway.gov.bd tab that was already open before the extension was installed or updated, so the login check and train list work without the user reloading the page. Used only on that site, only with the extension's packaged files.
```

Host permissions (`https://eticket.railway.gov.bd/*`, `https://railspaapi.shohoz.com/*`)
```
The extension only works on the Bangladesh Railway ticket site. It checks train availability through the site's own search API using the user's existing login, highlights the BOOK NOW button and outlines suggested seats on the site's pages. No other sites are accessed.
```

**Are you using remote code?**
```
No, I am not using remote code.
```

**Data usage — what user data do you collect?** Tick only:
- ☑ **Authentication information** — the site's own login token is read from the page and sent only to eticket.railway.gov.bd's API to search for trains.
- ☑ **Website content** — train search results and seat-map page content are read to find seats and highlight them.

Leave everything else unticked (no personally identifiable info, health, financial, location, web history, user activity, personal communications).

**Certify all three statements:**
- ☑ I do not sell or transfer user data to third parties, outside of the approved use cases
- ☑ I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**
```
https://saikatnjm.github.io/bd-rail-ticket-alarm/privacy.html
```

---

## Distribution tab

- **Payments**: Free of charge
- **Visibility**: **Unlisted**
- **Regions**: All regions (or just Bangladesh — either is fine)

---

## Test instructions tab (optional but helps review)

```
The extension needs a eticket.railway.gov.bd account to search trains (Bangladesh phone number required), so a reviewer may not be able to log in. Without login the panel shows that you're not logged in, and a run stops with a "Not logged in" message — that is expected.

What you can check without an account:
1. Open the panel, type "Dhaka" and "Chattogram" as From/To, tap a date: it shows when that date's tickets go on sale.
2. Tools → "Test alarm sound" plays the alarm.
3. The বাং button switches the panel to Bangla.

The extension never automates login, OTP, the site's bot check, seat reservation or payment. Full guide: https://saikatnjm.github.io/bd-rail-ticket-alarm/
```
