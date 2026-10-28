import { describe, expect, it } from 'vitest';
import {
  actionFeedbackResultSchema,
  submitActionReportInputSchema,
  updateActionStatusInputSchema,
} from '@/lib/journal/schemas';

const ACTION_ID = 'b2c3d4e5-6a7b-4c8d-9e0f-1a2b3c4d5e6f';

function report(overrides: Record<string, unknown> = {}) {
  return {
    actionId: ACTION_ID,
    whatIDid: 'a'.repeat(80),
    result: 'Hasilnya jelas.',
    ...overrides,
  };
}

describe('submitActionReportInputSchema', () => {
  it('requires at least 80 characters for whatIDid and trims the values', () => {
    expect(
      submitActionReportInputSchema.safeParse(report({ whatIDid: 'a'.repeat(79) })).success,
    ).toBe(false);
    const parsed = submitActionReportInputSchema.safeParse(
      report({ whatIDid: `  ${'a'.repeat(80)}  `, result: '  hasil  ' }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.whatIDid).toHaveLength(80);
      expect(parsed.data.result).toBe('hasil');
    }
  });

  it('normalizes an omitted reflection to an empty string and accepts an optional URL', () => {
    const parsed = submitActionReportInputSchema.parse(
      report({ evidenceUrl: 'https://example.com/bukti?x=1' }),
    );
    expect(parsed.reflection).toBe('');
    expect(parsed.evidenceUrl).toBe('https://example.com/bukti?x=1');
  });

  it('rejects unknown fields, including client-supplied identity or grading values', () => {
    for (const extra of [
      { userId: ACTION_ID },
      { model: 'gpt' },
      { qualityScore: 4 },
      { passed: true },
    ]) {
      expect(submitActionReportInputSchema.safeParse({ ...report(), ...extra }).success).toBe(
        false,
      );
    }
  });

  it('accepts only public http(s) evidence links', () => {
    const accepted = [
      'https://example.com/bukti',
      'http://docs.example.org/a/b?c=d#e',
      'https://8.8.8.8/evidence',
    ];
    for (const evidenceUrl of accepted) {
      expect(submitActionReportInputSchema.safeParse(report({ evidenceUrl })).success).toBe(true);
    }

    const rejected = [
      'javascript:alert(1)',
      'file:///etc/passwd',
      'data:text/plain,hello',
      'ftp://example.com/file',
      'http://user:pass@example.com/bukti',
      'http://127.0.0.1/bukti',
      'http://10.0.0.1/bukti',
      'http://192.168.1.10/bukti',
      'http://169.254.169.254/latest/meta-data',
      'http://[::1]/bukti',
      'http://localhost/bukti',
      'http://printer.local/bukti',
      `https://example.com/${'a'.repeat(2_048)}`,
    ];
    for (const evidenceUrl of rejected) {
      expect(submitActionReportInputSchema.safeParse(report({ evidenceUrl })).success).toBe(false);
    }
  });
});

describe('updateActionStatusInputSchema', () => {
  it('accepts only the two allowed operations', () => {
    expect(
      updateActionStatusInputSchema.safeParse({ actionId: ACTION_ID, operation: 'extend' }).success,
    ).toBe(true);
    expect(
      updateActionStatusInputSchema.safeParse({ actionId: ACTION_ID, operation: 'skip' }).success,
    ).toBe(true);
    expect(
      updateActionStatusInputSchema.safeParse({ actionId: ACTION_ID, operation: 'done' }).success,
    ).toBe(false);
    expect(
      updateActionStatusInputSchema.safeParse({ actionId: 'nope', operation: 'extend' }).success,
    ).toBe(false);
  });
});

describe('actionFeedbackResultSchema', () => {
  it('accepts only an integer 1..4 and non-empty feedback up to 1500 characters', () => {
    expect(
      actionFeedbackResultSchema.safeParse({ qualityScore: 1, feedback: 'Perjelas hasilnya.' })
        .success,
    ).toBe(true);
    expect(
      actionFeedbackResultSchema.safeParse({ qualityScore: 4, feedback: 'a'.repeat(1_500) })
        .success,
    ).toBe(true);
    expect(actionFeedbackResultSchema.safeParse({ qualityScore: 0, feedback: 'x' }).success).toBe(
      false,
    );
    expect(actionFeedbackResultSchema.safeParse({ qualityScore: 5, feedback: 'x' }).success).toBe(
      false,
    );
    expect(actionFeedbackResultSchema.safeParse({ qualityScore: 3.5, feedback: 'x' }).success).toBe(
      false,
    );
    expect(actionFeedbackResultSchema.safeParse({ qualityScore: 3, feedback: '   ' }).success).toBe(
      false,
    );
    expect(
      actionFeedbackResultSchema.safeParse({ qualityScore: 3, feedback: 'a'.repeat(1_501) })
        .success,
    ).toBe(false);
    expect(
      actionFeedbackResultSchema.safeParse({ qualityScore: 3, feedback: 'x', model: 'm' }).success,
    ).toBe(false);
  });
});
