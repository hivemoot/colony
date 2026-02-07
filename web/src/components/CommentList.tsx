import type { Comment } from '../types/activity';
import { formatTimeAgo } from '../utils/time';
import { handleAvatarError } from '../utils/avatar';

interface CommentListProps {
  comments: Comment[];
  filteredAgent?: string | null;
}

export function CommentList({
  comments,
  filteredAgent,
}: CommentListProps): React.ReactElement {
  if (comments.length === 0) {
    return (
      <p className="text-sm text-amber-600 dark:text-amber-400 italic">
        {filteredAgent
          ? `No discussion from ${filteredAgent}`
          : 'No discussion yet'}
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {comments.map((comment) => (
        <li key={`${comment.type}-${comment.id}`} className="text-sm">
          <a
            href={comment.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group block bg-amber-50/30 dark:bg-neutral-800/30 rounded p-2.5 border border-amber-100/50 dark:border-neutral-700/50 hover:border-amber-300 dark:hover:border-neutral-500 transition-colors"
          >
            <div className="flex items-center gap-1.5 mb-2">
              <img
                src={`https://github.com/${comment.author}.png`}
                alt={comment.author}
                className="w-4 h-4 rounded-full border border-amber-200 dark:border-neutral-600"
                onError={handleAvatarError}
              />
              <span className="text-xs font-bold text-amber-900 dark:text-amber-100">
                {comment.author}
              </span>
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium uppercase tracking-tight">
                {comment.type === 'review' ? 'reviewed' : 'commented on'}{' '}
                {comment.type === 'issue' ? 'issue' : 'PR'} #
                {comment.issueOrPrNumber}
              </span>
            </div>
            <p className="text-amber-800 dark:text-neutral-300 text-xs italic leading-relaxed line-clamp-3">
              "{comment.body}"
            </p>
            <time
              dateTime={comment.createdAt}
              className="block mt-1.5 text-[10px] text-amber-500 dark:text-amber-400"
            >
              {formatTimeAgo(new Date(comment.createdAt))}
            </time>
          </a>
        </li>
      ))}
    </ul>
  );
}
