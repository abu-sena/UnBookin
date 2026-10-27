import { describe, expect, it } from 'vitest';
import {
  checklistStateSchema,
  contentLayerSchema,
  multiSelectAnswerSchema,
  reviewResultSchema,
  saveChecklistInputSchema,
  shortAnswerGradeSchema,
  singleChoiceAnswerSchema,
} from '@/lib/learning/schemas';

describe('checklistStateSchema', () => {
  it('accepts tool index keys with checked item indices', () => {
    expect(checklistStateSchema.safeParse({ '0': [0, 2], '3': [1] }).success).toBe(true);
    expect(checklistStateSchema.safeParse({}).success).toBe(true);
  });

  it('rejects negative keys, bad indices and duplicates', () => {
    expect(checklistStateSchema.safeParse({ '-1': [0] }).success).toBe(false);
    expect(checklistStateSchema.safeParse({ abc: [0] }).success).toBe(false);
    expect(checklistStateSchema.safeParse({ '0': [-1] }).success).toBe(false);
    expect(checklistStateSchema.safeParse({ '0': [1.5] }).success).toBe(false);
    expect(checklistStateSchema.safeParse({ '0': [2, 2] }).success).toBe(false);
    expect(checklistStateSchema.safeParse({ '0': 'nope' }).success).toBe(false);
    expect(checklistStateSchema.safeParse({ '100000': [0] }).success).toBe(false);
  });
});

describe('saveChecklistInputSchema', () => {
  it('requires a uuid module, a tool index and unique indices', () => {
    const valid = {
      moduleId: 'a1b2c3d4-0000-4000-8000-000000000001',
      toolIndex: 0,
      checkedIndices: [0, 1],
    };
    expect(saveChecklistInputSchema.safeParse(valid).success).toBe(true);
    expect(
      saveChecklistInputSchema.safeParse({ ...valid, moduleId: 'nope' }).success,
    ).toBe(false);
    expect(
      saveChecklistInputSchema.safeParse({ ...valid, toolIndex: -1 }).success,
    ).toBe(false);
    expect(
      saveChecklistInputSchema.safeParse({ ...valid, toolIndex: 1.5 }).success,
    ).toBe(false);
    expect(
      saveChecklistInputSchema.safeParse({ ...valid, checkedIndices: [0, 0] }).success,
    ).toBe(false);
  });

  it('rejects extra keys (strict)', () => {
    const valid = {
      moduleId: 'a1b2c3d4-0000-4000-8000-000000000001',
      toolIndex: 0,
      checkedIndices: [],
    };
    expect(
      saveChecklistInputSchema.safeParse({ ...valid, userId: 'forged' }).success,
    ).toBe(false);
  });
});

describe('answer schemas', () => {
  it('single choice accepts a bounded index', () => {
    expect(singleChoiceAnswerSchema.safeParse(0).success).toBe(true);
    expect(singleChoiceAnswerSchema.safeParse(20).success).toBe(true);
    expect(singleChoiceAnswerSchema.safeParse(21).success).toBe(false);
    expect(singleChoiceAnswerSchema.safeParse(-1).success).toBe(false);
    expect(singleChoiceAnswerSchema.safeParse(1.5).success).toBe(false);
  });

  it('multi select rejects duplicates and out-of-range indices', () => {
    expect(multiSelectAnswerSchema.safeParse([0, 2, 3]).success).toBe(true);
    expect(multiSelectAnswerSchema.safeParse([0, 0]).success).toBe(false);
    expect(multiSelectAnswerSchema.safeParse([-1]).success).toBe(false);
    expect(multiSelectAnswerSchema.safeParse([99]).success).toBe(false);
  });
});

describe('shortAnswerGradeSchema', () => {
  it('accepts a grade 1-4 or a self-graded boolean', () => {
    expect(shortAnswerGradeSchema.safeParse({ grade: 1 }).success).toBe(true);
    expect(shortAnswerGradeSchema.safeParse({ grade: 4 }).success).toBe(true);
    expect(shortAnswerGradeSchema.safeParse({ grade: 5 }).success).toBe(false);
    expect(shortAnswerGradeSchema.safeParse({ grade: 0 }).success).toBe(false);
    expect(
      shortAnswerGradeSchema.safeParse({ selfGraded: true, correct: true }).success,
    ).toBe(true);
    expect(
      shortAnswerGradeSchema.safeParse({ selfGraded: true, correct: false }).success,
    ).toBe(true);
    expect(shortAnswerGradeSchema.safeParse({ selfGraded: false, correct: true }).success).toBe(
      false,
    );
    expect(shortAnswerGradeSchema.safeParse({ grade: 3, extra: 1 }).success).toBe(false);
  });
});

describe('enum passthroughs', () => {
  it('content layers and review results are closed sets', () => {
    expect(contentLayerSchema.safeParse('eli5').success).toBe(true);
    expect(contentLayerSchema.safeParse('nope').success).toBe(false);
    expect(reviewResultSchema.safeParse('again').success).toBe(true);
    expect(reviewResultSchema.safeParse('hard').success).toBe(true);
    expect(reviewResultSchema.safeParse('good').success).toBe(true);
    expect(reviewResultSchema.safeParse('easy').success).toBe(false);
  });
});
