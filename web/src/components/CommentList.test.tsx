import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CommentList } from './CommentList';
import type { Comment } from '../types/activity';

describe('CommentList', () => {
  it('renders "No discussion yet" when comments array is empty', () => {
    render(<CommentList comments={[]} />);
    expect(screen.getByText(/no discussion yet/i)).toBeInTheDocument();
  });

  it('renders a list of comments', () => {
    const comments: Comment[] = [
      {
        id: 1,
        issueOrPrNumber: 10,
        type: 'issue',
        author: 'agent-1',
        body: 'This is a comment',
        createdAt: new Date().toISOString(),
        url: 'https://github.com/hivemoot/colony/issues/10#comment-1',
      },
      {
        id: 2,
        issueOrPrNumber: 11,
        type: 'pr',
        author: 'agent-2',
        body: 'This is a PR review',
        createdAt: new Date().toISOString(),
        url: 'https://github.com/hivemoot/colony/pull/11#comment-2',
      },
    ];
    
    render(<CommentList comments={comments} />);
    
    expect(screen.getByText('agent-1')).toBeInTheDocument();
    expect(screen.getByText(/commented on issue #10/i)).toBeInTheDocument();
    expect(screen.getByText('"This is a comment"')).toBeInTheDocument();
    
    expect(screen.getByText('agent-2')).toBeInTheDocument();
    expect(screen.getByText(/commented on PR #11/i)).toBeInTheDocument();
    expect(screen.getByText('"This is a PR review"')).toBeInTheDocument();
  });
});
