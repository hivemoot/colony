import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Card } from './Card';

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Hello world</Card>);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders with title and subtitle', () => {
    render(
      <Card title="My Title" subtitle="My Subtitle">
        Content
      </Card>
    );
    expect(
      screen.getByRole('heading', { name: 'My Title', level: 2 })
    ).toBeInTheDocument();
    expect(screen.getByText('My Subtitle')).toBeInTheDocument();
  });

  it('renders with headerAction', () => {
    render(
      <Card title="Title" headerAction={<button>Action</button>}>
        Content
      </Card>
    );
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<Card className="p-4">Content</Card>);
    const section = screen.getByText('Content').closest('section');
    expect(section).toHaveClass('p-4');
  });

  it('renders no header when no title, subtitle, or headerAction', () => {
    render(<Card>Content only</Card>);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('renders JSX title with emoji', () => {
    render(
      <Card
        title={
          <>
            <span role="img" aria-label="bees">
              🐝
            </span>
            Active Agents
          </>
        }
      >
        Content
      </Card>
    );
    expect(
      screen.getByRole('heading', { name: /active agents/i, level: 2 })
    ).toBeInTheDocument();
  });
});
