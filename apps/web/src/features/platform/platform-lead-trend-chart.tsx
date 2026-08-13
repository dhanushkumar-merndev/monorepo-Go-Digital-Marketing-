'use client';

import type { AnalyticsPlatformLeadTrend } from '@gdm/contracts';
import { Skeleton } from '@gdm/ui/components/skeleton';
import { useEffect, useId, useRef, useState } from 'react';

interface PlatformLeadTrendChartProps {
  trend: AnalyticsPlatformLeadTrend;
}

const palette = ['#2563eb', '#0f766e', '#7c3aed', '#d97706', '#dc2626', '#0891b2'];

// One line per client sharing a common date axis — the generic AnalyticsChart
// renders exactly one series, which can't express "leads received, broken
// down by client" as a single chart, so this owns its own ECharts option.
export function PlatformLeadTrendChart({ trend }: PlatformLeadTrendChartProps) {
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const descriptionId = useId();

  useEffect(() => {
    let disposed = false;
    let chart: { dispose(): void; resize(): void; setOption(option: object): void } | undefined;
    let observer: ResizeObserver | undefined;

    void (async () => {
      const [{ init, use }, charts, components, renderers] = await Promise.all([
        import('echarts/core'),
        import('echarts/charts'),
        import('echarts/components'),
        import('echarts/renderers'),
      ]);
      if (disposed || !container.current) return;
      use([
        charts.LineChart,
        components.AriaComponent,
        components.GridComponent,
        components.LegendComponent,
        components.TooltipComponent,
        renderers.CanvasRenderer,
      ]);
      chart = init(container.current, undefined, { renderer: 'canvas' });
      chart.setOption(optionFor(trend));
      observer = new ResizeObserver(() => chart?.resize());
      observer.observe(container.current);
      setReady(true);
    })();

    return () => {
      disposed = true;
      observer?.disconnect();
      chart?.dispose();
    };
  }, [trend]);

  return (
    <div aria-describedby={descriptionId} aria-label="Leads received by client" role="img">
      <div className="relative h-80 w-full">
        {/* Fixed non-zero size at all times, same reasoning as AnalyticsChart:
            ECharts must never measure a 0x0 element on init. */}
        {!ready ? <Skeleton className="absolute inset-0 h-80 w-full" /> : null}
        <div className="h-80 w-full" ref={container} />
      </div>
      <p className="text-muted-foreground mt-3 text-xs leading-5" id={descriptionId}>
        Daily lead volume for the selected period, one line per client.
      </p>
    </div>
  );
}

function optionFor(trend: AnalyticsPlatformLeadTrend): object {
  const axis = {
    axisLabel: { color: '#64748b', hideOverlap: true },
    axisLine: { lineStyle: { color: '#cbd5e1' } },
    splitLine: { lineStyle: { color: '#e2e8f0' } },
  };
  return {
    animationDuration: 300,
    aria: { decal: { show: true }, enabled: true },
    color: palette,
    grid: { bottom: 56, containLabel: true, left: 12, right: 20, top: 16 },
    legend: { bottom: 0, type: 'scroll' },
    series: trend.series.map((line) => ({
      data: line.values,
      name: line.client_name,
      showSymbol: trend.categories.length < 32,
      smooth: true,
      type: 'line',
    })),
    tooltip: { confine: true, trigger: 'axis' },
    xAxis: { ...axis, data: trend.categories, type: 'category' },
    yAxis: { ...axis, type: 'value' },
  };
}
