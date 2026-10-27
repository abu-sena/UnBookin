import { describe, expect, it } from 'vitest';
import {
  isAnswerCorrect,
  scoreAttempt,
  weakConcepts,
  type ScorableQuestion,
} from '@/lib/learning/quiz-scoring';

const MCQ: ScorableQuestion = {
  id: 'q1',
  type: 'mcq',
  correct: 2,
  bloomLevel: 'remember',
  chunkRefs: ['c-1'],
};
const CASE: ScorableQuestion = {
  id: 'q2',
  type: 'case_mcq',
  correct: 0,
  bloomLevel: 'apply',
  chunkRefs: ['c-2'],
};
const MULTI: ScorableQuestion = {
  id: 'q3',
  type: 'multi_select',
  correct: [0, 2, 3],
  bloomLevel: 'analyze',
  chunkRefs: ['c-2', 'c-3'],
};
const SHORT: ScorableQuestion = {
  id: 'q4',
  type: 'short_answer',
  correct: 'model answer',
  bloomLevel: 'evaluate',
  chunkRefs: ['c-4'],
};

describe('isAnswerCorrect', () => {
  it('mcq/case_mcq compare the chosen index', () => {
    expect(isAnswerCorrect(MCQ, 2)).toBe(true);
    expect(isAnswerCorrect(MCQ, 0)).toBe(false);
    expect(isAnswerCorrect(MCQ, { index: 2 })).toBe(true);
    expect(isAnswerCorrect(MCQ, { index: 1 })).toBe(false);
    expect(isAnswerCorrect(MCQ, null)).toBe(false);
    expect(isAnswerCorrect(MCQ, '2')).toBe(false);
    expect(isAnswerCorrect(CASE, 0)).toBe(true);
    expect(isAnswerCorrect(CASE, 1)).toBe(false);
  });

  it('multi_select requires an exact set match', () => {
    expect(isAnswerCorrect(MULTI, [0, 2, 3])).toBe(true);
    expect(isAnswerCorrect(MULTI, [3, 2, 0])).toBe(true);
    expect(isAnswerCorrect(MULTI, { indexes: [0, 2, 3] })).toBe(true);
    expect(isAnswerCorrect(MULTI, [0, 2])).toBe(false);
    expect(isAnswerCorrect(MULTI, [0, 2, 3, 3])).toBe(false);
    expect(isAnswerCorrect(MULTI, [1, 2, 3])).toBe(false);
    expect(isAnswerCorrect(MULTI, [])).toBe(false);
  });

  it('short_answer needs grade 3-4 or a self-graded pass', () => {
    expect(isAnswerCorrect(SHORT, { grade: 3 })).toBe(true);
    expect(isAnswerCorrect(SHORT, { grade: 4 })).toBe(true);
    expect(isAnswerCorrect(SHORT, { grade: 2 })).toBe(false);
    expect(isAnswerCorrect(SHORT, { grade: 1 })).toBe(false);
    expect(isAnswerCorrect(SHORT, { selfGraded: true, correct: true })).toBe(true);
    expect(isAnswerCorrect(SHORT, { selfGraded: true, correct: false })).toBe(false);
    expect(isAnswerCorrect(SHORT, 'teks')).toBe(false);
  });
});

