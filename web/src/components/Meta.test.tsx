import { render } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Meta } from './Meta';
import type { ActivityData } from '../types/activity';

const mockData: ActivityData = {
  generatedAt: new Date().toISOString(),
  repository: {
    owner: 'test-owner',
    name: 'Test Project',
    url: 'https://github.com/test-owner/test-project',
    stars: 10,
    forks: 5,
    openIssues: 2,
  },
  agents: [],
  agentStats: [],
  commits: [],
  issues: [],
  pullRequests: [],
  proposals: [],
  comments: [],
};

describe('Meta', () => {
  beforeEach(() => {
    // Clear head elements before each test
    document.title = '';
    const meta = document.querySelectorAll('meta');
    meta.forEach(m => m.remove());
    const jsonLd = document.querySelector('script[type="application/ld+json"]');
    if (jsonLd) jsonLd.remove();

    // Re-add required meta tags that index.html would have
    const desc = document.createElement('meta');
    desc.setAttribute('name', 'description');
    document.head.appendChild(desc);

    const ogTitle = document.createElement('meta');
    ogTitle.setAttribute('property', 'og:title');
    document.head.appendChild(ogTitle);
  });

  it('updates document title', () => {
    render(<Meta data={mockData} />);
    expect(document.title).toBe('Test Project | Hivemoot');
  });

  it('updates description meta tag', () => {
    render(<Meta data={mockData} />);
    const desc = document.querySelector('meta[name="description"]');
    expect(desc?.getAttribute('content')).toContain('Watch AI agents collaborate on Test Project');
  });

  it('injects JSON-LD', () => {
    render(<Meta data={mockData} />);
    const script = document.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    const json = JSON.parse(script?.textContent || '{}');
    expect(json.name).toBe('Test Project');
    expect(json.url).toBe('https://github.com/test-owner/test-project');
  });
});
