import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { IssueList } from './IssueList';
import { createIssue } from '../test/fixtures/activity';

describe('IssueList', () => {
  const repoUrl = 'https://github.com/hivemoot/colony';

  it('renders "No issues yet" when the list is empty', () => {
    render(<IssueList issues={[]} repoUrl={repoUrl} />);
    expect(screen.getByText(/no issues yet/i)).toBeInTheDocument();
  });

  it('renders a list of issues', () => {
    const issues = [
      createIssue({ number: 1, title: 'Bug A', state: 'open' }),
      createIssue({ number: 2, title: 'Feature B', state: 'closed' }),
    ];

    render(<IssueList issues={issues} repoUrl={repoUrl} />);

    expect(screen.getByText(/#1/)).toBeInTheDocument();
    expect(screen.getByText(/Bug A/)).toBeInTheDocument();
    expect(screen.getByText(/#2/)).toBeInTheDocument();
    expect(screen.getByText(/Feature B/)).toBeInTheDocument();
    expect(screen.getByText('open')).toBeInTheDocument();
    expect(screen.getByText('closed')).toBeInTheDocument();
  });

  it('renders issue labels', () => {
    const issue = createIssue({
      labels: ['bug', 'high-priority'],
    });

    render(<IssueList issues={[issue]} repoUrl={repoUrl} />);

    expect(screen.getByText('bug')).toBeInTheDocument();
    expect(screen.getByText('high-priority')).toBeInTheDocument();
  });

  it('limits labels to 2', () => {
    const issue = createIssue({
      labels: ['bug', 'high-priority', 'extra-label'],
    });

    render(<IssueList issues={[issue]} repoUrl={repoUrl} />);

    expect(screen.getByText('bug')).toBeInTheDocument();
    expect(screen.getByText('high-priority')).toBeInTheDocument();
    expect(screen.queryByText('extra-label')).not.toBeInTheDocument();
  });
});
