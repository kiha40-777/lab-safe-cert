// Builds the text an admin pastes into an external AI chat (together with the
// study PDF) to draft the questions. The app itself never calls an AI.
//
// The JSON structure described here must match the checks in
// src/server/bank/validate.ts; prompt/build.test.ts verifies that.

export type PromptLanguage = "en" | "ja";
export type QuestionLanguage = "same" | "en" | "ja";

export interface PromptOptions {
  /** Language the instructions to the AI are written in. */
  promptLanguage: PromptLanguage;
  /** Language the AI should write the questions in ("same" = the language of the PDF). */
  questionLanguage: QuestionLanguage;
  testName: string;
  questionCount: number;
  choiceCount: number;
}

const LETTERS = "ABCDEFGH";

function exampleJson(language: PromptLanguage, choiceCount: number): string {
  const ja = language === "ja";
  const choices = (n: number) =>
    Array.from({ length: choiceCount }, (_, k) => (ja ? `（選択肢のテキスト${n}-${k + 1}）` : `(text of choice ${n}-${k + 1})`));
  return JSON.stringify(
    {
      schema_version: 1,
      meta: {
        generator: ja ? "（あなた自身の AI モデル名とバージョン）" : "(name and version of the AI model you are)",
        generated_at: "YYYY-MM-DD",
        source: ja ? "（PDF のタイトル）" : "(title of the PDF)",
      },
      questions: [
        {
          id: "q001",
          question: ja ? "（問題文1）" : "(text of question 1)",
          choices: choices(1),
          answer: "B",
          explanation: ja ? "（この選択肢が正解である理由）" : "(why this choice is correct)",
          source: ja ? "p. 3 または見出し名" : "p. 3 or the heading name",
        },
        {
          id: "q002",
          question: ja ? "（問題文2）" : "(text of question 2)",
          choices: choices(2),
          answer: LETTERS[choiceCount - 1] ?? "B",
          explanation: ja ? "（この選択肢が正解である理由）" : "(why this choice is correct)",
          source: ja ? "p. 7 または見出し名" : "p. 7 or the heading name",
        },
      ],
    },
    null,
    2,
  );
}

function languageName(prompt: PromptLanguage, question: QuestionLanguage): string {
  if (question === "same") return prompt === "ja" ? "PDF と同じ言語" : "the same language as the PDF";
  if (question === "ja") return prompt === "ja" ? "日本語" : "Japanese";
  return prompt === "ja" ? "英語" : "English";
}

function english(o: PromptOptions): string {
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
7. Write the questions, choices and explanations in ${languageName("en", o.questionLanguage)}.
8. For every question add a short "explanation" (one or two sentences on why the answer is correct) and a "source" (the page number or heading in the PDF where the answer can be verified). A person will check every question against the PDF.

# Output format
Output ONE JSON object and nothing else: no introduction, no closing remarks and no Markdown code fence. Use exactly this structure:

${exampleJson("en", o.choiceCount)}

- "answer" is the LETTER of the correct choice: "A" is the first item of "choices", "B" the second, and so on. Never use a number.
- "id" values must be unique ("q001", "q002", ...).
- In "meta", "generator" is the name and version of the AI model you are, and "generated_at" is today's date (YYYY-MM-DD).

# Before you answer
Check that there are exactly ${o.questionCount} questions, that every question has exactly ${o.choiceCount} choices, that every "answer" letter points to the choice that is correct according to the PDF, and that the JSON is valid.
`;
}

function japanese(o: PromptOptions): string {
  return `あなたは iGEM チームが、実験の安全に関する資料から知識テストを作るのを手伝います。

# 依頼
添付した PDF（「${o.testName}」の勉強用資料）を読み、読んだ人が内容を理解できているかを確かめる多肢選択問題を、ちょうど ${o.questionCount} 問作成してください。

# ルール
1. 問題は添付 PDF の内容だけに基づいてください。PDF にない知識を足したり、事実・数値・規則・名称・出典を創作したりしないでください。PDF から明確に裏づけられない問題は作らないでください。
2. 資料全体からまんべんなく出題し、特定の部分に偏らないでください。
3. どの問題も、選択肢はちょうど ${o.choiceCount} 個、正解はちょうど1つにしてください。誤りの選択肢は、もっともらしいが PDF に照らして明確に誤りであるものにしてください。
4. 「上記のすべて」「上記のいずれでもない」「AとBの両方」のような選択肢は使わないでください。問題文や選択肢の中で、他の選択肢を記号や番号で指さないでください（テストでは選択肢が毎回並べ替えられます）。
5. 正解の位置が A、B、C…のどれにもほぼ均等になるようにしてください。
6. 各問題は単独で意味が通るようにしてください（図を説明せずに「図のとおり」などと書かないでください）。
7. 問題・選択肢・解説は${languageName("ja", o.questionLanguage)}で書いてください。
8. 各問題に、短い "explanation"（正解の理由を1〜2文）と "source"（答えを確認できる PDF のページ番号または見出し）を付けてください。人が全問を PDF と照らして確認します。

# 出力形式
JSON オブジェクトを1つだけ出力してください。前置き・後書き・Markdown のコードブロック記号は付けないでください。構造は次のとおりにしてください。

${exampleJson("ja", o.choiceCount)}

- "answer" は正解の選択肢の記号です（"A" は "choices" の1番目、"B" は2番目…）。数字は使わないでください。
- "id" は重複しない値にしてください（"q001"、"q002"…）。
- "meta" の "generator" にはあなた自身の AI モデル名とバージョン、"generated_at" には今日の日付（YYYY-MM-DD）を入れてください。

# 回答前の確認
問題がちょうど ${o.questionCount} 問あること、すべての問題の選択肢がちょうど ${o.choiceCount} 個であること、すべての "answer" が PDF に照らして正しい選択肢を指していること、JSON が正しい形式であることを確認してから出力してください。
`;
}

export function buildPrompt(options: PromptOptions): string {
  return options.promptLanguage === "ja" ? japanese(options) : english(options);
}
