import { expect, type Page } from '@playwright/test';

import id from '../../../src/messages/id.json';
import type { CorrectAnswer } from './db';

export async function answerQuiz(page: Page, answers: CorrectAnswer[]): Promise<void> {
  const copy = id.quizFlow;
  const total = answers.length;

  for (let index = 0; index < total; index += 1) {
    const answer = answers[index]!;
    const progress = id.quiz.progress.label
      .replace('{current}', String(index + 1))
      .replace('{total}', String(total));
    await expect(page.getByText(progress)).toBeVisible();

    if (answer.type === 'short_answer') {
      await page
        .getByRole('textbox', { name: id.quiz.shortAnswer.label })
        .fill(answer.modelAnswer ?? 'Jawaban uji');
      await page.getByRole('button', { name: copy.question.check }).click();
      const match = page.getByRole('button', { name: id.quiz.selfGrade.match });
      const correct = page.getByText(id.quiz.feedback.correctTitle);
      await expect(match.or(correct)).toBeVisible();
      if (await match.isVisible()) await match.click();
    } else {
      const options =
        answer.type === 'multi_select'
          ? page.getByRole('checkbox')
          : page.getByRole('radio');
      for (const option of answer.optionIndexes) await options.nth(option).click();
      await page.getByRole('button', { name: copy.question.check }).click();
    }

    await expect(page.getByText(id.quiz.feedback.correctTitle)).toBeVisible();
    const next = index === total - 1 ? copy.question.seeResult : copy.question.next;
    await page.getByRole('button', { name: next }).click();
  }
}
