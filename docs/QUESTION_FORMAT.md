# Question file format

Questions are imported from a JSON file (or pasted JSON text) in the admin screen under *Tests and questions*, and can be
downloaded again in the same format. The rules below are exactly what the checker
([`src/server/bank/validate.ts`](../src/server/bank/validate.ts)) enforces. The AI prompt that the admin screen offers
asks an AI to produce this format, and an automated test makes sure that the example inside that prompt passes the
checker.

## Example

The texts below are placeholders. A real file has as many questions as your test needs (by default 60, at least 30).

```json
{
  "schema_version": 1,
  "meta": {
    "generator": "name and version of the AI model or tool that drafted the questions",
    "generated_at": "2026-09-30",
    "source": "title of the study PDF"
  },
  "questions": [
    {
      "id": "q001",
      "question": "Text of the first question?",
      "choices": ["First choice", "Second choice", "Third choice", "Fourth choice"],
      "answer": "B",
      "explanation": "Why the second choice is the correct one.",
      "source": "p. 3"
    },
    {
      "id": "q002",
      "question": "Text of the second question?",
      "choices": ["First choice", "Second choice", "Third choice", "Fourth choice"],
      "answer": "D"
    }
  ]
}
```

## Fields

| Field | Required | Meaning and rules |
|---|---|---|
| `schema_version` | recommended | Must be `1` (the only version). Missing = assumed 1 (an info note). Any other value is refused. |
| `meta.generator` | optional | Which AI model or tool drafted the file. Shown in the admin screen and kept with the bank (transparency about machine-drafted questions). Up to 200 characters. |
| `meta.generated_at` | optional | A date, as text. |
| `meta.source` | optional | Which document the questions are based on. |
| `questions` | **yes** | The list of questions. (A file that is only a list, without the surrounding object, is also accepted, with a note.) |
| `questions[].question` | **yes** | The question text, 1 to 1000 characters. Line breaks are kept. |
| `questions[].choices` | **yes** | A list of texts: **exactly 4 choices** (every question is a four-choice question; the number comes from `questionBank` in `config/certification.json`, see [DEVELOPMENT.md](DEVELOPMENT.md)). Each 1 to 500 characters, no two the same (ignoring case and width). |
| `questions[].answer` | **yes** | The **letter** of the correct choice: `"A"` is the first item of `choices`, `"B"` the second, and so on. Small letters and forms like `"B)"` are accepted. **Numbers are refused**, see below. |
| `questions[].id` | optional | A unique text (or number), up to 64 characters. Missing ids become `q001`, `q002`, ... by position. Two questions with the same id are an error. |
| `questions[].explanation` | optional | Shown to the person after the test, and in the admin screen. Up to 1000 characters. |
| `questions[].source` | optional | Where the answer can be verified (page or heading of the PDF). Shown after the test. Up to 1000 characters. |

Other keys are ignored. The file (text) may be about 2 MB at most.

### Why the answer is a letter and not a number

A number such as `2` could mean the second choice (counting from 1) or the third (counting from 0). AI models mix
this up, and a silently misread answer key would mark right answers as wrong. Letters are unambiguous, so numbers are
rejected with a message that says so.

### Shuffling and what it means for the texts

Each test attempt draws the questions at random, puts them in random order and shuffles the choices of every question.
So a choice must not depend on its position:

- no "all of the above", "none of the above", "both A and B";
- no question or choice that mentions another choice by letter ("choice B", "選択肢C"), or by "the previous
  choice";
- do not put the correct answer in the same position every time (it does not matter for the test, because of the
  shuffling, but a skewed key usually means an AI was lazy: check the answers again).

The checker gives a *warning* for the typical cases (see below); it cannot catch every phrase.

## What the checker reports

Messages are shown in the interface language; each has a code. **Errors** must be fixed before the file can be saved.
**Warnings** and **notes** do not block.

### Errors

