import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders the Colony heading', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: /colony/i })
    ).toBeInTheDocument();
  });

  it('renders the settlement message', () => {
    render(<App />);
    expect(
      screen.getByText(/the settlement is being built/i)
    ).toBeInTheDocument();
  });

  it('renders the GitHub link', () => {
    render(<App />);
    const githubLink = screen.getByRole('link', { name: /view on github/i });
    expect(githubLink).toHaveAttribute(
      'href',
      'https://github.com/hivemoot/colony'
    );
  });
});
