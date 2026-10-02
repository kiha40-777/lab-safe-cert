# Developer guide

For people who want to understand, change or extend Lab Safe Cert. Everything a team is likely to change (levels, number
of questions, pass mark, languages, the AI prompt) is data or one small module; the recipes are at the end.

- [Design in one page](#design-in-one-page)
- [Directory map](#directory-map)
- [How a request is handled](#how-a-request-is-handled)
- [Data model](#data-model)
- [API reference](#api-reference)
- [Security model](#security-model)
- [Testing](#testing)
- [Recipes: how do I change ...](#recipes)
- [Ideas that were not done](#ideas-that-were-not-done)

## Design in one page

```
 Browser (React, client components)               Server (Next.js route handlers)
 ┌───────────────────────────────┐   JSON/HTTP   ┌──────────────────────────────────────────────┐
 │ src/features/participant  /   │ ────────────► │ src/app/api/**/route.ts   (thin: 5-15 lines) │
 │ src/features/admin  /admin    │ ◄──────────── │   └─ route() wrapper: origin check, login,   │
 │ src/components, src/lib       │   cookies     │      error → JSON                            │
 └───────────────────────────────┘               │ src/server/services/*     (all the logic)    │
                                                  │ src/server/bank/*         (checker, drawing, │
   config/certification.json  ──► both sides      │                            grading)          │
   src/locales/*.json         ──► both sides      │ src/server/db/*           (Db interface,     │
                                                  │                            SQLite, migrations)│
                                                  └──────────────────────────────────────────────┘
                                                           │ node:sqlite
                                                       data/app.db
```

Principles that shaped the code:

1. **The server decides.** Questions are drawn, shuffled and graded on the server; the browser only ever receives
   questions without answers. People move up a level only inside the grading transaction (an admin can also set a level
   by hand).
2. **Framework-independent logic.** Everything under `src/server` except `locale.ts` (which reads the request headers via
   `next/headers`) is plain TypeScript that receives an `AppContext` (`db`, `config`, `env`, clock, random generator, login
   rate limiter). Tests build a context with an in-memory database, a fake clock and a seeded random generator.
3. **Configuration and text are data.** `config/certification.json` (levels and tests), `src/locales/*.json` (interface
   texts), `src/lib/prompt/build.ts` (AI prompt). Compilers and tests keep them consistent.
4. **Replaceable storage.** All SQL goes through `Db` (`src/server/db/types.ts`), and stays in a portable subset.
5. **Few dependencies.** Runtime: `next`, `react`, `react-dom`. No ORM, no UI library, no state library, no validation
   library (a small `input.ts` reads request bodies), no CSS framework.

Notable decisions:

| Decision | Reason |
|---|---|
| Route Handlers instead of Server Actions | They take a plain `Request`, so tests can call them directly, and the JSON API is documented and reusable. |
| Logic in `src/server/services` | Testable without Next.js; route files stay thin. |
| `node:sqlite` (built into Node 22.13+) | No native module to compile: `npm ci` cannot fail on a missing compiler. It is still labelled experimental by Node.js, which is why all access is isolated in `src/server/db/sqlite.ts`. |
| One in-process mutex around SQLite | `Db.transaction` is async; the mutex keeps statements of different requests from interleaving inside a transaction. |
| Correct answer as a **letter** in the JSON | Avoids the 0-/1-based ambiguity that AI-made files suffer from. |
| Attempts store a **snapshot** of the drawn questions | Results stay readable and gradable after the bank is edited or replaced; resuming gives the same questions. |
| IDs are random UUID text, timestamps ISO-8601 text | Portable between SQLite and Postgres; sorting works as text. |
| Scoped, in-memory login rate limiter | Direct connections cannot be told apart reliably (forged `X-Forwarded-For`), so failures are counted for all clients together; per address only behind a trusted proxy. |
| The interface language is chosen in the browser | No language in URLs; a cookie remembers it and the server renders the right `<html lang>`. |

## Directory map

```
config/certification.json      levels (roles), tests, questions per test, pass mark, choice limits
docs/                          these guides
scripts/                       launch.mjs (start/build/install), next.mjs (dev/build wrapper), lib.mjs
src/
  instrumentation.ts           runs once at server start: opens the DB, migrations, first-start admin password
  app/                         Next.js App Router
    layout.tsx, page.tsx       the shell and the test screen ("/")
    admin/page.tsx             the admin screen
    api/**/route.ts            the JSON API (see below)
    globals.css                design tokens, dark mode, shared classes
  components/                  shared UI: header, dialogs, notices, PDF viewer, login form, result review
  features/participant/        test screen: login -> name -> home (PDF) -> test -> result
  features/admin/              admin screen: dashboard, members, tests (PDF/prompt/import/editor), settings
  lib/                         code that runs in the browser AND on the server: types, config, i18n, prompt, API client
    i18n/messages.ts           language registry, typed keys, {placeholders}, plural forms
    prompt/build.ts            the text pasted into an AI chat
  locales/en.json, ja.json     interface texts
  server/                      server-only code (never imported by the browser; ESLint enforces it)
    context.ts                 AppContext and the process-wide instance
    env.ts                     environment variables
    db/                        Db interface, SQLite adapter, migrations
    auth/                      password hashing, sessions, cookies, login rate limiter
    http/                      route() wrapper, body reading, input parsing, errors, file responses
    bank/                      question-file checker, drawing, grading
    services/                  members, attempts, banks, materials, overview, export, settings, ...
test/                          repository-level tests (next.config)
```

Tests sit next to the code as `*.test.ts`.

## How a request is handled

Example: a participant hands in a test, `POST /api/participant/attempts/<id>/submit`.

1. `src/app/api/participant/attempts/[id]/submit/route.ts` exports `POST = route({ auth: "participant" }, handler)`.
2. `route()` (`src/server/http/route.ts`) gets the process-wide `AppContext` (opening the database on first use), rejects
   requests that came from another site (`Sec-Fetch-Site`/`Origin` vs `Host`), requires `Content-Type: application/json`,
   reads both login cookies and looks the sessions up, and answers `401` if the required login is missing.
3. The handler reads the body with the helpers in `http/input.ts` and calls `submitAttempt(ctx, id, memberId, answers)`.
4. `services/attempts.ts` runs one transaction: load the attempt (it must belong to this person and be open), grade the
   stored snapshot, promote the person if they passed and still have the required level, store the result.
5. Errors are `ApiError(status, code, params)`; `route()` turns them into `{ error: { code, params } }`. The browser
   translates `code` with the language files (`errors.<code>`). Unknown errors become `500` with a generic message and
   are logged.

The first request after start-up (or `instrumentation.ts` at start-up, whichever is first) opens
`DATA_DIR/app.db`, applies migrations and makes sure an admin password exists.

## Data model

SQLite, created by `src/server/db/migrations.ts` (numbered, never edit an applied migration; add a new one).

| Table | Content |
|---|---|
| `members` | `id`, `name`, `name_key` (unique, normalised: NFKC, no spaces, lower case), `role`, `self_registered`, timestamps |
| `banks` | one row per test: `questions_json` (normalised questions), `meta_json` (generator, dates, review confirmation), `question_count` |
| `materials` | one row per test: file name, size, sha-256, the PDF itself in `data` (BLOB) |
| `attempts` | `member_id`, `test_id`, `status` (`in_progress`/`submitted`/`abandoned`), `questions_json` (**snapshot** with correct answers, in the order shown), `answers_json`, `score`, `total`, `required_score`, `passed`, `promoted_to`, timestamps |
| `sessions` | `token_hash` (SHA-256 of the cookie token), `scope` (`participant`/`admin`), `member_id`, `expires_at` |
| `settings` | key/value: `admin_password_hash`, `participant_password_hash` (scrypt) |
| `schema_migrations` | which migrations were applied |

`test_id` and `role` are plain text ids from `config/certification.json`; there are no foreign keys to them, so changing the
configuration never needs a migration.

## API reference

All bodies are JSON unless noted; all errors are `{ "error": { "code": "...", "params": { ... } } }`. "P" = participant
login, "A" = admin login (two independent cookies). State-changing requests need `Content-Type: application/json`
(PDF upload: `application/pdf`).

| Method and path | Login | Purpose |
|---|---|---|
| `GET /api/health` | – | `{ ok: true }` when the server and database work |
| `GET /api/auth/status` | – | who is logged in, the chosen person, whether the participant password is set |
| `POST /api/auth/login` | – | `{ scope, password }`; sets the cookie; failures are rate limited (429 + `Retry-After`) |
| `POST /api/auth/logout` | – | `{ scope }` |
| `GET /api/participant/members` | P | names and roles for the "who are you" list |
| `POST /api/participant/identify` | P | `{ memberId }`, `{ newName }` (registers a candidate) or `{ clear: true }` |
| `GET /api/participant/home` | P | person, next test, PDFs, unfinished attempt, recent results |
| `GET /api/participant/materials/{testId}` | P or A | the study PDF (`?download=1` to save it) |
| `POST /api/participant/attempts` | P | `{ testId }`: draws the questions, or returns the unfinished attempt; **no answers in the response** |
| `GET /api/participant/attempts/{id}` | P | questions of an open attempt, or the full result |
| `PUT /api/participant/attempts/{id}/answers` | P | `{ answers }` autosave |
| `POST /api/participant/attempts/{id}/submit` | P | `{ answers }`: grade, promote, return the full result |
| `GET /api/admin/overview` | A | members with statistics, state of each test, recent attempts |
| `POST /api/admin/members`, `POST .../members/bulk` | A | add one / many people |
| `PATCH`/`DELETE /api/admin/members/{id}` | A | edit name/role (also clears "typed their own name"), delete with results |
| `GET /api/admin/members/{id}/attempts`, `GET /api/admin/attempts/{id}` | A | history and full detail |
| `PUT`/`GET`/`DELETE /api/admin/tests/{testId}/material` | A | study PDF (raw body, `X-Filename` header) |
| `POST .../tests/{testId}/bank/validate` | A | `{ text }` or `{ questions }`: check only |
| `GET`/`PUT .../tests/{testId}/bank` | A | read; save (`{ text, reviewConfirmed }` or `{ questions, meta }`); invalid → `422` with the problem list |
| `GET .../tests/{testId}/bank/export` | A | download in the documented file format |
| `GET /api/admin/settings`, `POST .../settings/password` | A | which passwords are set; change (`{ kind, currentPassword, newPassword }` / `{ kind: "participant", generate: true }`) |
| `GET /api/admin/export?type=results\|attempts` | A | CSV download |

## Security model

- Two shared secrets (admin / participant password). Hashed with scrypt (N=16384) and a random salt; compared in NFKC form
  so full-width input still works; environment-provided passwords are compared in constant time.
- Sessions: random 256-bit tokens; only their SHA-256 is stored. Cookies `HttpOnly; SameSite=Strict; Path=/`, `Secure`
  over HTTPS. Participant logins last 24 h, admin logins 8 h. Changing a password ends the other sessions of that kind.
- CSRF: cookies are `SameSite=Strict`; every non-GET request must have `Sec-Fetch-Site`/`Origin` matching the host and a JSON
  or PDF content type (which plain HTML forms cannot send).
- Rate limiting of failed logins (in memory; see the table above).
- All API routes need a login except four public ones; `src/server/api/guards.test.ts` **enumerates every route file and
  fails** if a new route answers a visitor without a login. Add new public routes to its list on purpose.
- Output: React escapes all text (no `dangerouslySetInnerHTML`). CSV cells starting with `= + - @` are neutralised.
  A Content-Security-Policy allows only same-origin resources (`next.config.ts`; a test guards it).
- Uploads: PDFs only (magic bytes), size-limited while streaming; JSON bodies limited to 2 MB.
- Not covered: per-person authentication (identity is by honour), audit logs, password reset by e-mail.

## Testing

```bash
npm test          # Vitest, about a second
npm run check     # typecheck + lint + tests
```

- `src/server/bank/*.test.ts`: checker cases (valid/invalid files, AI habits), drawing (uniformity, answer mapping, seeds),
  grading (pass mark rounding, unanswered).
- `src/server/services/*.test.ts`: members, the attempt life cycle (resume, expiry, double submit, promotion, snapshot),
  passwords, sessions, files, banks, statistics and CSV. They use `makeTestContext()` from `src/server/test-utils.ts`:
  in-memory SQLite, movable clock, seeded random numbers.
- `src/server/db/sqlite.test.ts`: transactions, interleaving, migrations.
- `src/server/api/*.test.ts`: `test-client.ts` loads **every** `src/app/api/**/route.ts` (via Vite's `import.meta.glob`) and
  calls the handlers with real `Request` objects and a cookie jar, without starting a server. They cover login/logout,
  cookies, rate limiting, CSRF, the guard on all routes, and complete flows (admin prepares, a candidate fails, retries,
  is promoted, admin sees it).
- `src/lib/**/*.test.ts`: configuration validation, the language files (same keys and `{placeholders}` in every
  language; a text exists for every error and issue code that the server can send; every role/test has a name), language
  detection, and the AI prompt (its JSON example must pass the checker).
- `test/next-config.test.ts`: security headers, no `X-Powered-By`, and that `agentRules` stays `false` (see below).

Not automated: the browser UI. It was checked by hand (see the README). A good next step is Playwright.

## Recipes

### Change the number of questions, the pass mark or the number of choices

Edit `config/certification.json`:

- `tests[].questionsPerTest` (drawn per attempt), `tests[].expectedBankSize` (a warning if the bank differs),
  `tests[].passRate` (0 < rate ≤ 1; 1 = all correct; required = ceil(rate × questions)),
- `questionBank.minChoices` / `maxChoices` / `preferredChoices`, `shuffle.questions` / `shuffle.choices`.

The file is validated at start-up and in a test. Start the app again afterwards (the start script rebuilds by itself; or `npm run build`). Existing results keep the pass
mark they were graded with (`attempts.required_score`).

### Add, rename or remove a level or a test

The ladder is `roles` (ordered names) plus `tests` (each: `id`, `requiresRole`, `grantsRole`, ...).

1. Add the role id to `roles` and a test to `tests` (each role can lead to at most one test; loops are refused).
2. Add the display names to **every** language file: `roles.<roleId>` and `tests.<testId>.name` (a test fails if one is
   missing).
3. Rebuild. In the admin screen the new test appears with its own PDF, prompt and question bank.

To *rename* a level, only its text in `src/locales/*.json` changes; the id in the config and the database stays.

### Add a language

1. Copy `src/locales/en.json` to `src/locales/<code>.json` and translate the values. Keep every `{placeholder}`.
2. In `src/lib/i18n/messages.ts` add `import xx from "../../locales/xx.json"` and one line to `locales`
   (`xx: { label: "Name in that language", messages: xx satisfies Messages }`).
3. `npm run check`: the compiler and the tests report missing keys and placeholder mismatches. `DEFAULT_LANG=xx` works.

The AI prompt exists in English and Japanese only (`src/lib/prompt/build.ts`); other languages can be added there
(`PromptLanguage`, one function).

### Change the AI prompt

Edit `src/lib/prompt/build.ts`. Keep the described JSON structure identical to what `validate.ts` accepts;
`src/lib/prompt/build.test.ts` checks that the example in the prompt passes the checker.

### Change the question format

For example several correct answers, images, or another field.

1. Decide the new `schema_version` (2). Keep accepting version 1 files and existing stored data.
2. `src/server/bank/types.ts` (stored form) and `validate.ts` (file → stored form, with new issue codes).
3. `grading.ts` (`DrawnQuestion`, `gradeAnswers`) and `services/attempts.ts` (`parseAnswerList`, result building). Old attempts
   have the old snapshot format in `attempts.questions_json`: keep reading them.
4. `src/lib/types.ts` (DTOs), then the UI: `TestView.tsx`, `ResultReview.tsx`, `BankEditor.tsx`.
5. Stored banks are JSON (`banks.questions_json`): add a migration or convert on read.
6. Add the new issue codes to both language files (a test makes you), update the prompt, `docs/QUESTION_FORMAT.md`, and the
   tests.

### Change the storage (for example to Postgres)

Implement `Db` (`src/server/db/types.ts`): `all`, `get`, `run` with `?` placeholders (convert to `$1...`), `transaction`
(a real transaction; use only `tx` inside), plus your own migrations (the SQL in `migrations.ts` is SQLite flavoured: BLOB
vs BYTEA, `INTEGER` booleans). Select it in `startApp()` in `src/server/context.ts` (for example from `DATABASE_URL`).
Watch for: `COUNT(*)` returning strings in some drivers, and the in-memory rate limiter (move it to the database when there
is more than one server instance). The service tests can run against your adapter by changing `makeTestContext()`.

### Add an API route

Create `src/app/api/<path>/route.ts`, export `GET`/`POST`/... built with `route({ auth: ... }, handler)`, put the logic in a
service, and add tests. The route guard test picks the new route up automatically and fails unless it needs a login.
Every new error `code` needs a text in `errors.*` (a test lists the codes it finds in the source).

### Add interface text

Add the key to `src/locales/en.json` **and** every other language file, use `t("section.key", { params })`. Keys are typed, so a
typo is a compile error. Plural forms: `key_one` / `key_other` with a `{count}` parameter.

### Conventions

- TypeScript strict (also `noUncheckedIndexedAccess`), ESLint (`eslint-config-next`), exact dependency versions.
- Client code (`src/features`, `src/components`, `src/lib`) must not import `src/server` or Node modules: ESLint enforces it.
- Server functions take `ctx` first and never read `process.env` or the clock directly (use `ctx.env`, `ctx.now()`, `ctx.rng`).
- Never commit secrets, `data/`, or `.env*` (only `.env.example`).
- `next dev` from Next.js 16.3 tries to append an "agent rules" block to `CLAUDE.md` when it detects an AI assistant;
  `agentRules: false` in `next.config.ts` disables it, and a test keeps it that way.

## Ideas that were not done

- Hosted-database adapter and chunked PDF upload (to run on Vercel/Netlify; see [DEPLOYMENT.md](DEPLOYMENT.md)).
- Per-person PIN or invitation link (so that nobody can take a test as somebody else), expiry of certifications and reminders.
- Multiple correct answers, questions with images, per-topic statistics, timed tests, attempt limits or cool-down.
- A bundled PDF viewer (pdf.js) for consistent display on phones.
- Playwright end-to-end tests and a GitLab CI pipeline (`npm run check`).
- A settings screen for the numbers in `config/certification.json`.
