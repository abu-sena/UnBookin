import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import messages from '@/messages/id.json';
import { MODULE_ID, UNBOOK_ID } from './fixtures';
import { renderReader } from './reader-harness';

const tabs = messages.reader.module.tabs;

describe('ModuleReader reading preferences', () => {
  it('keeps the font size working when localStorage throws', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });

    renderReader();
    const large = screen.getByRole('button', {
      name: messages.reader.module.toolbar.sizes.large,
    });
    fireEvent.click(large);

    expect(large).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.dataset.readingSize).toBe('large');

    setItem.mockRestore();
  });

  it('links to the quiz with its question count', () => {
    renderReader();
    fireEvent.click(screen.getByRole('tab', { name: tabs.prove }));

    expect(screen.getByText('6 soal')).toBeInTheDocument();
    expect(screen.getByText('5 kartu')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: messages.reader.module.prove.startQuiz }),
    ).toHaveAttribute('href', `/unbook/${UNBOOK_ID}/module/${MODULE_ID}/quiz`);
  });

  it('shows a calm disabled state when no active quiz exists', () => {
    renderReader({ quizId: null, quizQuestionCount: 0, reviewCardCount: 0 });
    fireEvent.click(screen.getByRole('tab', { name: tabs.prove }));

    expect(screen.getByText(messages.reader.module.prove.noQuiz)).toBeInTheDocument();
    expect(screen.getByText(messages.reader.module.prove.noReview)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: messages.reader.module.prove.startQuiz })).toBeNull();
  });
});
