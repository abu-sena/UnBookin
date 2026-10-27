import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConceptMap } from '@/components/module/concept-map';
import { renderWithIntl } from './render';

afterEach(cleanup);

const nodes = [
  { id: 'core', label: 'Pemimpin membangun sistem', kind: 'core' as const },
  { id: 'practice', label: 'Budaya disiplin', kind: 'concept' as const },
  { id: 'example', label: 'Contoh: rapat mingguan', kind: 'example' as const },
];

const edges = [
  { from: 'core', to: 'practice', label: 'mendukung' },
  { from: 'practice', to: 'example' },
  { from: 'missing', to: 'core', label: 'edge rusak' },
  { from: 'core', to: 'also-missing' },
];

describe('ConceptMap', () => {
  it('renders nodes and valid edges while ignoring dangling edge ids', () => {
    renderWithIntl(<ConceptMap nodes={nodes} edges={edges} />);

    expect(screen.getByRole('button', { name: 'Pemimpin membangun sistem, Inti' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Budaya disiplin, Konsep' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Contoh: rapat mingguan, Contoh' })).toBeInTheDocument();
    expect(screen.getByText('mendukung')).toBeInTheDocument();
    expect(screen.queryByText('edge rusak')).not.toBeInTheDocument();
  });

  it('reports the selected node and shows its label in the details area', () => {
    const onNodeSelect = vi.fn();
    renderWithIntl(<ConceptMap nodes={nodes} edges={edges} onNodeSelect={onNodeSelect} />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Ketuk salah satu node untuk membaca penjelasannya.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Budaya disiplin, Konsep' }));

    expect(onNodeSelect).toHaveBeenCalledWith('practice');
    expect(screen.getByRole('status')).toHaveTextContent('Konsep dipilih');
    expect(screen.getByRole('status')).toHaveTextContent('Budaya disiplin');
  });

  it('handles an empty graph gracefully', () => {
    renderWithIntl(<ConceptMap nodes={[]} edges={[]} />);

    expect(screen.getByText('Peta konsep belum tersedia untuk modul ini.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Peta konsep modul' })).not.toBeInTheDocument();
  });
});
