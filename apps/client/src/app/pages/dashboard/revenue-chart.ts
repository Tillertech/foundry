import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { EChartsCoreOption } from 'echarts/core';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';
import { ThemeService } from '../../core/theme.service';

@Component({
  selector: 'app-revenue-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgxEchartsDirective],
  providers: [
    provideEchartsCore({
      echarts: async () => {
        const echarts = await import('echarts/core');
        const [{ LineChart }, { GridComponent, LegendComponent, TooltipComponent }, { CanvasRenderer }] =
          await Promise.all([
            import('echarts/charts'),
            import('echarts/components'),
            import('echarts/renderers'),
          ]);
        echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);
        return echarts;
      },
    }),
  ],
  template: `
    @defer (on idle) {
      <div
        echarts
        [options]="options()"
        class="h-[320px] w-full"
        aria-label="Revenue vs expenses, last 12 months"
      ></div>
    } @placeholder {
      <div class="h-[320px] w-full skeleton-shimmer rounded-lg"></div>
    }
  `,
})
export class RevenueChart {
  private readonly theme = inject(ThemeService);

  readonly months = input.required<string[]>();
  readonly revenue = input.required<number[]>();
  readonly expenses = input.required<number[]>();

  protected readonly options = computed<EChartsCoreOption>(() => {
    const isDark = this.theme.dark();
    const grid = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const axis = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.45)';

    return {
      grid: { left: 8, right: 8, top: 16, bottom: 24, containLabel: true },
      tooltip: {
        trigger: 'axis',
        backgroundColor: isDark ? '#1c1f24' : '#ffffff',
        borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
        borderWidth: 1,
        textStyle: { color: isDark ? '#e6e8eb' : '#111418', fontFamily: 'Inter' },
        valueFormatter: (v: unknown) => `$${Number(v).toLocaleString()}`,
      },
      legend: {
        show: true,
        right: 0,
        top: -4,
        icon: 'roundRect',
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: axis, fontFamily: 'Inter', fontSize: 11 },
      },
      xAxis: {
        type: 'category',
        data: this.months(),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: axis, fontFamily: 'Inter', fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: grid, type: 'dashed' } },
        axisLabel: {
          color: axis,
          fontFamily: 'Inter',
          fontSize: 11,
          formatter: (v: number) => (v >= 1000 ? `$${v / 1000}k` : `$${v}`),
        },
      },
      series: [
        {
          name: 'Revenue',
          type: 'line',
          smooth: true,
          data: this.revenue(),
          symbol: 'circle',
          symbolSize: 6,
          showSymbol: false,
          lineStyle: { width: 2.5, color: '#f97316' },
          itemStyle: { color: '#f97316' },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(249, 115, 22, 0.35)' },
                { offset: 1, color: 'rgba(249, 115, 22, 0)' },
              ],
            },
          },
        },
        {
          name: 'Expenses',
          type: 'line',
          smooth: true,
          data: this.expenses(),
          symbol: 'circle',
          symbolSize: 6,
          showSymbol: false,
          lineStyle: { width: 2, color: isDark ? '#94a3b8' : '#64748b', type: 'dashed' },
          itemStyle: { color: isDark ? '#94a3b8' : '#64748b' },
        },
      ],
    };
  });
}
