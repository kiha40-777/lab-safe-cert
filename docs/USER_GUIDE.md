# User guide

This guide is for the people who **run** the tests (administrators) and the people who **take** them
(participants). For installation see the [README](../README.md); for the question file format see
[QUESTION_FORMAT.md](QUESTION_FORMAT.md).

The interface is available in English and Japanese. Use the language menu at the top right of every page; the choice
is remembered in your browser. (Only buttons and explanations change language; the questions are shown in the language
they were written in.)

## The idea

There are three levels. Moving up is done by passing a test with the required score (by default: **all** questions
correct).

| Level (default names) | How to reach it | Study PDF and test they see |
|---|---|---|
| **Candidate** | Everybody starts here | The PDF and the **Participant Certification Test** |
| **Participant** | Pass the Participant Certification Test | The PDF and the **Supervisor Certification Test** |
| **Supervisor** | Pass the Supervisor Certification Test | Nothing more to pass; the study PDFs stay readable |

There are two addresses:

- **Test screen** `/` (for example `http://localhost:3000/`): everybody who studies and takes tests. Locked with the
  **participant password**.
- **Admin screen** `/admin`: for administrators. Locked with the **admin password**. Being a *Supervisor* does not by
  itself open the admin screen; the admin password does. (In practice the supervisors share it.)

---

## For administrators

### 1. First start and passwords

- When the app starts for the first time it prints a random **admin password** in its window, once. Write it down.
  If it is lost, stop the app and run `npm start -- --reset-admin-password` (Docker: start once with the environment
  variable `LSC_RESET_ADMIN_PASSWORD=1`, read the new password from the log, then remove the variable again).
- Open `/admin` and log in. Admin logins last 8 hours.
- Go to **Settings**:
  - **Administrator password**: change it (you must type the current one). Other admin logins are ended.
  - **Participant password**: press *Generate a random password* (or type your own, at least 8 characters) and
    tell your team. It is shown once because only a scrambled form is stored. Changing it later logs out everybody who
    is currently logged in on the test screen. **Until it is set, nobody can log in to the test screen.**
  - If the passwords are set by environment variables (`ADMIN_PASSWORD`, `PARTICIPANT_PASSWORD`), the screen says so and
    they can only be changed there.

### 2. Members

Under **Members**:

- **Add a member**: name and level. **Add many members at once**: one name per line; names that already exist are
  skipped and listed.
- People whose name is missing can choose "Other" on the test screen and type it. They are registered as
  *Candidate* and shown with a yellow **"Typed their own name"** mark, and the **Members** entry in the left-hand menu shows a number. Check
  the spelling, fix it with *Edit* if needed, or press *Mark as checked*. (Saving any change also clears the mark.)
- Names that differ only in capitals, spaces or full/half-width letters count as the same name.
- Change a level by hand from the drop-down in the list (for example someone certified on paper, or a person whose
  certification you want to withdraw). It is not necessary for the normal path: passing a test moves people up
  automatically.
- **Delete** removes the person *and all of their results*. Use it for a duplicate entry.

### 3. Study PDFs

In the left-hand menu, under **Tests and questions**, choose the test, then **Study material (PDF)**: upload a PDF (up to 25 MB unless
your installation says otherwise). People see it *before* they can start the test, and again on the result page.
You can preview, replace or delete it.

### 4. Questions

Every test needs a *question bank*: normally 60 questions, from which each attempt draws 30 at random, in random
order, with the choices in random order too. At least 30 are needed. (Both numbers can be changed; see
[DEVELOPMENT.md](DEVELOPMENT.md).)

**Step 1: draft with an AI (optional but recommended).** The card *Ask an AI to draft the questions* contains a ready
prompt (always written in English). Choose the language you want the questions in, press *Copy*, open an AI chat,
attach the *same PDF*, paste the prompt and send it. Save the AI's answer (a JSON text) in a file or keep it in the chat.
This app never contacts an AI itself. You can also write the question file yourself.

**Step 2: import.** In *Import the questions*, choose the file or paste the text, and press *Check the questions*.
Nothing is saved at this point.

