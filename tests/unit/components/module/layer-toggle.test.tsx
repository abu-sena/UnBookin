import { cleanup, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LayerToggle, type LayerValue } from '@/components/module/layer-toggle';
import { renderWithIntl } from './render';

afterEach(cleanup);

function ControlledToggle({ onChange }: { onChange?: (value: LayerValue) => void }) {
  const [value, setValue] = useState<LayerValue>('eli5');
  return (
    <LayerToggle
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

describe('LayerToggle', () => {
  it('changes value when a segment is pressed', () => {
    const onChange = vi.fn();
    renderWithIntl(<ControlledToggle onChange={onChange} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Praktisi' }));

    expect(onChange).toHaveBeenCalledWith('practitioner');
    expect(screen.getByRole('tab', { name: 'Praktisi' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('moves with the arrow keys and keeps roving focus', () => {
    const onChange = vi.fn();
    renderWithIntl(<ControlledToggle onChange={onChange} />);

    const first = screen.getByRole('tab', { name: 'Sederhana' });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });

    const second = screen.getByRole('tab', { name: 'Praktisi' });
    expect(onChange).toHaveBeenCalledWith('practitioner');
    expect(second).toHaveFocus();

    fireEvent.keyDown(second, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('eli5');
  });

  it('wraps around with the arrow keys', () => {
    const onChange = vi.fn();
    renderWithIntl(<ControlledToggle onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Sederhana' }), { key: 'ArrowLeft' });

    expect(onChange).toHaveBeenCalledWith('expert');
  });

  it('renders crossfading panels only when layer content is provided', () => {
    renderWithIntl(
      <LayerToggle
        value="eli5"
        onValueChange={() => undefined}
        layers={{ eli5: <p>Teks sederhana</p>, practitioner: <p>Teks praktisi</p> }}
      />,
    );

    expect(screen.getByText('Teks sederhana')).toBeInTheDocument();
    expect(screen.getAllByRole('tabpanel')[0]).toHaveAttribute('aria-hidden', 'false');
  });
});
