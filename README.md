# Team Waseda-Tokyo 2026 Software

If your team competes in the [**Software & AI** village](https://villages.igem.org) or wants to
apply for the [**Best Software** award](https://competition.igem.org/judging/awards/special), you **MUST** host all the
source code of your team's software tool in this repository, `main` branch. By the **Wiki Freeze**, a
[release](https://docs.gitlab.com/ee/user/project/releases/) will be automatically created as the judging artifact of
this software tool. You will be able to keep working on your software after the Grand Jamboree.

See the [Software Project](https://teams.igem.org/go/deliverables/software) page for the full requirements (including the
open-source license requirement; note that **Software & AI** village teams are not eligible for the Best Software award).

> If your team does not have any software tool, you can totally ignore this repository. If left unchanged, this
repository will be automatically deleted by the end of the season.

> **Using an AI assistant (e.g. Claude Code)?** Please read [.claude/RESPONSIBLE_AI_USE.md](.claude/RESPONSIBLE_AI_USE.md) first. You remain fully responsible for everything you commit: don't misrepresent what your tool does, never commit secrets, and review every change.

## Description

**Lab Safe Cert** is a web application that runs the knowledge tests of a laboratory-safety certification
system and lets an administrator follow everybody's progress. It was made by iGEM Waseda-Tokyo 2026 as a
contribution for other iGEM teams: you can run it on your own computer or deploy your own copy, and adapt it to
your own safety rules.

The certification system has three levels. People move up by passing a test with the required score:

```
Candidate  --(Participant Certification Test)-->  Participant  --(Supervisor Certification Test)-->  Supervisor
```

The online lecture and the hands-on training that come before and between the tests are *not* part of this
software; it covers the two tests and the record keeping.

**Who is it for?**

- **Administrators** (in Waseda-Tokyo's system: the experiment supervisors) who prepare the tests, register the
  team and check who is certified. Only the administrator password is needed for this.
- **Team members** who read the study material and take the tests, from a PC or a phone. They need the shared
  participant password and choose their name from a list.
- **Other iGEM teams** who want the same kind of certification: everything that is specific to one team
  (number of questions, pass mark, level names, languages, question texts) is data or configuration, not code.

### Features

| Screen | What it does |
|---|---|
| **Test screen** (`/`) | Password lock → choose your name (or "Other" to type it) → the study PDF for your level → a test of randomly chosen, shuffled questions (30 of 60 by default) → score, verdict, and for every question the choices, your answer and the correct answer → the study PDF again → retake. An unfinished test resumes after a page reload. |
| **Admin screen** (`/admin`) | Password lock → upload the study PDF of each test → copy a ready-made prompt (English) for an external AI chat → import the question file (JSON) and get it checked with clear messages → review and edit the four-choice questions, confirm the review, save → register team members (one by one or a whole list) → progress table with roles and scores, per-person history with every answer, CSV export → change passwords. |
| **Both** | Interface language switch (English / 日本語; more languages are one file each). Works on phones (large tap targets), keyboard-operable, light and dark mode. |

Design points that matter for a certification test:

- Grading happens on the server. The correct answers are never sent to the browser before a test is handed in.
- A result keeps a copy of the questions as they were asked, so replacing the question bank later does not
  change past results.
- The ladder (roles and tests), number of questions, pass mark and number of choices are set in
  [`config/certification.json`](config/certification.json). Levels can be added, removed or re-ordered there (their display
  names live in the language files).

### Limitations (please read)

- **Identity is self-declared.** People pick their name from a list; nobody proves who they are. Everyone who
  takes a test shares one participant password. This is meant for a team that trusts each other (like a lab
  safety briefing), not for high-stakes exams.
- **The app cannot judge whether the questions are correct.** It checks the *format* of a question file and warns
  about typical mistakes, but a person must check every question against the study material
  (see [AI usage](#ai-usage-disclosure)).
- One study PDF and one question bank per test; single-answer multiple choice only (no images, no
  "select all that apply").
- Data is kept in one SQLite file on one computer/server. There is no user-account system and no e-mail.

## AI usage disclosure

*(Required by iGEM for software that uses AI. The short version: this software does not contain or call any AI
model; it only helps a human work with one.)*

**What the software does with AI: nothing at run time.** It has no AI model, no API key, and makes no request
to any AI service, from the server or from the browser.

**Where AI is used around it (by people, outside the software):**

- The admin screen produces a *prompt* ([`src/lib/prompt/build.ts`](src/lib/prompt/build.ts)). The administrator
  pastes it, together with the study PDF, into an AI chat of their own choice (ChatGPT, Claude, Gemini, an
  open-weight model, ...), and imports the JSON that the AI returns. Which model to use is the team's decision.
- The prompt tells the AI to use *only* the PDF, not to invent facts or numbers, to avoid choices that break
  when shuffled, and to give a short explanation and a page/heading for every question so that a person can
  verify it.

**Safeguards built into the software:**

- Questions are not saved unless the administrator ticks, after reviewing and editing them, that *a person has
  checked every question and its correct answer against the study material*; this is asked for every save, and the
  moment of that confirmation is stored.
- The file may say which AI model or tool made it (`meta.generator`). This is stored and shown in the admin
  screen, so it stays visible which questions were machine-drafted.
- The checker reports errors (for example a numeric answer, duplicate choices, too few questions) and warnings for
  typical AI habits ("all of the above" choices, choices that refer to other choices by letter, the same correct
  letter far too often, repeated questions).

**Evaluation and known limitations.** The software does not measure the quality of AI-written questions. AI models
can make up facts, mark a wrong choice as correct, write ambiguous or too-easy wrong choices, prefer certain answer
letters, or write awkward text in some languages. Human review is therefore mandatory; the format checks only catch
mechanical problems. There is no training or fine-tuning data in this repository.

**Question set used in Team Waseda-Tokyo 2026's demonstration** *(to be completed by the team; the software cannot
know this)*:

| Item | Value |
|---|---|
| AI model and version used to draft the questions | |
| Date | |
| Study PDF the questions are based on | |
| Who reviewed the questions, and how | |

**AI-assisted development.** Parts of the source code, tests and documentation of this repository were written with
the help of an AI coding assistant (Claude Code with Anthropic's Claude Sonnet 5.5). The team is responsible for
having reviewed and understood them; see [.claude/RESPONSIBLE_AI_USE.md](.claude/RESPONSIBLE_AI_USE.md).

## Installation

### What you need

- A computer with **Node.js 22.13 or newer**. The current LTS version (24) is recommended.
  Download it from <https://nodejs.org/> (click the green "LTS" button and accept the defaults).
  Check with `node --version`.
- An internet connection for the first start (several hundred MB of packages are downloaded and unpacked once; about 0.5 GB on disk).
- Nothing else: there is no separate database or web server to install.

### Quick start (no command line needed)

1. **Get the code.** Either `git clone https://gitlab.igem.org/2026/software/waseda-tokyo/lab-safe-cert.git`, or
   download the repository as a ZIP file from GitLab and unzip it.
2. **Start it.**
   - Windows: double-click `start.bat`.
   - macOS: double-click `start.command`. (If macOS refuses to open it, which is common for a ZIP download, open
     Terminal in the folder and run `sh start.sh`.)
   - Linux or Terminal: `./start.sh` (or `sh start.sh`)
3. The **first start** installs the packages and builds the app; this takes a few minutes. A window (terminal)
   stays open while the app runs; closing it stops the app.
4. When it says *ADMIN PASSWORD*, **write the password down**. It is shown only once (see
   [Troubleshooting](#troubleshooting) if it is lost).
5. Open <http://localhost:3000/admin> in your browser and log in with that password. Then continue with
   [First-time setup](#first-time-setup-administrator).

**Never used a terminal? A step-by-step guide for macOS** (installing Node.js, downloading the code, what to do when
macOS blocks the start file) is in [docs/GETTING_STARTED_MAC.md](docs/GETTING_STARTED_MAC.md).

The same steps in a terminal, if you prefer:

```bash
npm ci            # installs the exact versions from package-lock.json
npm run build     # builds the app
npm start         # starts it at http://localhost:3000 (this computer only)
```

### Letting the team use it

`npm start` only accepts connections from the same computer. To let others on the same network (same Wi-Fi or
LAN) open it on their own devices, start it with `start-lan.bat` / `start-lan.command`, or `npm run start:lan`.
The window prints the address to share, for example `http://192.168.1.23:3000`. Keep that computer switched on
and the window open while people take the test.

Notes: that address is not encrypted (plain `http`) and works only inside the network. Your firewall may ask
whether to allow Node.js to accept connections: allow it for private networks. To reach the app from the internet,
[deploy it](#deployment) with HTTPS.

### Docker

```bash
docker compose up --build -d
docker compose logs app        # the first-start admin password is printed here
```

The app is then at <http://localhost:3000>. Data is kept in the Docker volume `lab-safe-cert-data`.
(The `Dockerfile` has **not been built or run** yet. Its build output was started with `node server.js`, the way the
image does, and answered correctly; see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).)

### Troubleshooting

| Problem | What to do |
|---|---|
| "Node.js is not installed" / `node` not found | Install Node.js LTS from <https://nodejs.org/>, then open a *new* window and try again. |
| "Node.js ... is too old" | Install a newer Node.js (22.13 or newer; LTS 24 recommended). |
| Yellow `npm warn EBADENGINE` lines | Your Node.js is old or not the LTS version. It still works, but installing the LTS version from <https://nodejs.org/> is recommended. |
| macOS says `start.command` cannot be opened | Run `sh start.sh` in Terminal in the project folder, see [docs/GETTING_STARTED_MAC.md](docs/GETTING_STARTED_MAC.md). |
| The admin password was lost or never seen | Stop the app, then run `npm start -- --reset-admin-password`. A new password is printed. (Nothing else is changed.) |
| Port 3000 is in use | `npm start -- --port 3100` |
| Yellow `npm warn` lines during install (for example about `eslint` being deprecated or "install-scripts") | Harmless. They come from developer tools that are not used when running the app. |
| A line "SQLite is an experimental feature" appears when running tests or your own scripts | Expected: the app uses the SQLite that is built into Node.js, which Node.js still labels "experimental". The start scripts hide this notice. |
| The PDF does not show inside the page on a phone | Use the "Open in a new tab" link under the PDF. Some phone browsers show only the first page inside a frame. |
| Others cannot open the address | Use the LAN start, check both devices are on the same network, and allow Node.js in the firewall. |

## Usage

### First-time setup (administrator)

1. **Admin screen** (`/admin`) → *Settings*: create the **participant password** ("generate" makes a random one).
   Share it with your team; it is shown only once. Optionally change the admin password.
2. *Members*: add your team (one by one, or paste a list with one name per line). New people start as
   *Candidate*. People who are missing from the list can also type their own name on the test screen; they are
   listed here with a "typed their own name" mark until you check them.
3. *Tests and questions* → choose the test (*Participant Certification Test* first). For each test:
   1. **Study material**: upload the PDF that people must read.
   2. **Ask an AI to draft the questions**: copy the prompt, open an AI chat, attach the same PDF, paste the
      prompt, and save the JSON that the AI answers with. (Or write the question file yourself; the format is in
      [docs/QUESTION_FORMAT.md](docs/QUESTION_FORMAT.md).)
   3. **Import the questions**: upload or paste the JSON. Read the messages and fix the file if it reports errors
      (every question must have exactly four choices). Nothing is saved yet; the checked file is opened in the next step.
   4. **Review and edit**: skim the list (correct answers are shown), open a question to fix a text or the correct
      answer, then tick the confirmation and save. The confirmation means that *you checked every question and its
      correct answer against the study material*. Please do.
4. Repeat for the *Supervisor Certification Test*.
5. Give the address of the test screen (for example `http://192.168.1.23:3000`) to your team.

### Taking a test (participants)

1. Open the address, enter the participant password, choose your name (or "Other" and type it).
2. Read the study PDF, then press **Start the test**. Answer with the buttons; your answers are saved
   automatically, so a reload or a lost connection does not lose them. Press **Hand in** when finished (unanswered
   questions count as wrong).
3. You see your score, whether you passed, and every question with your answer and the correct one. If you
   passed, your level goes up automatically. If not, read the material again and retake the test (there is no
   limit on attempts).

### Everyday administrator tasks

- **Progress**: *Progress* (in the left-hand menu) lists everybody with their level, attempts, best and latest score. Click a
  name for their history and every answer they gave. *Download results (CSV)* opens in Excel (Japanese names
  included).
- **Fix a role by hand**: *Members* → change the role in the list (for example, someone certified on paper).
- **Replace the questions**: import a new file. Past results are not changed.
- **Change how many questions or the pass mark**: edit [`config/certification.json`](config/certification.json) and
  start the app again (it rebuilds by itself). See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
- **Back up**: stop the app and copy the `data` folder (it contains the database with everything, including the
  PDFs). Restoring means putting the folder back.
- **Update**: `git pull`, then start the app as usual. The start script notices what changed and reinstalls or rebuilds
  by itself (the data is kept).

More detail, with a step-by-step walkthrough of every screen, is in [docs/USER_GUIDE.md](docs/USER_GUIDE.md).

### Reproducing the main results

The "results" of this project are the behaviour of the tests, the grading and the record keeping.

1. **Automated tests** (no browser needed; they create a temporary database each time):

   ```bash
   npm ci
   npm run check     # type check + lint + the automated tests (more than 250)
   ```

   The tests cover the question-file checker, question drawing and grading, passwords and login rate limiting,
   database transactions, every API route (including "no route works without the right login"), language-file
   consistency, and the AI prompt (its example JSON must pass the checker).
2. **Walkthrough with your own material**: follow [First-time setup](#first-time-setup-administrator) with any study
   PDF and a question file (the prompt in the admin screen produces one with an AI chat; docs/QUESTION_FORMAT.md
   shows the format), add yourself as a member, and take the test. The expected behaviour is described in
   [docs/USER_GUIDE.md](docs/USER_GUIDE.md). Getting one question wrong must fail a 100 % test; all correct promotes
   the person to the next level; a reload during a test resumes the same questions.

What was actually run: the automated tests on macOS (Apple silicon) with Node.js 23.11 and 24.21, and the browser
walkthrough (both screens, English and Japanese, desktop, phone-sized and dark-mode windows) with Node.js 24.21 in a
Chromium-based browser. Windows, Linux, Safari, Firefox, real phones, Docker and hosting platforms were **not** tested.

## Configuration

All settings are optional. Copy [`.env.example`](.env.example) to `.env.local` (or set real environment variables,
which is what hosting platforms do) and edit it:

| Variable | Meaning |
|---|---|
| `DATA_DIR` | Folder for the database and uploaded PDFs. Default `./data`. |
| `ADMIN_PASSWORD` | If set, this is the admin password and it cannot be changed in the app. Otherwise one is generated on the first start. |
| `PARTICIPANT_PASSWORD` | If set, this is the participant password (managed here). Otherwise the admin sets it in the admin screen. |
| `TRUST_PROXY` | `1` when the app runs behind a reverse proxy/hosting platform that sets `X-Forwarded-*` headers. |
| `COOKIE_SECURE` | `1` to always mark cookies `Secure` (automatic over HTTPS behind a trusted proxy). |
| `MAX_PDF_MB` | Largest study PDF in MB (default 25). |
| `DEFAULT_LANG` | `en` or `ja`: language for first-time visitors (default: the browser's language). |

Ladder, questions per test, pass mark and choice limits: [`config/certification.json`](config/certification.json).
Interface texts: [`src/locales`](src/locales) (one JSON file per language). The AI prompt:
[`src/lib/prompt/build.ts`](src/lib/prompt/build.ts).

## Deployment

The app is a normal Node.js server that keeps its data in a folder, so it needs a host with **persistent storage**:
your own PC or a lab computer (see above), a small VPS, or any container platform that offers a persistent volume
(the `Dockerfile` is the portable way). Details, HTTPS, backups and hosting notes: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

> **Vercel and Netlify cannot run this app as it is.** Their servers are short-lived and forget any file written
> to disk, so the SQLite database and the uploaded PDFs would disappear. Running there would need the storage layer
> (`src/server/db`) to be replaced by a hosted database; the code is prepared for that (all database access goes
> through one small interface) but no such adapter is included. See docs/DEPLOYMENT.md.

## Security and privacy

- Stored personal data: the names people give, their level and their test results (plus the study PDFs and
  questions). It stays in the data folder of the computer/server that runs the app. Nothing is sent to other services;
  the pages load no external scripts, fonts or images. Next.js's anonymous build telemetry is switched off by the
  start scripts.
- Passwords are stored only as salted `scrypt` hashes. Login sessions are random tokens in `HttpOnly`,
  `SameSite=Strict` cookies (only a hash of the token is stored). Wrong passwords are rate-limited. State-changing
  requests are checked against cross-site forgery. Pages are served with a Content-Security-Policy.
- Uploaded PDFs are only served back to logged-in users, with `nosniff`. The admin is trusted to upload safe files.
- Plain `http` on a local network can be read by others on that network; use HTTPS when going through the internet.
- Keep the software up to date (`npm audit` reported no known vulnerabilities on 2026-09-30).

Please report security problems to the team instead of publishing them.

## Data and large files
Keep this repository for **source code**. For datasets, machine-learning model weights, large media, and other heavy
artifacts, use [Zenodo](https://teams.igem.org/go/deliverables/software/zenodo) — it gives each upload a citable DOI and
is the recommended long-term archive for iGEM teams. Reference your Zenodo records from this README so judges and future
teams can find them.

(This project has no such data. The `data/` folder that the app creates holds names and results and is
excluded from Git on purpose.)

## Contributing

Contributions and questions from other iGEM teams are welcome (open an issue or a merge request). Please keep
in mind the [responsible AI use](.claude/RESPONSIBLE_AI_USE.md) rules of this repository.

Developer commands (Node.js 22.13+, LTS 24 recommended; `nvm use` reads `.nvmrc`):

```bash
npm ci               # install the pinned dependencies
npm run dev          # development server with hot reload at http://localhost:3000
npm run typecheck    # TypeScript
npm run lint         # ESLint
npm test             # Vitest (more than 250 tests)
npm run check        # all three
npm run build        # production build
```

Tech stack: Next.js 16 (App Router) with React 19 and TypeScript, SQLite through Node's built-in `node:sqlite`,
Vitest and ESLint. The only runtime dependencies are `next`, `react` and `react-dom`. Dependency versions are
pinned exactly in `package.json` and `package-lock.json`.

How the code is organised, how to change the pass mark, the level names, the question format or the storage,
and how to add a language: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

### iGEM software requirements checklist

| Requirement | Where |
|---|---|
| Hosted on iGEM's GitLab | This repository (`gitlab.igem.org/2026/software/waseda-tokyo/lab-safe-cert`) |
| README (what, for whom, install, run, reproduce) | This file |
| OSI-approved license | Apache-2.0, see [LICENSE](LICENSE) |
| Reproducible build and run instructions | [Installation](#installation), `Dockerfile`, `npm run check` |
| Pinned dependencies with a committed lockfile | `package.json` (exact versions), `package-lock.json`, `.nvmrc`, `engines` |
| Repository under 50 MB, no compiled binaries | About 1 MB of source; `node_modules`, build output and data are not committed |
| AI use documented | [AI usage disclosure](#ai-usage-disclosure) |

### Third-party software

Runtime: Next.js, React and React DOM (MIT). Development and build tools bring further open-source packages under
MIT, Apache-2.0, ISC, BSD, MPL-2.0 (for example `lightningcss`, `axe-core`), CC-BY-4.0 (`caniuse-lite` data) and
LGPL-3.0 (`@img/sharp-libvips`, an optional part of Next.js's image optimisation that this app does not use). None
of them is copied into this repository.

## Authors and acknowledgment
Developed by **iGEM Waseda-Tokyo 2026** for the safety-education and certification system of the team and as a
contribution for other iGEM teams. *(Team members, advisors and other contributors: please list yourselves here; the
iGEM Attributions Form is a judging requirement.)*

## License
This repository is licensed under the [Apache License 2.0](LICENSE) — a permissive
open-source license recommended for software (Creative Commons licenses are *not*
intended for source code). You are free to use, modify, and distribute this software,
provided you keep the license and attribution notices. If you prefer different terms
for your own tool, you may replace this license, but it must remain an
[OSI-approved open-source license](https://opensource.org/licenses).
