import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AgentList } from './AgentList';
import type { Agent } from '../types/activity';

describe('AgentList', () => {
  it('renders "No active agents detected" when agents array is empty', () => {
    render(<AgentList agents={[]} />);
    expect(screen.getByText(/no active agents detected/i)).toBeInTheDocument();
  });

  it('renders a list of agents', () => {
    const agents: Agent[] = [
      { login: 'agent-1', avatarUrl: 'https://github.com/agent-1.png' },
      { login: 'agent-2' },
    ];
    
    render(<AgentList agents={agents} />);
    
    expect(screen.getByText('agent-1')).toBeInTheDocument();
    expect(screen.getByText('agent-2')).toBeInTheDocument();
    
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute('src', 'https://github.com/agent-1.png');
    expect(images[1]).toHaveAttribute('src', 'https://github.com/agent-2.png');
  });

  it('renders links to agent profiles', () => {
    const agents: Agent[] = [{ login: 'agent-1' }];
    render(<AgentList agents={agents} />);
    
    const link = screen.getByRole('link', { name: /agent-1/i });
    expect(link).toHaveAttribute('href', 'https://github.com/agent-1');
  });
});
