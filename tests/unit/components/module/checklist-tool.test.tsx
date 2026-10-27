import { cleanup, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChecklistTool } from '@/components/module/checklist-tool';
import { renderWithIntl } from './render';

afterEach(cleanup);

const items = ['Tulis agenda', 'Minta umpan balik', 'Tetapkan pemilik', 'Jadwalkan tinjauan', 'Rayakan'];

function ControlledChecklist({ onToggle }: { onToggle?: (index: number) => void }) {
  const [checked, setChecked] = useState<number[]>([0, 2]);
  return (
    <ChecklistTool
      title="Alat: rapat mingguan"
      items={items}
      checked={checked}
      onToggle={(index) => {
        setChecked((current) =>
          current.includes(index) ? current.filter((item) => item !== index) : [...current, index],
        );
        onToggle?.(index);
      }}
    />
  );
}

describe('ChecklistTool', () => {
  it('shows progress text and a progress bar', () => {
    renderWithIntl(<ControlledChecklist />);

    expect(screen.getByText('2/5')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Checklist: 2 dari 5 selesai' })).toBeInTheDocument();
  });

  it('reports the toggled index and updates the count', () => {
    const onToggle = vi.fn();
    renderWithIntl(<ControlledChecklist onToggle={onToggle} />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Minta umpan balik' }));

    expect(onToggle).toHaveBeenCalledWith(1);
    expect(screen.getByText('3/5')).toBeInTheDocument();
  });
});
