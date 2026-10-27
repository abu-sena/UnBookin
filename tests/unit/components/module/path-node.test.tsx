import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModulePath, PathNode } from '@/components/module/path-node';
import { renderWithIntl } from './render';

afterEach(cleanup);

describe('PathNode', () => {
  it('states the status in the accessible name instead of colour alone', () => {
    renderWithIntl(<PathNode number={2} title="Sistem, bukan panggung" minutes={8} state="locked" />);

    const node = screen.getByRole('button', {
      name: 'Modul 2: Sistem, bukan panggung, terkunci',
    });
    expect(node).toBeDisabled();
  });

  it('does not fire a selection for a locked node', () => {
    const onSelect = vi.fn();
    renderWithIntl(
      <PathNode
        number={2}
        title="Sistem, bukan panggung"
        minutes={8}
        state="locked"
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /terkunci/ }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('selects an available node', () => {
    const onSelect = vi.fn();
    renderWithIntl(
      <PathNode number={1} title="Pemimpin membangun sistem" minutes={7} state="available" onSelect={onSelect} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /tersedia/ }));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('marks the current node with aria-current', () => {
    renderWithIntl(<PathNode number={3} title="Budaya disiplin" minutes={9} state="current" />);

    expect(screen.getByRole('button', { name: /sedang dipelajari/ })).toHaveAttribute(
      'aria-current',
      'step',
    );
  });
});

describe('ModulePath', () => {
  it('renders every node and reports the index of the selected node', () => {
    const onSelect = vi.fn();
    renderWithIntl(
      <ModulePath
        nodes={[
          { title: 'Modul satu', minutes: 5, state: 'done' },
          { title: 'Modul dua', minutes: 7, state: 'current' },
          { title: 'Modul tiga', minutes: 9, state: 'locked' },
        ]}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByRole('list', { name: 'Jalur modul' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByRole('button', { name: /Modul 3: Modul tiga, terkunci/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Modul dua/ }));
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});