| Code | Problem | How to fix |
|---|---|---|
| `json.empty` | The text is empty. | Paste or upload the file. |
| `json.syntax` | Not valid JSON (the message says where). | Look for a missing comma/bracket/quote near that place, or ask the AI to fix its JSON. |
| `root.invalid` | The JSON is not an object or a list. | The file must start with `{` or `[`. |
| `questions.missing` | No `questions` list. | Put the questions in a list called `questions`. |
| `schema.unsupported` | `schema_version` is not 1. | Use `1`. |
| `question.notObject` | An entry is not a `{ ... }` object. | Fix that entry. |
| `question.textMissing` / `question.textTooLong` | Question text empty / over 1000 characters. | Fix the text. |
| `question.choicesMissing` | No `choices` list. | Add it. |
| `question.choiceEmpty` / `question.choiceTooLong` | A choice is empty, not text, or over 500 characters. | Fix it. |
| `question.choicesNotExact` | The question does not have exactly 4 choices. | Give it four choices. |
| `question.choicesTooFew` / `question.choicesTooMany` | Fewer / more choices than `questionBank.minChoices` / `maxChoices` allow (only when those two differ; by default both are 4, so you get `question.choicesNotExact`). | Adjust the number of choices. |
| `question.choicesDuplicate` | Two choices are the same. | Rewrite one. |
| `answer.missing` | No correct answer. | Add `"answer": "A"` (or the right letter). |
| `answer.isNumber` | The answer is a number. | Use the letter instead. |
| `answer.invalid` | The answer is not a single letter (`"the second one"`). | Use a letter. |
| `answer.outOfRange` | The letter is beyond the last choice (`"E"` with 4 choices). | Use a letter of an existing choice. |
| `question.noteInvalid` | `explanation`/`source` is not text or is too long. | Fix it. |
| `bank.empty` | There are no questions. | Add questions. |
| `bank.tooFew` | Fewer questions than one attempt draws (default 30). | Add questions. |
| `bank.duplicateId` | Two questions share an id. | Make ids unique, or remove them (they are generated). |

### Warnings

| Code | Meaning |
|---|---|
| `input.extraTextIgnored` | There was text before/after the JSON (typical for chat AIs); it was ignored. Check that the JSON is complete. |
| `question.textShort` | A question of less than 5 characters. |
| `question.choiceCountDiffers` | A question has a different number of choices than `questionBank.preferredChoices` (only possible when the limits allow a range; by default exactly 4 are required). |
| `question.refersToChoices`, `choice.refersToOthers` | The text refers to other choices by letter/number; shuffling breaks that. |
| `choice.allOfTheAbove` | A choice like "all of the above" / 「上記のすべて」. |
| `bank.sizeDiffers` | The number of questions differs from the expected size (default 60). The test still works. |
| `bank.duplicateQuestion` | Two questions have the same text. |
| `bank.answerSkew` | More than half of the correct answers are the same letter (checked for 20+ questions). |
| `omitted` | "…and N more problems of the same kind": long lists are cut after 8 per kind. |

### Notes

`input.fenceStripped` (a Markdown code fence around the JSON was removed), `root.array` (the file was only a list),
`schema.missing` (no `schema_version`; 1 assumed).

## Tips for AI-made files

- Attach the PDF and use the prompt from the admin screen; it already contains this format and the rules above.
- If the AI cuts its answer in the middle (long outputs are often truncated), the check shows a syntax error near the
  end: ask it to continue, or to produce the remaining questions as a second file, and combine them.
- If the AI numbers the answers, ask: "Change every `answer` to the letter of the correct choice (A for the first
  choice, B for the second, ...)".
- Always **review** the result: the software checks the *form*, only a person can check the *content*.

## Changing the format

The format is versioned (`schema_version`). Steps for a future change (for example several correct answers per
question) are in [DEVELOPMENT.md](DEVELOPMENT.md#changing-the-question-format).
