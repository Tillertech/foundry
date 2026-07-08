import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import type { EChartsCoreOption } from 'echarts/core';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';
import { ThemeService } from '../../core/theme.service';

// Series colors validated (dataviz palette checks) for both surfaces:
// collected keeps the brand deep orange, expenses takes a blue with real
// chroma — slate fails the "reads gray" floor.
const COLLECTED = '#ea580c';
const EXPENSES_LIGHT = '#2a78d6';
const EXPENSES_DARK = '#3987e5';

@Component({
  selector: 'app-cashflow-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgxEchartsDirective],
  providers: [
    provideEchartsCore({
      echarts: async () => {
        const echarts = await import('echarts/core');
        const [{ BarChart }, { GridComponent, LegendComponent, TooltipComponent }, { CanvasRenderer }] =
          await Promise.all([
            import('echarts/charts'),
            import('echarts/components'),
            import('echarts/renderers'),
          ]);
        echarts.use([BarChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);
        return echarts;
      },
    }),
  ],
  template: `
    @defer (on idle) {
      <div
        echarts
        [options]="options()"
        class="h-[300px] w-full"
        aria-label="Cash collected vs expenses per month"
      ></div>
    } @placeholder {
      <div class="h-[300px] w-full skeleton-shimmer rounded-lg"></div>
    }
  `,
})
export class CashflowChart {
  private readonly theme = inject(ThemeService);

  readonly months = input.required<string[]>();
  readonly collected = input.required<number[]>();
  readonly expenses = input.required<number[]>();
  /** Workspace currency code for axis/tooltip labels. */
  readonly currency = input.required<string>();

  protected readonly options = computed<EChartsCoreOption>(() => {
    const isDark = this.theme.dark();
    const grid = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const axis = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.45)';
    const expenseColor = isDark ? EXPENSES_DARK : EXPENSES_LIGHT;
    const currency = this.currency();

    return {
      grid: { left: 8, right: 8, top: 32, bottom: 24, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: isDark ? '#1c1f24' : '#ffffff',
        borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
        borderWidth: 1,
        textStyle: { color: isDark ? '#e6e8eb' : '#111418', fontFamily: 'Inter' },
        valueFormatter: (v: unknown) =>
          `${currency} ${Number(v).toLocaleString()}`,
      },
      legend: {
        show: true,
        right: 0,
        top: 0,
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
          formatter: (v: number) => (v >= 1000 ? `${v / 1000}k` : `${v}`),
        },
      },
      series: [
        {
          name: 'Collected',
          type: 'bar',
          data: this.collected(),
          itemStyle: { color: COLLECTED, borderRadius: [4, 4, 0, 0] },
          barMaxWidth: 26,
        },
        {
          name: 'Expenses',
          type: 'bar',
          data: this.expenses(),
          itemStyle: { color: expenseColor, borderRadius: [4, 4, 0, 0] },
          barMaxWidth: 26,
          barGap: '20%',
        },
      ],
    };
  });
}
