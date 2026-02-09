import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AgentList } from './AgentList';
import type { Agent } from '../types/activity';

const agents: Agent[] = [
  { login: 'agent-1', avatarUrl: 'https://github.com/agent-1.png' },
  { login: 'agent-2' },
];

describe('AgentList', () => {
  it('renders "No active agents detected" when agents array is empty', () => {
    render(<AgentList agents={[]} />);
    expect(screen.getByText(/no active agents detected/i)).toBeInTheDocument();
  });

  it('renders a list of agents with profile links', () => {
    const { container } = render(<AgentList agents={agents} />);

    expect(screen.getByText('agent-1')).toBeInTheDocument();
    expect(screen.getByText('agent-2')).toBeInTheDocument();

    const images = container.querySelectorAll('img');
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute('src', 'https://github.com/agent-1.png');
    expect(images[0]).toHaveAttribute('alt', '');
    expect(images[0]).toHaveAttribute('loading', 'lazy');
    expect(images[1]).toHaveAttribute('src', 'https://github.com/agent-2.png');
    expect(images[1]).toHaveAttribute('alt', '');
    expect(images[1]).toHaveAttribute('loading', 'lazy');

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', 'https://github.com/agent-1');
    expect(links[1]).toHaveAttribute('href', 'https://github.com/agent-2');
  });

  it('renders interactive buttons for agent selection', () => {
    render(<AgentList agents={[{ login: 'agent-1' }]} />);

    const button = screen.getByRole('button', { name: /agent-1/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('title', 'Filter by agent-1');
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onSelectAgent with agent login on click', () => {
    const onSelect = vi.fn();
    render(<AgentList agents={agents} onSelectAgent={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: /agent-1/i }));
    expect(onSelect).toHaveBeenCalledWith('agent-1');
  });

  it('calls onSelectAgent with null when clicking the already-selected agent', () => {
    const onSelect = vi.fn();
    render(
      <AgentList
        agents={agents}
        selectedAgent="agent-1"
        onSelectAgent={onSelect}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /agent-1/i }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('marks selected agent as pressed and shows clear filter title', () => {
    render(<AgentList agents={agents} selectedAgent="agent-1" />);

    const selectedButton = screen.getByRole('button', { name: /agent-1/i });
    expect(selectedButton).toHaveAttribute('aria-pressed', 'true');
    expect(selectedButton).toHaveAttribute('title', 'Clear filter for agent-1');

    const otherButton = screen.getByRole('button', { name: /agent-2/i });
    expect(otherButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('dims unselected agents when one is selected', () => {
    render(<AgentList agents={agents} selectedAgent="agent-1" />);

    const otherWrapper = screen
      .getByRole('button', { name: /agent-2/i })
      .closest('div');
    expect(otherWrapper).not.toBeNull();
    expect(otherWrapper?.className).toContain('opacity-40');

    const selectedWrapper = screen
      .getByRole('button', { name: /agent-1/i })
      .closest('div');
    expect(selectedWrapper).not.toBeNull();
    expect(selectedWrapper?.className).not.toContain('opacity-40');
  });

  it('includes focus ring offset on agent login links', () => {
    render(<AgentList agents={[{ login: 'agent-1' }]} />);

    const link = screen.getByRole('link', { name: 'agent-1' });
    expect(link.className).toContain('focus-visible:ring-offset-2');
    expect(link.className).toContain(
      'dark:focus-visible:ring-offset-neutral-900'
    );
  });

  it('marks the bee badge as decorative with aria-hidden', () => {
    const { container } = render(<AgentList agents={[{ login: 'agent-1' }]} />);
    const badge = container.querySelector('.bg-amber-500');
    expect(badge).toHaveAttribute('aria-hidden', 'true');
  });
});
