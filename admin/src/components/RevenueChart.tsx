'use client';

import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip,
} from 'recharts';

interface Props {
  data: { month: string; revenue: number }[];
}

function fmtRevenue(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${Math.round(n / 1_000)}k`;
  return String(n);
}

export default function RevenueChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-gray-300">
        Aucune donnée de paiement
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={256}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}    />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false} tickLine={false}
        />
        <YAxis
          tickFormatter={fmtRevenue}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false} tickLine={false}
          width={44}
        />
        <ChartTooltip
          cursor={{ stroke: '#6366f1', strokeWidth: 1, strokeDasharray: '4 2' }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const v = payload[0].value as number;
            return (
              <div className="bg-white border border-gray-100 shadow-lg rounded-xl px-3 py-2">
                <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                <p className="text-sm font-bold text-gray-900">
                  {v.toLocaleString('fr-FR')} GNF
                </p>
              </div>
            );
          }}
        />
        <Area
          type="monotone" dataKey="revenue"
          stroke="#6366f1" strokeWidth={2}
          fill="url(#revGrad)"
          dot={{ r: 4, fill: '#6366f1', strokeWidth: 0 }}
          activeDot={{ r: 6, fill: '#6366f1', strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
