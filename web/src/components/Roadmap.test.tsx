import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Roadmap } from './Roadmap';
import type { RoadmapData } from '../shared/types';

const mockRoadmapData: RoadmapData = {
  horizons: [
    {
      id: 1,
      title: 'Horizon 1: Test Title',
      subtitle: 'Test Subtitle',
      status: 'Done',
      items: [
        { task: 'Task 1', done: true, description: 'Desc 1', issueNumber: 101 },
        { task: 'Task 2', done: false },
      ],
    },
  ],
  currentStatus: 'Currently testing.',
};

describe('Roadmap', () => {
  it('renders nothing when no data is provided', () => {
    render(<Roadmap data={undefined} />);
    expect(screen.getByText(/roadmap data is not available/i)).toBeInTheDocument();
  });

  it('renders horizons and items correctly', () => {
    render(<Roadmap data={mockRoadmapData} />);

    expect(screen.getByText('Horizon 1: Test Title')).toBeInTheDocument();
    expect(screen.getByText('Test Subtitle')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();

    expect(screen.getByText('Task 1')).toBeInTheDocument();
    expect(screen.getByText(': Desc 1')).toBeInTheDocument();
    expect(screen.getByText('#101')).toBeInTheDocument();
    expect(screen.getByText('Task 2')).toBeInTheDocument();

    expect(screen.getByLabelText('completed')).toBeInTheDocument();
    expect(screen.getByLabelText('pending')).toBeInTheDocument();

    expect(screen.getByText('Currently testing.')).toBeInTheDocument();
  });
});
