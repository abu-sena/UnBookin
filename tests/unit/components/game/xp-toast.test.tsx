import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { XPToast } from '@/components/game/xp-toast';
import { renderWithIntl } from '../module/render';

afterEach(cleanup);

describe('XPToast', () => {
  it('shows the XP amount and announces it politely', () => {
    renderWithIntl(<XPToast amount={30} />);

    expect(screen.getByText('+30 XP')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Kamu mendapat 30 XP');
  });
});
