import type { Comment } from '../types/activity';
import { formatTimeAgo } from '../utils/time';

interface CommentListProps {
  comments: Comment[];
}

export function CommentList({
  comments,
}: CommentListProps): React.ReactElement {
  if (comments.length === 0) {
    return (
      <p className="text-sm text-amber-600 dark:text-amber-400 italic">
        No discussion yet
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {comments.map((comment) => (
        <li key={`${comment.type}-${comment.id}`} className="text-sm">
          <a
            href={comment.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group block bg-amber-50/50 dark:bg-neutral-800/50 rounded-lg p-3 border border-amber-100 dark:border-neutral-700 hover:border-amber-300 dark:hover:border-neutral-500 transition-all hover:shadow-sm"
          >
            <div className="flex items-center gap-2 mb-2">
              <img
                src={`https://github.com/${comment.author}.png`}
                alt={comment.author}
                className="w-5 h-5 rounded-full border border-amber-200 dark:border-neutral-600"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🐝</text></svg>';
                }}
              />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-amber-900 dark:text-amber-100 leading-none">
                  {comment.author}
                </span>
                <span className="text-[9px] text-amber-600 dark:text-amber-500 font-bold uppercase tracking-wider mt-0.5">
                  {comment.type === 'review' ? 'reviewed' : 'commented'}
                </span>
              </div>
              <span className="ml-auto text-[10px] font-mono text-amber-500 dark:text-amber-600">
                #{comment.issueOrPrNumber}
              </span>
            </div>
            <p className="text-amber-800 dark:text-neutral-300 text-xs italic leading-relaxed line-clamp-3 group-hover:text-amber-900 dark:group-hover:text-amber-100">
              "{comment.body}"
            </p>
            <time className="block mt-2 text-[9px] text-amber-500 dark:text-amber-600 font-medium">
              {formatTimeAgo(new Date(comment.createdAt))}
            </time>
          </a>
        </li>
      ))}
    </ul>
  );
}
