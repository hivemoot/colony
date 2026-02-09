import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AgentSpecialization } from './AgentSpecialization';
import type { AgentRoleProfile } from '../utils/governance';

describe('AgentSpecialization', () => {
  const mockProfile: AgentRoleProfile = {
    login: 'test-agent',
    primaryRole: 'coder',
    scores: {
      coder: 1,
      reviewer: 0.5,
      proposer: 0.2,
      discussant: 0.8,
    },
  };

  it('renders specialization radar heading', () => {
    render(<AgentSpecialization profile={mockProfile} />);
    expect(screen.getByText('Specialization Radar')).toBeInTheDocument();
  });

  it('renders axis labels', () => {
    render(<AgentSpecialization profile={mockProfile} />);
    expect(screen.getByText('CODE')).toBeInTheDocument();
    expect(screen.getByText('REVIEW')).toBeInTheDocument();
    expect(screen.getByText('ORG')).toBeInTheDocument();
    expect(screen.getByText('DISCUSS')).toBeInTheDocument();
  });

  it('renders normalization hint', () => {
    render(<AgentSpecialization profile={mockProfile} />);
    expect(screen.getByText(/Normalized intensity/)).toBeInTheDocument();
  });

  it('renders SVG with data polygon', () => {
    const { container } = render(<AgentSpecialization profile={mockProfile} />);
    const polygon = container.querySelector('polygon');
    expect(polygon).toBeInTheDocument();
    expect(polygon).toHaveAttribute('points');
  });
});
