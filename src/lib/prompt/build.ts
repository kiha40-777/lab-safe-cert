// Builds the text an admin pastes into an external AI chat (together with the
// study PDF) to draft the questions. The app itself never calls an AI.
// The prompt is always written in English, whatever language the screen uses;
// only the language the AI writes the questions in can be chosen.
//
// The JSON structure described here must match the checks in
// src/server/bank/validate.ts; prompt/build.test.ts verifies that.

export type QuestionLanguage = "same" | "en" | "ja";

export interface PromptOptions {
  /** Language the AI should write the questions in ("same" = the language of the PDF). */
  questionLanguage: QuestionLanguage;
  testName: string;
  questionCount: number;
  choiceCount: number;
}

const LETTERS = "ABCDEFGH";

function exampleJson(choiceCount: number): string {
  const choices = (n: number) => Array.from({ length: choiceCount }, (_, k) => `(text of choice ${n}-${k + 1})`);
  return JSON.stringify(
    {
      schema_version: 1,
      meta: {
        generator: "(name and version of the AI model you are)",
        generated_at: "YYYY-MM-DD",
        source: "(title of the PDF)",
      },
      questions: [
        {
          id: "q001",
          question: "(text of question 1)",
          choices: choices(1),
          answer: "B",
          explanation: "(why this choice is correct)",
          source: "p. 3 or the heading name",
        },
        {
          id: "q002",
          question: "(text of question 2)",
          choices: choices(2),
          answer: LETTERS[choiceCount - 1] ?? "B",
          explanation: "(why this choice is correct)",
          source: "p. 7 or the heading name",
        },
      ],
    },
    null,
    2,
  );
}

function languageName(question: QuestionLanguage): string {
  if (question === "same") return "the same language as the PDF";
  return question === "ja" ? "Japanese" : "English";
}

export function buildPrompt(o: PromptOptions): string {
  return `You are helping an iGEM team turn a study document into a knowledge test about laboratory safety.

# Task
Read the attached PDF (the study material for the "${o.testName}") and write exactly ${o.questionCount} multiple-choice questions that check whether a reader has understood it.

# Rules
1. Use ONLY the content of the attached PDF. Do not add outside knowledge and do not invent facts, numbers, rules, names or citations. If the PDF does not clearly support a question, do not write that question.
2. Spread the questions over the whole document; do not concentrate on one part.
3. Every question has exactly ${o.choiceCount} choices and exactly ONE correct choice. The wrong choices must be plausible but clearly wrong according to the PDF.
4. Do not use choices such as "all of the above", "none of the above" or "both A and B". Never refer to other choices by letter or number, in the question or in a choice: the choices are shuffled every time the test is taken.
5. Vary the position of the correct answer so that it is about equally often A, B, C, and so on.
6. Each question must be understandable on its own (do not write "as shown in the figure" unless you describe the figure).
7. Write the questions, choices and explanations in ${languageName(o.questionLanguage)}.
8. For every question add a short "explanation" (one or two sentences on why the answer is correct) and a "source" (the page number or heading in the PDF where the answer can be verified). A person will check every question against the PDF.

# Output format
The result is ONE JSON object. Provide it in BOTH of these forms, with identical content:
1. As a file: a downloadable file named "questions.json". If you are not able to create files, skip this form.
2. As plain text: the same JSON object written directly in your reply, with no introduction, no closing remarks and no Markdown code fence.

Use exactly this structure:

${exampleJson(o.choiceCount)}

- "answer" is the LETTER of the correct choice: "A" is the first item of "choices", "B" the second, and so on. Never use a number.
- "id" values must be unique ("q001", "q002", ...).
- In "meta", "generator" is the name and version of the AI model you are, and "generated_at" is today's date (YYYY-MM-DD).

# Before you answer
Check that there are exactly ${o.questionCount} questions, that every question has exactly ${o.choiceCount} choices, that every "answer" letter points to the choice that is correct according to the PDF, and that the JSON is valid.
`;
}
