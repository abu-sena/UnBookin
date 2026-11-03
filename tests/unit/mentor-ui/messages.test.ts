import { describe, expect, it } from 'vitest';
import messages from '@/messages/id.json';

const suggestionKeys = [
  'summarizeModule',
  'explainConcept',
  'compareConcepts',
  'keyTakeaways',
  'applyToWork',
  'summarizeUnbook',
  'genericBigIdea',
  'genericExamples',
  'genericApply',
] as const;

const newKeys = [
  'button',
  'sheetTitle',
  'sheetDescription',
  'close',
  'loading',
  'loadingAria',
  'placeholder',
  'send',
  'stop',
  'retry',
  'loadOlder',
  'hint',
  'inputDisabled',
  'charCount',
  'typing',
  'quota',
  'quotaUnlimited',
  'quotaEmpty',
  'quotaReset',
  'quotaCta',
  'outsideLabel',
] as const;

const noticeKeys = ['stopped', 'refunded', 'partial', 'network'] as const;
const errorKeys = [
  'open',
  'history',
  'rateLimited',
  'sourceUnavailable',
  'notFound',
  'failed',
] as const;

describe('mentor messages', () => {
  it('sits immediately before the reader namespace', () => {
    const keys = Object.keys(messages);
    expect(keys.indexOf('mentor')).toBe(keys.indexOf('reader') - 1);
  });

  it('has every new mentor message key', () => {
    for (const key of newKeys) {
      expect(messages.mentor[key]).toMatch(/\S/);
    }
    for (const key of noticeKeys) {
      expect(messages.mentor.notices[key]).toMatch(/\S/);
    }
    for (const key of errorKeys) {
      expect(messages.mentor.errors[key]).toMatch(/\S/);
    }
    expect(messages.mentor.devUi.title).toMatch(/\S/);
  });

  it('has a question for every suggestion key', () => {
    for (const key of suggestionKeys) {
      expect(messages.mentor.suggestions[key]).toMatch(/\S/);
    }
    expect(Object.keys(messages.mentor.suggestions)).toHaveLength(suggestionKeys.length);
  });
});