describe('scoreAttempt', () => {
  const questions = [MCQ, CASE, MULTI, SHORT];

  it('scores 100% and passes at the 80% boundary', () => {
    const answers = {
      q1: 2,
      q2: 0,
      q3: [0, 2, 3],
      q4: { grade: 4 },
    };
    expect(scoreAttempt(questions, answers)).toEqual({
      correctCount: 4,
      total: 4,
      scorePct: 100,
      passed: true,
    });
  });

  it('passes exactly at 80% (3 of 4) and fails at 75% (3 of 4 is 75 — see below)', () => {
    // 3 of 4 = 75% -> fail; the boundary test uses 8 questions: 7 of 8 = 88%, 6 of 8 = 75%.
    const eight = [...questions, ...questions.map((q) => ({ ...q, id: `${q.id}-b` }))];
    const allCorrect = Object.fromEntries([
      ['q1', 2],
      ['q2', 0],
      ['q3', [0, 2, 3]],
      ['q4', { grade: 3 }],
      ['q1-b', 2],
      ['q2-b', 0],
      ['q3-b', [0, 2, 3]],
      ['q4-b', { grade: 3 }],
    ]);
    expect(scoreAttempt(eight, allCorrect).scorePct).toBe(100);
    const sixCorrect = { ...allCorrect, 'q4-b': { grade: 1 }, 'q3-b': [0, 1] };
    const result = scoreAttempt(eight, sixCorrect);
    expect(result.correctCount).toBe(6);
    expect(result.scorePct).toBe(75);
    expect(result.passed).toBe(false);
  });

  it('80% exactly passes with 8 questions (7 correct)', () => {
    const eight = [...questions, ...questions.map((q) => ({ ...q, id: `${q.id}-b` }))];
    const answers = {
      q1: 2,
      q2: 0,
      q3: [0, 2, 3],
      q4: { grade: 4 },
      'q1-b': 2,
      'q2-b': 0,
      'q3-b': [0, 2, 3],
      'q4-b': { grade: 1 },
    };
    const result = scoreAttempt(eight, answers);
    expect(result.scorePct).toBe(88);
    expect(result.passed).toBe(true);
  });

  it('80% boundary with 5 questions (4 correct)', () => {
    const five = [MCQ, CASE, MULTI, SHORT, { ...MCQ, id: 'q5' }];
    const answers = { q1: 2, q2: 0, q3: [0, 2, 3], q4: { grade: 4 }, q5: 2 };
    const result = scoreAttempt(five, answers);
    expect(result.scorePct).toBe(100);
    // Drop one: 4 of 5 = 80% -> pass.
    const fourCorrect = { ...answers, q5: 1 };
    expect(scoreAttempt(five, fourCorrect)).toMatchObject({
      correctCount: 4,
      total: 5,
      scorePct: 80,
      passed: true,
    });
    // 3 of 5 = 60% -> fail.
    const threeCorrect = { ...fourCorrect, q4: { grade: 1 } };
    expect(scoreAttempt(five, threeCorrect).passed).toBe(false);
  });

  it('empty quiz scores 0 and does not pass', () => {
    expect(scoreAttempt([], {})).toEqual({
      correctCount: 0,
      total: 0,
      scorePct: 0,
      passed: false,
    });
  });

  it('missing answers count as wrong', () => {
    expect(scoreAttempt([MCQ], {})).toEqual({
      correctCount: 0,
      total: 1,
      scorePct: 0,
      passed: false,
    });
  });
});

describe('weakConcepts', () => {
  const questions = [MCQ, CASE, MULTI, SHORT];

  it('collects unique chunk ids and bloom levels of wrong answers', () => {
    const answers = { q1: 2, q2: 1, q3: [0, 1], q4: { grade: 2 } };
    expect(weakConcepts(questions, answers)).toEqual({
      chunkIds: ['c-2', 'c-3', 'c-4'],
      bloomLevels: ['apply', 'analyze', 'evaluate'],
    });
  });

  it('returns empty lists when everything is correct', () => {
    const answers = { q1: 2, q2: 0, q3: [0, 2, 3], q4: { grade: 3 } };
    expect(weakConcepts(questions, answers)).toEqual({ chunkIds: [], bloomLevels: [] });
  });

  it('deduplicates shared chunks across questions', () => {
    const answers = { q2: 1, q3: [1, 2, 3] };
    const weak = weakConcepts([CASE, MULTI], answers);
    expect(weak.chunkIds).toEqual(['c-2', 'c-3']);
    expect(weak.bloomLevels).toEqual(['apply', 'analyze']);
  });
});
