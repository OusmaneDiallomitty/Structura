"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface StudentsDistributionChartProps {
  data: {
    name: string;
    value: number;
  }[];
}

const COLORS = [
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#10b981", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
];

export function StudentsDistributionChart({ data }: StudentsDistributionChartProps) {
  return (
    <Card className="border-2 shadow-md">
      <CardHeader className="bg-gradient-to-r from-violet-50 to-purple-50 border-b">
        <CardTitle className="text-base sm:text-lg truncate">Répartition des Élèves</CardTitle>
        <CardDescription className="text-xs sm:text-sm truncate">
          Distribution des élèves par classe
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        {/* Graphique camembert sans labels inline (trop de classes) */}
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              outerRadius={85}
              dataKey="value"
            >
              {data.map((_entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "white",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
              }}
              formatter={(value: number | undefined, name: any) => [value ?? 0, name]}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* Légende personnalisée — grille responsive qui s'étire sans déborder */}
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 max-h-36 overflow-y-auto pr-1">
          {data.map((entry, index) => (
            <div key={`${entry.name}-${index}`} className="flex items-center gap-1.5 min-w-0">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              <span className="text-xs text-muted-foreground truncate">{entry.name}</span>
              <span className="text-xs font-medium ml-auto shrink-0">{entry.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
