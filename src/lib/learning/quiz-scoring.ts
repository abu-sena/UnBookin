export const PASS_THRESHOLD_PCT = 80;

export type QuestionType = 'mcq' | 'multi_select' | 'case_mcq' | 'short_answer';
export type BloomLevel =
  | 'remember'
  | 'understand'
  | 'apply'
  | 'analyze'
  | 'evaluate'
  | 'create';

export type ScorableQuestion = {
  id: string;
  type: QuestionType;
  correct: unknown;
  bloomLevel?: BloomLevel;
  chunkRefs?: string[];
};

export type QuizAnswers = Record<string, unknown>;

export type AttemptScore = {
  correctCount: number;
  total: number;
  scorePct: number;
  passed: boolean;
};

export type WeakConcepts = {
  chunkIds: string[];
  bloomLevels: BloomLevel[];
};

function isSingleIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function readSingleAnswer(answer: unknown): number | null {
  if (isSingleIndex(answer)) return answer;
  if (typeof answer === 'object' && answer !== null && 'index' in answer) {
    const index = (answer as { index?: unknown }).index;
    return isSingleIndex(index) ? index : null;
  }
  return null;
}

function readMultiAnswer(answer: unknown): number[] | null {
  if (typeof answer === 'object' && answer !== null && 'indexes' in answer) {
    return readMultiAnswer((answer as { indexes?: unknown }).indexes);
  }
  if (!Array.isArray(answer) || !answer.every(isSingleIndex)) return null;
  // An exact set match cannot contain duplicate option indexes.
  return new Set(answer).size === answer.length ? answer : null;
}

function sameSet(left: number[], right: number[]): boolean {
  const a = new Set(left);
  const b = new Set(right);
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

function readShortAnswerGrade(answer: unknown): { graded: boolean; correct: boolean } {
  if (typeof answer !== 'object' || answer === null) return { graded: false, correct: false };
  const value = answer as { grade?: unknown; selfGraded?: unknown; correct?: unknown };
  if (typeof value.grade === 'number' && Number.isInteger(value.grade)) {
    return { graded: true, correct: value.grade >= 3 && value.grade <= 4 };
  }
  if (value.selfGraded === true && typeof value.correct === 'boolean') {
    return { graded: true, correct: value.correct };
  }
  return { graded: false, correct: false };
}

/** E5-01 AC2/AC3: pure answer check for every question type. */
export function isAnswerCorrect(question: ScorableQuestion, answer: unknown): boolean {
  switch (question.type) {
    case 'mcq':
    case 'case_mcq': {
      const chosen = readSingleAnswer(answer);
      return chosen !== null && isSingleIndex(question.correct) && chosen === question.correct;
    }
    case 'multi_select': {
      const chosen = readMultiAnswer(answer);
      if (chosen === null || !Array.isArray(question.correct)) return false;
      if (!question.correct.every(isSingleIndex)) return false;
      return sameSet(chosen, question.correct);
    }
    case 'short_answer': {
      const grade = readShortAnswerGrade(answer);
      return grade.graded && grade.correct;
    }
    default:
      return false;
  }
}

type MatchResult = {
  correctCount: number;
  weak: WeakConcepts;
};

/** One pass over the questions: counts correct answers and collects weak concepts. */
function matchAnswers(questions: ScorableQuestion[], answers: QuizAnswers): MatchResult {
  const chunkIds: string[] = [];
  const bloomLevels: BloomLevel[] = [];
  let correctCount = 0;
  for (const question of questions) {
    if (isAnswerCorrect(question, answers[question.id])) {
      correctCount += 1;
      continue;
    }
    for (const chunkId of question.chunkRefs ?? []) {
      if (!chunkIds.includes(chunkId)) chunkIds.push(chunkId);
    }
    if (question.bloomLevel && !bloomLevels.includes(question.bloomLevel)) {
      bloomLevels.push(question.bloomLevel);
    }
  }
  return { correctCount, weak: { chunkIds, bloomLevels } };
}

export function scoreAttempt(questions: ScorableQuestion[], answers: QuizAnswers): AttemptScore {
  const total = questions.length;
  const score = matchAnswers(questions, answers);
  const scorePct = total === 0 ? 0 : Math.round((score.correctCount / total) * 100);
  return { correctCount: score.correctCount, total, scorePct, passed: scorePct >= PASS_THRESHOLD_PCT };
}

/** Wrong answers drive the "Hampir!" screen: weak chunks and Bloom levels. */
export function weakConcepts(
  questions: ScorableQuestion[],
  answers: QuizAnswers,
): WeakConcepts {
  return matchAnswers(questions, answers).weak;
}
