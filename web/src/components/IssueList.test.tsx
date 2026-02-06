import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { IssueList } from './IssueList';
import type { Issue } from '../types/activity';

describe('IssueList', () => {
  const repoUrl = 'https://github.com/hivemoot/colony';

  it('renders "No issues yet" when issues array is empty', () => {
    render(<IssueList issues={[]} repoUrl={repoUrl} />);
    expect(screen.getByText(/no issues yet/i)).toBeInTheDocument();
  });

  it('renders a list of issues with correct details', () => {
    const issues: Issue[] = [
      {
        number: 1,
        title: 'Bug report',
        state: 'open',
        labels: ['bug'],
        author: 'scout',
        createdAt: '2026-02-05T09:00:00Z',
      },
      {
        number: 2,
        title: 'Feature request',
        state: 'closed',
        labels: [],
        author: 'worker',
        createdAt: '2026-02-05T08:00:00Z',
        closedAt: '2026-02-05T10:00:00Z',
      },
    ];

    render(<IssueList issues={issues} repoUrl={repoUrl} />);

    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('Bug report')).toBeInTheDocument();
    expect(screen.getByText('open')).toBeInTheDocument();
    expect(screen.getByText('bug')).toBeInTheDocument();

    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('Feature request')).toBeInTheDocument();
    expect(screen.getByText('closed')).toBeInTheDocument();
  });

  it('links to the correct issue URL', () => {
    const issues: Issue[] = [
      {
        number: 42,
        title: 'Test issue',
        state: 'open',
        labels: [],
        author: 'agent-1',
        createdAt: '2026-02-05T09:00:00Z',
      },
    ];

    render(<IssueList issues={issues} repoUrl={repoUrl} />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/hivemoot/colony/issues/42'
    );
  });

  it('renders labels when present', () => {
    const issues: Issue[] = [
      {
        number: 1,
        title: 'Multi-label issue',
        state: 'open',
        labels: ['enhancement', 'documentation', 'help wanted'],
        author: 'scout',
        createdAt: '2026-02-05T09:00:00Z',
      },
    ];

    render(<IssueList issues={issues} repoUrl={repoUrl} />);

    // Only first 2 labels are shown (slice(0, 2) in component)
    expect(screen.getByText('enhancement')).toBeInTheDocument();
    expect(screen.getByText('documentation')).toBeInTheDocument();
    expect(screen.queryByText('help wanted')).not.toBeInTheDocument();
  });

  it('applies transition-colors to list item links', () => {
    const issues: Issue[] = [
      {
        number: 1,
        title: 'Test issue',
        state: 'open',
        labels: [],
        author: 'agent-1',
        createdAt: '2026-02-05T09:00:00Z',
      },
    ];

    render(<IssueList issues={issues} repoUrl={repoUrl} />);

    const link = screen.getByRole('link');
    expect(link.className).toContain('transition-colors');
  });
});
