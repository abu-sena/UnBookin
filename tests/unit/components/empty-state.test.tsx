import { cleanup, render, screen } from '@testing-library/react';
import { BookOpenIcon } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmptyState } from '@/components/ui-kit/empty-state';

afterEach(cleanup);

describe('EmptyState', () => {
  it('renders the message and a single enabled action button', () => {
    const onAction = vi.fn();

    render(
      <EmptyState
        icon={BookOpenIcon}
        message="Pustakamu masih kosong."
        actionLabel="Unbook bacaan pertamamu"
        onAction={onAction}
      />,
    );

    expect(screen.getByText('Pustakamu masih kosong.')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Unbook bacaan pertamamu' });
    expect(button).toBeEnabled();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('renders the action disabled without a handler', () => {
    render(
      <EmptyState
        icon={BookOpenIcon}
        message="Pustakamu masih kosong."
        actionLabel="Unbook bacaan pertamamu"
      />,
    );

    expect(screen.getByRole('button', { name: 'Unbook bacaan pertamamu' })).toBeDisabled();
  });
});
