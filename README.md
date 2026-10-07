# n'Qender POS

The till system for the n'Qender coffee bar: tables, rounds, split bills, regular clients, "from the house", expenses, salaries, the calendar, closing the day and monthly reports.

It runs as a Windows desktop app on the bar's mini PC. The owner can also open it from his phone or laptop, from anywhere, through Tailscale.

## How it works

- **The bar PC is the "server".** The app keeps all data in a SQLite database on that PC (`%APPDATA%\nQender POS\data\nqender.db`) and serves the screen to itself on `http://127.0.0.1:4848`.
- **Every screen stays live.** A change on the bar shows up on the owner's phone within a second, and the other way round.
- **Receipts print silently** to the receipt printer chosen in *Zyra → Sistemi* (an 80 mm thermal printer installed in Windows). No print dialog appears.
- **Backups** run every night and after every day close. Each one goes to `%APPDATA%\nQender POS\backups`, plus a copy in `OneDrive\nQender Backups` when OneDrive is signed in. The last 90 are kept.
- **Updates.** The app checks this repo's GitHub Releases, downloads new versions in the background and installs them the next time it restarts.
- **Remote access.** Any device that isn't the bar PC must log in with the owner PIN, and is only reachable over Tailscale or the café's Wi-Fi. Printing and backups can only be started from the bar PC.

## Setting up the bar PC (one time)

1. **Fix the clock.** In *Settings → Time & language → Date & time*, set the time zone to *(UTC+01:00) Belgrade, Bratislava, Budapest, Ljubljana, Prague*, and turn on *Set time automatically*.
2. **Install the receipt printer driver.** The printer should appear in *Settings → Bluetooth & devices → Printers & scanners*. Print a Windows test page once.
3. **Install the app.** Download `nQender-POS-Setup-x.y.z.exe` from the latest release and run it. It installs, starts by itself and opens with Windows from then on.
   - The first time it starts, Windows asks once for admin permission. This adds the firewall rule that lets the owner's phone connect.
4. **In the app, open *Zyra*** (default PIN **1234**) **→ *Sistemi*:**
   - Choose the receipt printer and press *Printo një faturë prove*.
   - Change the owner PIN.
5. **Set up the menu and staff.** In *Zyra → Menaxhimi*, check prices, staff and regular clients. In *Zyra → Pagat*, enter salaries.
6. **Turn on OneDrive.** Sign in to OneDrive with the owner's Microsoft account (free, 5 GB). *Sistemi → Backup* should then show *OneDrive: Po*.
7. **Set up Tailscale** (free):
   - Install Tailscale on the bar PC and sign in with the owner's account (Google login works).
   - Set Tailscale to start with Windows. It does this by default.
   - In the Tailscale admin console, turn off *key expiry* for the bar PC, so it never logs out.

## The owner's phone

1. Install **Tailscale** from the App Store or Play Store and sign in with the **same** account.
2. Open the browser and go to the address shown in *Zyra → Sistemi → Qasja nga larg*, for example `http://bar-pc:4848`.
3. Enter the owner PIN.
4. Add it to the home screen. It then opens like an app:
   - iPhone: *Share → Add to Home Screen*
   - Android: *⋮ → Add to Home screen*

## Shipping a new version

1. Change `version` in `package.json` (e.g. `1.0.1`).
2. Run `npm run build:ui` if the UI changed.
3. Commit and push to `main`.

GitHub Actions sees the new version, builds the installer and publishes the release (tag `v1.0.1`). The bar PC picks it up on its own, usually within a few hours, and installs it on the next restart. You can also press *Instalo tani* in *Sistemi*.

## Restoring data

Use *Zyra → Sistemi → Rikthe të dhënat nga një backup…* and pick a `.db` file, from the backups folder or from OneDrive. The current data is backed up first, then the app restarts with the restored data.

On a brand-new PC:
1. Install the app.
2. Restore the newest file from `OneDrive\nQender Backups`.

## Development

```
npm install
npm run dev               # server only, at http://127.0.0.1:4848 (data in .devdata/)
npm start                 # the full desktop app
npm run build:ui          # rebuild app/index.html from prototype/pos.html
```

The screen design lives in `prototype/pos.html` (the approved prototype). `tools/build-ui.py` turns it into `app/index.html`:
- strips the demo data
- connects it to the server (`tools/boot.js`, `tools/sync.js`)
- adds the *Sistemi* tab
