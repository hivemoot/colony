import type { AgentRoleProfile } from '../utils/governance';

interface AgentSpecializationProps {
  profile: AgentRoleProfile;
}

export function AgentSpecialization({
  profile,
}: AgentSpecializationProps): React.ReactElement {
  const size = 160;
  const center = size / 2;
  const radius = size * 0.35;

  // Axis mapping:
  // North: Coder (CODE)
  // East: Reviewer (REVIEW)
  // South: Proposer (ORG)
  // West: Discussant (DISCUSS)
  const getPoint = (
    score: number,
    angleDeg: number
  ): { x: number; y: number } => {
    const angleRad = (angleDeg - 90) * (Math.PI / 180);
    const r = score * radius;
    return {
      x: center + r * Math.cos(angleRad),
      y: center + r * Math.sin(angleRad),
    };
  };

  const pCode = getPoint(profile.scores.coder, 0);
  const pReview = getPoint(profile.scores.reviewer, 90);
  const pOrg = getPoint(profile.scores.proposer, 180);
  const pDiscuss = getPoint(profile.scores.discussant, 270);

  const points = `${pCode.x},${pCode.y} ${pReview.x},${pReview.y} ${pOrg.x},${pOrg.y} ${pDiscuss.x},${pDiscuss.y}`;

  return (
    <div className="flex flex-col items-center">
      <h4 className="text-xs font-bold text-amber-900/40 dark:text-amber-100/40 uppercase tracking-wider mb-2">
        Specialization Radar
      </h4>
      <div className="relative w-40 h-40">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="overflow-visible"
        >
          {/* Grid lines */}
          <line
            x1={center}
            y1={center - radius}
            x2={center}
            y2={center + radius}
            className="stroke-amber-200 dark:stroke-neutral-600"
            strokeWidth="1"
          />
          <line
            x1={center - radius}
            y1={center}
            x2={center + radius}
            y2={center}
            className="stroke-amber-200 dark:stroke-neutral-600"
            strokeWidth="1"
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            className="stroke-amber-200 dark:stroke-neutral-600 fill-none"
            strokeWidth="1"
            strokeDasharray="4 2"
          />

          {/* Data polygon */}
          <polygon
            points={points}
            className="fill-amber-500/30 stroke-amber-500"
            strokeWidth="2"
            strokeLinejoin="round"
          />

          {/* Labels */}
          <text
            x={center}
            y={center - radius - 8}
            textAnchor="middle"
            className="text-[10px] font-bold fill-amber-700 dark:fill-amber-300"
          >
            CODE
          </text>
          <text
            x={center + radius + 8}
            y={center + 4}
            textAnchor="start"
            className="text-[10px] font-bold fill-amber-700 dark:fill-amber-300"
          >
            REVIEW
          </text>
          <text
            x={center}
            y={center + radius + 14}
            textAnchor="middle"
            className="text-[10px] font-bold fill-amber-700 dark:fill-amber-300"
          >
            ORG
          </text>
          <text
            x={center - radius - 8}
            y={center + 4}
            textAnchor="end"
            className="text-[10px] font-bold fill-amber-700 dark:fill-amber-300"
          >
            DISCUSS
          </text>
        </svg>
      </div>
      <p className="mt-2 text-[10px] text-amber-600/60 dark:text-amber-400/60 italic">
        Normalized intensity of activity
      </p>
    </div>
  );
}
