export interface Commit {
  sha: string;
  message: string;
  author: string;
  date: string;
}

export interface Issue {
  number: number;
  title: string;
  state: 'open' | 'closed';
  labels: string[];
  createdAt: string;
}

export interface PullRequest {
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  author: string;
  createdAt: string;
}

export interface ActivityData {
  generatedAt: string;
  repository: {
    owner: string;
    name: string;
    url: string;
  };
  commits: Commit[];
  issues: Issue[];
  pullRequests: PullRequest[];
}
