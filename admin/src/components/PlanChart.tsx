'use client';

import {
  BarChart, Bar, XAxis, YAxis, Cell,
  ResponsiveContainer, Tooltip as ChartTooltip,
} from 'recharts';

const PLAN_LABELS: Record<string, string> = {
  FREE: 'Free', PRO: 'Pro', PRO_PLUS: 'Pro Plus',
};
const PLAN_COLORS: Record<string, string> = {
  FREE: '#94a3b8', PRO: '#60a5fa', PRO_PLUS: '#a78bfa',
};

interface Props {
  data: { plan: string; count: number }[];
}

export default function PlanChart({ data }: Props) {
  const chartData = data.map(({ plan, count }) => ({
    name: PLAN_LABELS[plan] ?? plan,
    count,
    fill: PLAN_COLORS[plan] ?? '#94a3b8',
  }));

  if (chartData.length === 0) {
    return (
      <div className="h-[150px] flex items-center justify-center text-sm text-gray-300">
        Aucune donnée
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={150}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 44, bottom: 0, left: 0 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category" dataKey="name" width={72}
          tick={{ fontSize: 13, fill: '#94a3b8', fontWeight: 500 }}
          axisLine={false} tickLine={false}
        />
        <ChartTooltip
          cursor={{ fill: '#f8fafc' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const v = payload[0].value as number;
            return (
              <div className="bg-white border border-gray-100 shadow-lg rounded-xl px-3 py-2 text-sm font-semibold text-gray-800">
                {v} école{v > 1 ? 's' : ''}
              </div>
            );
          }}
        />
        <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={28}
          label={{ position: 'right', fontSize: 13, fill: '#94a3b8', fontWeight: 600 }}
        >
          {chartData.map((e, i) => <Cell key={i} fill={e.fill} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
