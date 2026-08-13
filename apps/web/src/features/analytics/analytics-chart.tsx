'use client';

import type { AnalyticsSeries } from '@gdm/contracts';
import { Skeleton } from '@gdm/ui/components/skeleton';
import { useEffect, useId, useRef, useState } from 'react';

interface AnalyticsChartProps {
  series: AnalyticsSeries;
}

const palette = ['#2563eb', '#0f766e', '#7c3aed', '#d97706', '#dc2626', '#0891b2'];

export function AnalyticsChart({ series }: AnalyticsChartProps) {
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
        charts.BarChart,
        charts.FunnelChart,
        charts.LineChart,
        charts.PieChart,
        components.AriaComponent,
        components.DatasetComponent,
        components.GridComponent,
        components.LegendComponent,
        components.TooltipComponent,
        renderers.CanvasRenderer,
      ]);
      chart = init(container.current, undefined, { renderer: 'canvas' });
      chart.setOption(optionFor(series));
      observer = new ResizeObserver(() => chart?.resize());
      observer.observe(container.current);
      setReady(true);
    })();

    return () => {
      disposed = true;
      observer?.disconnect();
      chart?.dispose();
    };
  }, [series]);

  return (
    <div aria-describedby={descriptionId} aria-label={series.label} role="img">
      <div className="relative h-72 w-full">
        {/* The chart container keeps a fixed, non-zero size at all times so
            ECharts never measures a 0x0 element on init — collapsing it to
            h-0 until `ready` was the cause of "Can't get DOM width or
            height." The skeleton overlays it instead of replacing it. */}
        {!ready ? <Skeleton className="absolute inset-0 h-72 w-full" /> : null}
        <div className="h-72 w-full" ref={container} />
      </div>
      <p className="text-muted-foreground mt-3 text-xs leading-5" id={descriptionId}>
        {series.description} {textSummary(series)}
      </p>
    </div>
  );
}

function optionFor(series: AnalyticsSeries): object {
  const dataset = series.dataset.map((point) => ({
    category: point.category,
    comparison: point.comparison ?? null,
    value: point.value,
  }));
  const axis = {
    axisLabel: { color: '#64748b', hideOverlap: true },
    axisLine: { lineStyle: { color: '#cbd5e1' } },
    splitLine: { lineStyle: { color: '#e2e8f0' } },
  };
  const common = {
    animationDuration: 300,
    aria: { decal: { show: true }, enabled: true },
    color: palette,
    dataset: { dimensions: ['category', 'value', 'comparison'], source: dataset },
    tooltip: { confine: true, trigger: 'axis' },
  };

  if (series.type === 'FUNNEL') {
    return {
      ...common,
      series: [
        {
          encode: { itemName: 'category', value: 'value' },
          // A single segment (common with sparse data) would otherwise taper
          // to a literal zero-width point; minSize keeps every segment wide
          // enough to hold a label, and outside labels avoid centering text
          // inside a shape that narrows toward that point.
          label: { color: '#334155', position: 'outside' },
          labelLine: { length: 14, lineStyle: { color: '#cbd5e1' }, show: true },
          left: '14%',
          minSize: '20%',
          right: '14%',
          top: 8,
          type: 'funnel',
        },
      ],
      tooltip: { confine: true, trigger: 'item' },
    };
  }

  if (series.type === 'DONUT') {
    return {
      ...common,
      legend: { bottom: 0, type: 'scroll' },
      series: [
        {
          encode: { itemName: 'category', value: 'value' },
          radius: ['42%', '70%'],
          type: 'pie',
        },
      ],
      tooltip: { confine: true, trigger: 'item' },
    };
  }

  const horizontal = series.type === 'BAR' && dataset.length <= 12;
  return {
    ...common,
    grid: { bottom: horizontal ? 28 : 52, containLabel: true, left: 12, right: 20, top: 16 },
    series: [
      {
        encode: horizontal
          ? { x: 'value', y: 'category' }
          : { itemName: 'category', x: 'category', y: 'value' },
        itemStyle: { borderRadius: series.type === 'LINE' ? 0 : [4, 4, 0, 0] },
        showSymbol: dataset.length < 32,
        smooth: series.type === 'LINE',
        type: series.type === 'LINE' ? 'line' : 'bar',
      },
    ],
    xAxis: horizontal ? { ...axis, type: 'value' } : { ...axis, type: 'category' },
    yAxis: horizontal ? { ...axis, type: 'category' } : { ...axis, type: 'value' },
  };
}

function textSummary(series: AnalyticsSeries): string {
  if (series.dataset.length === 0) return 'No matching data points.';
  const ranked = [...series.dataset].sort((a, b) => b.value - a.value);
  const top = ranked[0];
  if (!top) return 'No matching data points.';
  const total = ranked.reduce((sum, point) => sum + point.value, 0);
  return `${ranked.length} data points; highest is ${humanize(top.category)} at ${format(top.value, series.unit)}; total ${format(total, series.unit)}.`;
}

function format(value: number, unit: AnalyticsSeries['unit']): string {
  if (unit === 'PERCENT') return `${value.toFixed(1)}%`;
  if (unit === 'MONEY_MINOR')
    return new Intl.NumberFormat('en-IN', { currency: 'INR', style: 'currency' }).format(
      value / 100,
    );
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(value);
}

function humanize(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());
}
