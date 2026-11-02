# Publishing — step by step

Two parts: **GitHub** (public code + documentation website) and the **Chrome Web Store** (unlisted).
Do GitHub first — the store needs the privacy-policy page it creates.

Everything below is already prepared in this folder:

| What | Where |
|---|---|
| Extension | `shohoz-autobook/` |
| Documentation website (EN + BN) | `docs/` |
| Store text, field by field | `webstore/STORE-LISTING.md` |
| Store screenshots and promo tiles | `webstore/images/` |
| Zip builder | `build-zip.sh` |

---

## Part 1 — GitHub (about 10 minutes)

### 1. Create the empty repository

1. Go to <https://github.com/new> (logged in as **saikatnjm**).
2. Repository name: `bd-rail-ticket-alarm`
3. Description: `Rings an alarm the second Bangladesh Railway tickets go on sale — Brave/Chrome extension`
4. Visibility: **Public**
5. Do **not** tick “Add a README”, “.gitignore” or “license” — the repo must be empty.
6. Press **Create repository**.

### 2. Push the code

The local repository is already committed. In a terminal, run these two commands (your SSH key for GitHub already works on this computer):

```bash
cd "/run/media/saikat/Software (SSD)/claude/saikat/bd_train_chrome_extension" && git remote add origin git@github.com:saikatnjm/bd-rail-ticket-alarm.git
```

```bash
cd "/run/media/saikat/Software (SSD)/claude/saikat/bd_train_chrome_extension" && git push -u origin main
```

### 3. Turn on GitHub Pages (the documentation website)

1. On the repo page: **Settings → Pages**.
2. Source: **Deploy from a branch**.
3. Branch: **main**, folder: **/docs** → **Save**.
4. Wait 1–2 minutes, then open <https://saikatnjm.github.io/bd-rail-ticket-alarm/>.
   Check these also open:
   - <https://saikatnjm.github.io/bd-rail-ticket-alarm/bn.html>
   - <https://saikatnjm.github.io/bd-rail-ticket-alarm/privacy.html>

### 4. Repo extras (optional, nice to have)

- On the repo page, click the ⚙ next to **About**:
  - Website: `https://saikatnjm.github.io/bd-rail-ticket-alarm/`
  - Topics: `bangladesh`, `railway`, `chrome-extension`, `brave`, `train-ticket`, `bangla`
- **Create a release** (so people can download a ready zip):
  1. Run `./build-zip.sh` (see Part 2, step 1).
  2. Repo → **Releases → Draft a new release** → tag `v1.0.0` → title `v1.0.0`.
  3. Attach `webstore/bd-rail-ticket-alarm.zip` (keep that exact name — the docs link to `releases/latest/download/bd-rail-ticket-alarm.zip`) → **Publish release**.

---

## Part 2 — Chrome Web Store, unlisted (about 30 minutes + review time)

### 1. Build the zip

```bash
cd "/run/media/saikat/Software (SSD)/claude/saikat/bd_train_chrome_extension" && ./build-zip.sh
```

It creates `webstore/bd-rail-ticket-alarm-<version>.zip` with only the extension files.

### 2. Register as a developer (one time)

1. Go to <https://chrome.google.com/webstore/devconsole>.
2. Sign in with your Google account. **2-Step Verification must be on** for that account.
3. Accept the developer agreement and pay the **one-time US $5 fee**.
   Bangladeshi cards: international/e-commerce use often has to be switched on in your bank's app first. A dual-currency card works best.
4. Fill in **Account**: publisher name (e.g. `Saikat Roy`) and contact email, and verify the email.

### 3. Upload

1. Dashboard → **Items → + New item**.
2. Upload the zip from step 1.

### 4. Fill in the tabs

Open `webstore/STORE-LISTING.md` and copy each field:

1. **Store listing**: description, category, language, icon, 4 screenshots, small promo tile, homepage and support URLs.
2. **Privacy**: single purpose, one justification per permission, “No remote code”, the two data-type ticks, the three certifications, privacy-policy URL.
3. **Distribution**: Free, **Unlisted**, all regions.
4. **Test instructions** (optional): paste the reviewer note.

### 5. Submit

1. Press **Submit for review**.
2. Leave “Publish automatically after review” ticked (unlisted means only people with the link see it anyway).
3. Review usually takes a few days. Extensions with site access can take a week or two.

### 6. After approval

1. Open the item in the dashboard and copy its store link (`https://chromewebstore.google.com/detail/...`).
2. Install it in Brave from that link.
3. Remove the old “Load unpacked” copy from `brave://extensions` **after** your important runs —
   the store copy is a separate install, so you'll need to set your trip up again in it.
4. Put the store link in the docs: in `docs/index.html` and `docs/bn.html`, find the “Chrome Web Store” section and add the link. Commit and push.

---

## Updating later

1. Change the code.
2. Raise `"version"` in `shohoz-autobook/manifest.json` (e.g. `1.0.0` → `1.0.1`).
3. `./build-zip.sh`
4. Store dashboard → your item → **Package → Upload new package** → **Submit for review**.
5. Commit, push, and add a GitHub release with the new zip.

---

## If the review is rejected

The email names a policy. Common ones and fixes:

| Rejection | Fix |
|---|---|
| “Excessive permissions” | Reply quoting the justifications; every permission is used. `tabs` is the usual one — it's needed to open/reuse the ticket tab. |
| “Missing privacy policy / data disclosure mismatch” | Make sure the Privacy tab ticks match `privacy.html`, and the policy URL opens. |
| “Spam / misleading” | Check the description doesn't promise automatic booking or guaranteed tickets. |
| “Functionality not testable” | Point to the Test instructions; the panel, calendar and alarm work without an account. |

You can fix and resubmit as many times as needed.
