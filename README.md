# 🔔 BD Rail Ticket Alarm

**Never miss the 10-day ticket release again.** A free Brave/Chrome extension that watches for your
Bangladesh Railway train the second its tickets go on sale on train.shohoz.com, rings a loud alarm,
and lights up the BOOK NOW button and good seats. You click, you pay — nothing is booked behind your back.

📖 **Guide:** [English](https://saikatnjm.github.io/bd-rail-ticket-alarm/) · [বাংলা](https://saikatnjm.github.io/bd-rail-ticket-alarm/bn.html)
🔧 **How it works / limits:** [English](https://saikatnjm.github.io/bd-rail-ticket-alarm/how-it-works.html) · [বাংলা](https://saikatnjm.github.io/bd-rail-ticket-alarm/how-it-works-bn.html)
🔒 **Privacy:** [policy](https://saikatnjm.github.io/bd-rail-ticket-alarm/privacy.html)

![The panel with a countdown to release time](docs/img/screenshot-1.png)

## Features

- Calendar date picking — works out the release time (10 days before, 8 AM WEST zone / 2 PM EAST zone)
- Countdown, plus reminders 1 day and 1 hour before
- Checks for your train at the exact release second, about once a second
- Loud alarm when seats open; scrolls to your train and makes BOOK NOW glow
- Outlines good seats: middle of the coach, side by side for 2+ tickets, or your preferred coaches/seats
- Login indicator, saved trips, recent runs, full English/Bangla UI

## What it never does

Log in for you · touch the site's bot check (Cloudflare Turnstile) · reserve seats · enter OTP · pay.
It stays polite: no searching before release, ~1 request/second for a few minutes at most, backs off on HTTP 429.
Details and honest limitations: [How it works](https://saikatnjm.github.io/bd-rail-ticket-alarm/how-it-works.html).

## Install

**Chrome Web Store:** unlisted — link shared on request.

**From source:**
1. Download this repo (or a zip from [Releases](https://github.com/saikatnjm/bd-rail-ticket-alarm/releases)).
2. Open `brave://extensions` or `chrome://extensions`, turn on **Developer mode**.
3. **Load unpacked** → choose the `shohoz-autobook` folder.

## Repository layout

| Path | What |
|---|---|
| `shohoz-autobook/` | The extension (Manifest V3) |
| `docs/` | Documentation website (GitHub Pages) |
| `webstore/` | Chrome Web Store listing text, images and [publishing steps](webstore/PUBLISHING.md) |
| `build-zip.sh` | Builds the store upload zip |

## Contributing

Issues and pull requests are welcome — layout-change fixes, release-time updates in `rail-data.js`,
translations. Changes that bypass the bot check, automate login/OTP/payment or raise the request rate won't be accepted.

## Disclaimer

Independent project, not affiliated with Bangladesh Railway or Shohoz. No guarantee of tickets.
Use at your own risk and follow the ticket site's terms. Licensed under [MIT](LICENSE).
