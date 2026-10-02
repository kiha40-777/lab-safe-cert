# Getting started on a Mac (step by step)

For people who have never used a terminal. The first time takes about 15 minutes, most of it waiting for downloads.
When something goes wrong, see [Troubleshooting](#troubleshooting) at the end.

> This guide is for macOS. A Windows guide has not been written; the README's Quick start mentions `start.bat`, which
> has not been tested.

**You need:** a Mac (Apple silicon or Intel), an internet connection, and about 1 GB of free disk space.

## Step 1: Install Node.js (once per Mac)

Node.js is the program that runs the app.

1. Open <https://nodejs.org/> in your browser.
2. Click the green **Download Node.js (LTS)** button. This downloads an installer (a `.pkg` file).
3. Open the downloaded file and click *Continue* / *Agree* / *Install*. The Mac asks for your password. Click *Close* at the end.
4. Check it: open **Terminal** (press `Cmd` + `Space`, type `Terminal`, press `Enter`), type the following and press `Enter`:

   ```bash
   node --version
   ```

   It should print a version number such as `v24.21.0`. Any version from `v22.13` upwards works; the LTS version is the one to take.
   If it says `command not found`, close *all* Terminal windows, open a new one and try again.

## Step 2: Get the code

Pick **one** of the two ways.

**A. Download a ZIP (no extra tools needed).** On the project's GitLab page click the blue **Code** button, then
*Download source code* → **zip** (the exact wording depends on the GitLab version). Double-click the ZIP in your
*Downloads* folder. A folder such as `lab-safe-cert-main` appears. Move it to a place you will find again (for example
*Documents*) and keep it there: **your data will be stored inside this folder.**

**B. `git clone`.** In Terminal:

```bash
cd ~/Documents
```
```bash
git clone https://gitlab.igem.org/2026/software/waseda-tokyo/lab-safe-cert.git
```

If the Mac offers to install the *command line developer tools*, click **Install**, wait a few minutes, and run the
`git clone` line again. If GitLab asks for a user name and password (or an access token), the repository is not public
(yet): use an account that has access.

## Step 3: Start the app

**If you used `git clone`:** open the `lab-safe-cert` folder in Finder and **double-click `start.command`**. A Terminal
window opens.

**If you downloaded the ZIP:** macOS often refuses to open files that came from the internet ("start.command cannot be
opened", "Apple could not verify ..."). Use Terminal instead; it always works:

1. Open **Terminal**.
2. Type `cd ` (the letters c, d and **one space**), but do **not** press `Enter` yet.
3. Drag the `lab-safe-cert-main` folder from Finder into the Terminal window. Its path is typed for you. Now press `Enter`.
4. Type this and press `Enter`:

   ```bash
   sh start.sh
   ```

The **first start** installs what the app needs and builds it. This takes a few minutes and prints a lot of text,
including yellow `npm warn` lines; that is normal. Do not close the window.

When you see a framed text **ADMIN PASSWORD** with a password like `abcd-efgh-jkmn`, **write it down**: it is shown only
once. Later the window shows the addresses of the app. Leave the window open while the app is in use.

## Step 4: Use the app

1. Open **<http://localhost:3000/admin>** in your browser and log in with the admin password.
2. Follow [First-time setup](../README.md#first-time-setup-administrator): create the participant password under
   *Settings*, upload the study PDFs and question files under *Tests and questions*, add your team under *Members*.
3. Team members open **<http://localhost:3000/>** (on this Mac) and use the participant password.

## Letting the rest of the team join

`localhost` only works on the Mac that runs the app. To let other people use their own computers or phones on the same
Wi-Fi/LAN:

1. Stop the app (click into its window and press `Ctrl` + `C`, or close the window).
2. Start it in *sharing* mode: double-click **`start-lan.command`**, or in Terminal:

   ```bash
   sh start.sh --lan
   ```
3. The window prints a line such as `Share this URL: http://192.168.0.9:3000`. Give that address to the others.
4. If the macOS firewall is switched on, it may ask *"Do you want the application “node” to accept incoming network
   connections?"*: click **Allow**.

While people take the test, keep the Mac **switched on, awake and connected**. In *System Settings* you can stop it
from sleeping (for example under *Lock Screen* / *Battery*), or run `caffeinate` in a second Terminal window.
The address uses plain `http` and works only inside that network. Some guest or school Wi-Fi networks block
connections between devices; a phone hotspot or a cable network works around that.

## Next time

Double-click `start.command` again (or run `sh start.sh` in the folder). Everything is kept in the `data` folder inside the
project folder: copy it somewhere safe (with the app stopped) to make a backup.

**Updating to a newer version:**

- *git clone:* in Terminal, `cd` to the folder, run `git pull`, then start as usual. The start script notices the change
  and reinstalls/rebuilds by itself; your data stays.
- *ZIP:* download the new ZIP, copy the `data` folder from the old project folder into the new one, and start from the new one.

## Troubleshooting

| Problem | What to do |
|---|---|
| `command not found: node` | Do Step 1; then close all Terminal windows and open a new one. |
| `command not found: git` | Choose *Install* when the Mac offers the developer tools, or use the ZIP way. |
| macOS refuses to open `start.command` | Use the Terminal way in Step 3 (`sh start.sh`). Alternatively open *System Settings → Privacy & Security* and click **Open Anyway** next to the message about `start.command`. |
| `permission denied` | Run `sh start.sh` instead of `./start.command`. |
| Yellow `npm warn EBADENGINE` lines | Your Node.js is old or is not the LTS version. Install the LTS version from nodejs.org (recommended, not required). |
| The first start fails while downloading (`ENOTFOUND`, `ETIMEDOUT`, ...) | Check the internet connection (some school or company networks block downloads), then start again; it continues where it stopped. |
| `EADDRINUSE` or "port 3000 is in use" | Use another port: `sh start.sh --port 3100`, then open `http://localhost:3100/admin`. |
| The admin password was not noted or is lost | Stop the app and run `sh start.sh --reset-admin-password`; a new password is printed. |
| The browser cannot connect | The Terminal window must still be open and the app running. Check that the address and port are the ones the window shows. |
| Others cannot connect | Use the sharing mode (see above), make sure everybody is on the same network, and click **Allow** when macOS asks about incoming connections. |

The app was tested with Chromium-based browsers (Chrome, Edge, Brave). Safari and Firefox should work but were not tested.
