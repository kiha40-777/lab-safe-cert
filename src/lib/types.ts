// Shapes of the JSON exchanged between the browser and the API.
// Shared by the server and the client; keep this file free of runtime code.

export type Scope = "participant" | "admin";

/** Error body of every failed API call. `code` is translated in the UI (errors.<code>). */
export interface ApiErrorBody {
  error: { code: string; params?: Record<string, string | number> };
}

// ---------------------------------------------------------------- members

export interface MemberDto {
  id: string;
  name: string;
  role: string;
  /** True when the person typed their own name via "Other" instead of being registered by an admin. */
  selfRegistered: boolean;
}

export interface AuthStatus {
  participant: boolean;
  admin: boolean;
  /** The person the participant session is currently acting as. */
  member: MemberDto | null;
  /** False until the participant password has been set (by the admin or via environment variable). */
  participantPasswordSet: boolean;
}

// ------------------------------------------------------------ study PDFs

export interface MaterialInfo {
  filename: string;
  size: number;
  uploadedAt: string;
}

// -------------------------------------------------------------- attempts

export interface AttemptSummary {
  id: string;
  testId: string;
  status: "in_progress" | "submitted" | "abandoned";
  startedAt: string;
  submittedAt: string | null;
  score: number | null;
  total: number;
  passed: boolean | null;
  /** Role granted by this attempt (only set when it was the passing attempt). */
  promotedTo: string | null;
}

export interface ParticipantTestInfo {
  testId: string;
  /** The question bank holds enough questions for one attempt. */
  ready: boolean;
  material: MaterialInfo | null;
}

export interface ParticipantHome {
  member: MemberDto;
  tests: ParticipantTestInfo[];
  /** Test this person can take now, based on their role (null at the top of the ladder). */
  nextTestId: string | null;
  activeAttempt: { id: string; testId: string } | null;
  recentAttempts: AttemptSummary[];
}

/** A question as shown while taking the test: never contains the answer. */
export interface AttemptQuestionView {
  text: string;
  choices: string[];
}

export interface AttemptView {
  id: string;
  testId: string;
  status: "in_progress";
  startedAt: string;
  questions: AttemptQuestionView[];
  /** Answers saved so far (index of the chosen choice, or null). */
  answers: (number | null)[];
  /** True when an unfinished attempt was picked up again instead of starting a new one. */
  resumed: boolean;
}

export interface ResultQuestion {
  text: string;
  choices: string[];
  answerIndex: number;
  chosenIndex: number | null;
  correct: boolean;
  explanation: string | null;
  source: string | null;
}

export interface AttemptResult {
  id: string;
  testId: string;
  memberId: string;
  memberName: string;
  status: "submitted";
  startedAt: string;
  submittedAt: string;
  score: number;
  total: number;
  /** Number of correct answers that was needed to pass when this attempt was graded. */
  requiredScore: number;
  passed: boolean;
  promotedTo: string | null;
  questions: ResultQuestion[];
}

export type AttemptDetail = AttemptView | AttemptResult;

// ----------------------------------------------------------------- admin

export interface MemberTestStats {
  testId: string;
  attempts: number;
  bestScore: number | null;
  bestTotal: number | null;
  lastScore: number | null;
  lastTotal: number | null;
  lastPassed: boolean | null;
  lastAt: string | null;
  passedAt: string | null;
}

export interface MemberOverview extends MemberDto {
  createdAt: string;
  stats: MemberTestStats[];
  lastActivityAt: string | null;
}

export interface BankMetaDto {
  generator: string | null;
  generatedAt: string | null;
  source: string | null;
  importedAt: string;
  updatedAt: string;
  reviewConfirmedAt: string | null;
}

export interface TestAdminInfo {
  testId: string;
  questionCount: number;
  bank: BankMetaDto | null;
  material: MaterialInfo | null;
}

export interface AdminOverview {
  members: MemberOverview[];
  tests: TestAdminInfo[];
  recentAttempts: (AttemptSummary & { memberId: string; memberName: string })[];
}

export interface AdminSettings {
  admin: { managedByEnv: boolean };
  participant: { set: boolean; managedByEnv: boolean };
}

// ---------------------------------------------------------- question bank

/** A question as edited in the admin screen (optional texts are empty strings). */
export interface QuestionDto {
  id: string;
  text: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
  source: string;
}

export interface BankDto {
  meta: BankMetaDto | null;
  questions: QuestionDto[];
}

/** One finding of the question-bank check. `code` is translated in the UI (issues.<code>). */
export interface Issue {
  code: string;
  /** 1-based question number the issue refers to, when it belongs to one question. */
  question?: number;
  params?: Record<string, string | number>;
}

export interface ValidationSummary {
  questionCount: number;
  /** number of choices -> how many questions have that many */
  choiceCounts: Record<string, number>;
  /** answer letter -> how many questions have it as the correct answer */
  answerDistribution: Record<string, number>;
}

export interface ValidationResultDto {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
  infos: Issue[];
  summary: ValidationSummary | null;
  /** The questions as they would be saved (only when ok). */
  preview: QuestionDto[] | null;
  /** Bank-level info found in the JSON (generator, date, source). */
  meta: { generator: string | null; generatedAt: string | null; source: string | null } | null;
}
