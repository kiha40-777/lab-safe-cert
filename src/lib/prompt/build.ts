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
  /** Number of ordinary questions to ask for. */
  questionCount: number;
  /** Number of case-study questions to ask for in addition (0 = none; the prompt then does not mention them). */
  caseStudyCount?: number;
  choiceCount: number;
}

const LETTERS = "ABCDEFGH";

function exampleJson(choiceCount: number, withCaseStudy: boolean): string {
  const choices = (n: number) => Array.from({ length: choiceCount }, (_, k) => `(text of choice ${n}-${k + 1})`);
  // "type" is only written out when the prompt asks for case studies; without it every question is a standard one.
  const standard = withCaseStudy ? { type: "standard" } : {};
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
          ...standard,
          question: "(text of question 1)",
          choices: choices(1),
          answer: "B",
          explanation: "(why this choice is correct)",
          source: "p. 3 or the heading name",
        },
        {
          id: "q002",
          ...standard,
          question: "(text of question 2)",
          choices: choices(2),
          answer: LETTERS[choiceCount - 1] ?? "B",
          explanation: "(why this choice is correct)",
          source: "p. 7 or the heading name",
        },
        ...(withCaseStudy
          ? [
              {
                id: "c001",
                type: "case_study",
                question: "(description of a situation, then the question about it)",
                choices: choices(3),
                answer: "C",
                explanation: "(why this choice is correct)",
                source: "p. 12 or the heading name",
              },
            ]
          : []),
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
  const caseStudies = o.caseStudyCount ?? 0;
  const withCaseStudy = caseStudies > 0;

  const task = withCaseStudy
    ? `write exactly ${o.questionCount} multiple-choice questions that check whether a reader has understood it ("standard" questions) and, in addition, exactly ${caseStudies} case-study questions (described under "Case-study questions" below).`
    : `write exactly ${o.questionCount} multiple-choice questions that check whether a reader has understood it.`;

  const caseStudySection = withCaseStudy
    ? `
# Case-study questions
Besides the ${o.questionCount} standard questions, write exactly ${caseStudies} case-study questions. Give every case-study question "type": "case_study" and every other question "type": "standard".
- A case-study question describes ONE short, realistic situation in a laboratory (about 3 to 6 sentences, written inside the "question" text) and then asks what should be done, or what is wrong. It is an ordinary multiple-choice question otherwise: exactly ${o.choiceCount} choices and exactly ONE correct choice.
- The situation itself may be made up, but every rule and fact that is needed to answer it must come from the PDF, and the correct choice must follow directly from the PDF. Do not invent rules, numbers, names or procedures.
- Do not repeat the situation of another question. Rules 3 to 8 apply to case-study questions as well.
- List the case-study questions after all standard questions.
`
    : "";

  const typeNote = withCaseStudy ? '\n- "type" is "standard" or "case_study" (see "Case-study questions").' : "";
  const idNote = withCaseStudy ? '("q001", "q002", ... and "c001", "c002", ...)' : '("q001", "q002", ...)';
  const countCheck = withCaseStudy
    ? `exactly ${o.questionCount} standard questions and exactly ${caseStudies} case-study questions`
    : `exactly ${o.questionCount} questions`;

  return `You are helping an iGEM team turn a study document into a knowledge test about laboratory safety.

# Task
Read the attached PDF (the study material for the "${o.testName}") and ${task}

# Rules
1. Use ONLY the content of the attached PDF. Do not add outside knowledge and do not invent facts, numbers, rules, names or citations. If the PDF does not clearly support a question, do not write that question.
2. Spread the questions over the whole document; do not concentrate on one part.
3. Every question has exactly ${o.choiceCount} choices and exactly ONE correct choice. The wrong choices must be plausible but clearly wrong according to the PDF.
4. Do not use choices such as "all of the above", "none of the above" or "both A and B". Never refer to other choices by letter or number, in the question or in a choice: the choices are shuffled every time the test is taken.
5. Vary the position of the correct answer so that it is about equally often A, B, C, and so on.
6. Each question must be understandable on its own (do not write "as shown in the figure" unless you describe the figure).
7. Write the questions, choices and explanations in ${languageName(o.questionLanguage)}.
8. For every question add a short "explanation" (one or two sentences on why the answer is correct) and a "source" (the page number or heading in the PDF where the answer can be verified). A person will check every question against the PDF.
${caseStudySection}
# Output format
The result is ONE JSON object. Provide it in BOTH of these forms, with identical content:
1. As a file: a downloadable file named "questions.json". If you are not able to create files, skip this form.
2. As plain text: the same JSON object written directly in your reply, with no introduction, no closing remarks and no Markdown code fence.

Use exactly this structure:

${exampleJson(o.choiceCount, withCaseStudy)}

- "answer" is the LETTER of the correct choice: "A" is the first item of "choices", "B" the second, and so on. Never use a number.${typeNote}
- "id" values must be unique ${idNote}.
- In "meta", "generator" is the name and version of the AI model you are, and "generated_at" is today's date (YYYY-MM-DD).

# Before you answer
Check that there are ${countCheck}, that every question has exactly ${o.choiceCount} choices, that every "answer" letter points to the choice that is correct according to the PDF, and that the JSON is valid.
`;
}
