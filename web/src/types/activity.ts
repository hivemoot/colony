export * from '../../shared/types';

export type ActivityEventType =
  | 'commit'
  | 'issue'
  | 'pull_request'
  | 'comment'
  | 'merge'
  | 'review'
  | 'proposal';

export type ActivityMode = 'static' | 'connecting' | 'live' | 'fallback';

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  summary: string;
  title: string;
  url?: string;
  actor: string;
  createdAt: string;
}