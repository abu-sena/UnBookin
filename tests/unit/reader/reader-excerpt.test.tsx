import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import messages from '@/messages/id.json';
import { CHUNK_ONE, MODULE_ID } from './fixtures';
import { flush, mocks, renderReader } from './reader-harness';

function openFirstChip() {
  fireEvent.click(
    screen.getByRole('tab', { name: messages.module.layerToggle.layers.practitioner }),
  );
  const chips = screen.getAllByRole('button', { name: messages.module.source.chipFallback });
  const chip = chips[0];
  if (!chip) throw new Error('Expected a source chip');
  fireEvent.click(chip);
}

describe('ModuleReader source excerpts', () => {
  it('calls the action with the module and chunk, then shows the ready excerpt', async () => {
    let resolve!: (value: unknown) => void;
    mocks.actions.getSourceExcerpt.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    renderReader();

    openFirstChip();
    expect(mocks.actions.getSourceExcerpt).toHaveBeenCalledWith({
      moduleId: MODULE_ID,
      chunkId: CHUNK_ONE,
    });
    expect(screen.getByText(messages.module.source.loading)).toBeInTheDocument();

    resolve({
      ok: true,
      chunkId: CHUNK_ONE,
      pageFrom: 42,
      pageTo: 43,
      text: 'Kutipan sumber.',
    });
    await flush();

    expect(screen.getByText('Kutipan sumber.')).toBeInTheDocument();
    expect(screen.getByText('hlm. 42–43')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'hlm. 42' })).toBeInTheDocument();
  });

  it('shows a retry after an excerpt error and recovers', async () => {
    mocks.actions.getSourceExcerpt
      .mockResolvedValueOnce({ ok: false, code: 'failed' })
      .mockResolvedValueOnce({
        ok: true,
        chunkId: CHUNK_ONE,
        pageFrom: 7,
        pageTo: 7,
        text: 'Kutipan pulih.',
      });
    renderReader();

    openFirstChip();
    await flush();

    expect(screen.getByRole('alert')).toHaveTextContent(messages.module.source.error);
    fireEvent.click(screen.getByRole('button', { name: messages.module.source.retry }));
    await flush();

    expect(screen.getByText('Kutipan pulih.')).toBeInTheDocument();
    expect(mocks.actions.getSourceExcerpt).toHaveBeenCalledTimes(2);
  });
});
