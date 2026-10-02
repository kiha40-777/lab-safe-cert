# Deployment

Lab Safe Cert is one Node.js server process. It keeps all its data (names, results, questions, study PDFs, passwords in
hashed form, logins) in a single folder, by default `./data`. That is what decides where it can run: **it needs a place
where files written to disk are still there tomorrow.**

| Where | Fit | Notes |
|---|---|---|
| Your own PC or a lab computer, `npm start` / `start-lan` | Best for most teams | Free. People connect over the same Wi-Fi/LAN. See the README. |
| A small VPS or a server you control, Node.js or Docker | Good | You get a stable address and can add HTTPS. |
| A container platform with a **persistent volume** | Good | Use the `Dockerfile`; mount a volume at `/data`. Many such platforms charge for volumes and none was tested here. |
| **Vercel / Netlify** | **Does not work as is** | See [below](#vercel-netlify-and-other-serverless-hosts). |
| GitLab Pages / GitHub Pages / any static host | Does not work | There is a server, not just files. |

**What was verified for this document:** the production build was run with `node server.js` (the same layout as the
Docker image: the "standalone" build output plus `.next/static`) on macOS with Node.js 24.21, and served pages, a static
file, the health check and an admin login. The `Dockerfile` and `docker-compose.yml` were **not built or run** (no
Docker was available), the reverse-proxy snippets below were **not tested**, and no hosting platform was tried.

## 1. On your own computer

See the README's Quick start. In short: install Node.js (22.13+, LTS 24 recommended), double-click `start.bat` /
`start.command` (only this computer) or `start-lan.bat` / `start-lan.command` (other devices on the network too), or
run `npm ci && npm run build && npm start` (`npm run start:lan`).

Keep the computer on and the window open while people take tests. Use the LAN address that the window prints. Consider
giving that computer a fixed address in your router so the link stays the same.

## 2. Docker

```bash
docker compose up --build -d      # build and start in the background
docker compose logs app           # shows the first-start admin password (only once)
docker compose down               # stop; the volume with the data stays
```

- The container listens on port 3000; change the host port with `PORT=8080` in a `.env` file next to
  `docker-compose.yml`.
- Data lives in the named volume `lab-safe-cert-data` (mounted at `/data`). Back it up (see below).
- Set `ADMIN_PASSWORD` / `PARTICIPANT_PASSWORD` in `.env` if you do not want the generated/admin-screen passwords.
  Never commit `.env`.
- The image runs as an unprivileged user and has a health check on `/api/health`.
- Without compose: `docker build -t lab-safe-cert .` and
  `docker run -d -p 3000:3000 -v lab-safe-cert-data:/data -e ADMIN_PASSWORD=... lab-safe-cert`.

## 3. Any Node.js host

Requirements: Node.js 22.13 or newer, a persistent folder for `DATA_DIR`, and the environment variables you need
(see `.env.example`).

```bash
npm ci
npm run build
DATA_DIR=/var/lib/lab-safe-cert PORT=3000 npm start -- --lan     # or: node scripts/launch.mjs --lan --port 3000
```

Run it under a process manager (systemd, pm2, ...) so that it restarts after a reboot. Example systemd unit
(untested):

```ini
[Unit]
Description=Lab Safe Cert
After=network.target

[Service]
WorkingDirectory=/opt/lab-safe-cert
Environment=DATA_DIR=/var/lib/lab-safe-cert
Environment=ADMIN_PASSWORD=change-me
Environment=TRUST_PROXY=1
ExecStart=/usr/bin/node scripts/launch.mjs --port 3000
Restart=on-failure
User=labsafe

[Install]
WantedBy=multi-user.target
```

## 4. Container platforms (Fly.io, Railway, Render, and similar)

Requirements for any of them: build from the `Dockerfile`; expose port 3000; **attach a persistent volume mounted at
`/data`**; set `ADMIN_PASSWORD` (the log of a fresh container is easy to lose), optionally `PARTICIPANT_PASSWORD`, and
`TRUST_PROXY=1` (the platform puts a proxy in front); use `/api/health` as the health check. Free tiers usually have
temporary disks: **if the disk is temporary, everything is lost at every restart.** Check the current terms of the
platform; none of them was tested for this project.

## 5. HTTPS and reverse proxies

Plain `http` is fine on a trusted local network. Anything reachable from the internet needs HTTPS, because passwords are
sent when logging in. Put a reverse proxy in front, and tell the app to trust it:

- `TRUST_PROXY=1`: the app then uses `X-Forwarded-Host` (to check where requests come from), `X-Forwarded-Proto`
  (cookies get the `Secure` flag) and `X-Forwarded-For` (login attempts are limited per address). **Only set it when a
  proxy you control is in front**, because otherwise clients could forge these headers. (Without it, login attempts
  are limited for all clients together, which cannot be circumvented by forged headers.)
- `COOKIE_SECURE=1` forces the `Secure` flag even without a proxy header.

Caddy (obtains and renews certificates by itself; untested here):

```
quiz.example.org {
    reverse_proxy localhost:3000
}
```

nginx (untested; note `client_max_body_size`, its default of 1 MB would block PDF uploads):

```nginx
server {
    listen 443 ssl;
    server_name quiz.example.org;
    client_max_body_size 30m;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## 6. Backups and restore

Everything is in `DATA_DIR` (`app.db`, a SQLite file, holds all of it, including the PDFs).

- **Backup**: stop the app (or at least make sure nobody is using it) and copy the folder. For Docker, for example:
  `docker run --rm -v lab-safe-cert-data:/data -v "$PWD":/backup alpine tar czf /backup/lab-safe-cert-data.tgz -C /data .`
- **Restore**: stop the app and put the files back in `DATA_DIR`.
- For a record of results that is independent of the software, use *Download results (CSV)* in the admin screen.
- The data contains people's names. Store backups as carefully as the original.

## 7. Updating

```bash
git pull
npm start                      # notices what changed, reinstalls/rebuilds if needed, then starts
```

The start script (`scripts/launch.mjs`) compares the installed packages and the build with `package-lock.json` and the
source files on every start, so "pull, then start" is enough; `--rebuild` forces a rebuild. **On a server** you may prefer to
build first (`npm ci && npm run build`) and start with `--no-rebuild`, so that a start never waits for a build. The data
folder is always kept.

The database format is upgraded automatically at start-up by numbered migrations
([`src/server/db/migrations.ts`](../src/server/db/migrations.ts)). Take a backup before updating. With Docker:
`git pull && docker compose up --build -d`.

## 8. Settings that need a rebuild

`config/certification.json` (levels, questions per test, pass mark, choice limits) and the language files are part of the
build. After changing them start the app again (the start script rebuilds by itself), or run `npm run build`; with Docker rebuild the image.

## Vercel, Netlify and other serverless hosts

These platforms run your code as short-lived functions on machines whose disk is read-only or thrown away after use.
Lab Safe Cert stores its SQLite file and the PDFs on disk, so on such a platform the data would vanish, uploads
would fail, and the first-start password printed in a log would be lost. **Do not deploy it there as it is.**

What it would take (not done in this repository):

1. **A hosted database** replacing SQLite. All data access goes through the small `Db` interface in
   [`src/server/db/types.ts`](../src/server/db/types.ts) (async `all` / `get` / `run` / `transaction`), and the SQL in the
   services deliberately sticks to a portable subset (text ids, ISO-8601 text timestamps, `?` placeholders, `ON CONFLICT`
   upserts). A Postgres adapter (for example for Neon, which both Vercel and Netlify can provision) would implement this
   interface and its own migrations; the schema uses a binary column only for the PDFs.
2. **PDF storage without local disk and within request limits.** Vercel functions accept request bodies of only about
   4.5 MB (check the platform's current limits), so PDFs would have to be uploaded in pieces (or go to the platform's blob storage), and served back piece by piece.
3. **Nothing that lives in server memory.** The login rate limiter is in memory (per server instance) and would need
   to move into the database; sessions are already stored in the database.
4. **Passwords from environment variables** (`ADMIN_PASSWORD`, `PARTICIPANT_PASSWORD`), since there is no terminal to
   read a generated one from.

Nobody has done or tested this; treat it as a design note. Alternatively, run the app on a small VPS or a container
platform with a volume, which needs none of these changes.

## Health check

`GET /api/health` returns `{"ok":true}` without a login once the server and its database are ready. It reveals nothing else.
