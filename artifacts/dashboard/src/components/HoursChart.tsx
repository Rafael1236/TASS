import { useGetDashboardChart, getGetDashboardChartQueryKey } from "@workspace/api-client-react";
import { DashboardFilters } from "@/hooks/use-dashboard-filters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

interface HoursChartProps {
  filters: DashboardFilters;
}

export function HoursChart({ filters }: HoursChartProps) {
  const { data, isLoading } = useGetDashboardChart(
    {
      date_range: filters.date_range as any,
      from: filters.from,
      to: filters.to,
    },
    {
      query: {
        queryKey: getGetDashboardChartQueryKey({
          date_range: filters.date_range as any,
          from: filters.from,
          to: filters.to,
        }),
      },
    }
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-medium">Horas Trabajadas por Técnico</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[350px] w-full" />
        ) : data?.entries?.length ? (
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.entries}>
                <XAxis
                  dataKey="tecnico_nombre"
                  stroke="#888888"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#888888"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${value}h`}
                />
                <Tooltip
                  cursor={{ fill: "var(--chart-cursor, rgba(255,255,255,0.06))" }}
                  contentStyle={{
                    backgroundColor: "var(--chart-tooltip-bg, #1A1A1A)",
                    borderColor: "var(--chart-tooltip-border, #3D3D3D)",
                    color: "var(--chart-tooltip-text, #FFFFFF)",
                  }}
                />
                <Bar
                  dataKey="hours_worked"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-[350px] items-center justify-center text-sm text-muted-foreground">
            No hay datos para mostrar
          </div>
        )}
      </CardContent>
    </Card>
  );
}