- It accepts what AI chats usually produce: a text with a ` ```json ` code block, or with a sentence before/after the
  JSON (you get a note that the extra text was ignored; make sure nothing important was cut off).
- **Red messages** are problems that must be fixed before the file can be used (they name the question number). Fix the
  file (or ask the AI to correct it) and check again.
- **Yellow messages** are things to look at; the file can still be used. Typical ones: a choice such as "all of the
  above", a choice that refers to another choice by letter (choices are shuffled, so it will confuse people),
  one answer letter being used far too often, two identical questions.
- When the file is fine you see how many questions there are, how the correct answers are spread over A, B, C, D,
  and who made it (the AI name if the file says so). Press *Open in step 3 to review and edit*.

**Step 3: review, edit, confirm and save.** The card *Review and edit the questions* lists all questions with their
correct answer. Questions that come from a file are marked as *not saved yet*. Open a question to change the text, the
four choices, the correct one, the explanation shown after the test, and the source (page or section). Every
question has exactly four choices (the choices cannot be added or removed). *Add a question*, *Delete this question*.

When you are done, tick *A person has checked every question and its correct answer against the study material* (the bar
at the bottom stays visible) and press *Save as the question bank* (or *Save changes* for a bank that was saved
before). This is the important step: **AI drafts contain mistakes**. Please do check. The confirmation is asked
again for every save, and it is cleared when you change anything after ticking it. Saving a file replaces the current
bank (finished results are not affected); *Discard these questions* drops the unsaved file instead.
*Download as JSON* saves the stored bank as a file in the same format (a good way to keep a copy or move it to
another installation).

A short review checklist:

- Can each question be answered from the study PDF alone? Is exactly one choice correct?
- Are the wrong choices really wrong according to the PDF, and not just unusual wording?
- Does the marked correct answer match the PDF? (Compare with the *source* page.)
- No "all of the above" and no references to other choices.
- Names, numbers and units are copied correctly. Language and spelling are fine.
- Do not lean on the explanation of the AI as proof; check the PDF.

### 5. Progress

**Progress** (the first item in the left-hand menu) shows:

- how many people have each level, and whether each test is *Ready* (enough questions) and has a PDF;
- a table with every person: level, and for each test the number of attempts, the best score, and the latest score
  with *Passed / Not passed*; last activity. Click a name (or *Details*) for the history, and *View answers* for every
  question of an attempt with the person's answer and the correct one. Search by name, filter by level, click column
  headings to sort;
- the most recent attempts;
- **Download results (CSV)** (one row per person) and **Download every attempt (CSV)**. Both open correctly in Excel,
  including Japanese names.

CSV columns of the results file: `name, role, self_registered, registered_at, last_activity_at`, then for each test
`<test>_attempts, <test>_best, <test>_last, <test>_last_at, <test>_passed_at`. Cells that start with `=`, `+`, `-` or `@`
get a leading apostrophe so that spreadsheets do not run them as formulas.

### 6. Routine care

- **Back up**: stop the app and copy the `data` folder (or the Docker volume). It contains everything.
- **Update the software**: `git pull`, then start the app as usual; it reinstalls and rebuilds by itself when needed. The data stays.
- **Rules that are good to know**: attempts are unlimited; an unfinished test is resumed for 24 hours (after that a
  new one is drawn); the questions of an attempt are frozen when it starts, so editing the bank does not affect tests
  in progress or finished results.

---

## For participants (you can copy this to your team)

1. Open the address you were given and type the **participant password**.
2. Choose **your name** from the list. If it is not there, choose "Other" and type your full name.
3. **Read the study material** (the PDF on the page). If it does not show on your phone, tap *Open in a new tab*.
4. Press **Start the test**. There are 30 questions (your administrator may have chosen another number); the
   questions and the choices are in random order for everybody. Pick one answer for each question. You can go back, and you can jump to any question with the numbered
   buttons on the right (below the question on a phone). Your answers are **saved automatically**. If the page is reloaded or your phone locks, come back and press
   *Resume the test*.
5. Press **Hand in** when you are done. Questions left empty count as wrong.
6. You see your score, whether you **passed**, and every question with your answer, the correct answer and (if the
   author added one) an explanation. The numbered buttons on the right jump to a question (green: correct, red: wrong,
   yellow: not answered). If you passed, your level went up (the page says so). If not, press *Show the study
   material again*, read, and try again; you can retake it as often as you like.

If you picked the wrong name, use *Not you? Change name* on the start page (never take a test under somebody else's
name: the record belongs to the person whose name is chosen).

---

## Frequently asked questions

**Somebody typed a wrong or duplicate name.** Fix it under *Members → Edit*. If there are two entries for one
person, delete the wrong one (its results are deleted with it) and let the person retake, or change the level of the
remaining entry by hand.

**Somebody passed on paper (or should be certified without the test).** Change their level in *Members*.

**A test shows "not available yet".** The test needs at least 30 questions in its bank. Import them under *Tests and
questions*.

**Can I have a different pass mark or number of questions?** Yes, in `config/certification.json` (start the app again; it rebuilds by itself). See
[DEVELOPMENT.md](DEVELOPMENT.md).

**Somebody logs in as someone else.** The app cannot prevent it; identity is by honour. If this matters, run the
tests in one room with the administrator watching, and keep the participant password to yourselves until the session.

**The server was restarted; is everything still there?** Yes. Everything is in the data folder, including the logins
(people stay logged in until their login expires: 24 h for participants, 8 h for the admin).

**A login keeps failing.** After ten wrong admin passwords (forty for the participant password) within ten minutes
the login is paused for a few minutes to stop password guessing. Wait and try again with the right password.
