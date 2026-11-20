import type { TimelapseMetricPoint } from '@/lib/timelapses/battle-report-data';
import {
  areaPolygonPoints,
  buildSeries,
  formatBattleReportDuration,
  formatCompactNumber,
  mapSeriesPoint,
  polylinePoints,
  type BattleReportSeriesDomain,
  type BattleReportSeriesPoint,
} from '@/lib/timelapses/battle-report-data';

/**
 * 战报图表：纯 React SVG，无第三方图表库。
 *
 * 所有数值先由 battle-report-data 清洗；多组序列共用同一个坐标域，避免
 * “发电”和“用电”各自缩放造成误读。
 */

const CHART_WIDTH = 360;
const CHART_HEIGHT = 170;
const PADDING = { top: 12, right: 12, bottom: 24, left: 48 };
const PLOT_WIDTH = CHART_WIDTH - PADDING.left - PADDING.right;
const PLOT_HEIGHT = CHART_HEIGHT - PADDING.top - PADDING.bottom;
const Y_TICKS = [0, 0.5, 1];

interface ChartSeries {
  label: string;
  color: string;
  points: BattleReportSeriesPoint[];
  /** 额外绘制折线下方面积，用于储能之类的累计量。 */
  area?: boolean;
}

interface LineChartProps {
  title: string;
  description: string;
  series: ChartSeries[];
  durationSeconds: number;
  wide?: boolean;
}

function LineChart({ title, description, series, durationSeconds, wide = false }: LineChartProps) {
  const hasData = series.some((item) => item.points.length > 0);
  const dataMaxY = series.reduce(
    (outer, item) => item.points.reduce((inner, point) => Math.max(inner, point.y), outer),
    0,
  );
  const dataMaxX = series.reduce(
    (outer, item) => item.points.reduce((inner, point) => Math.max(inner, point.x), outer),
    0,
  );
  const yMax = dataMaxY > 0 ? dataMaxY : 1;
  const xMax = durationSeconds > 0 ? durationSeconds : dataMaxX > 0 ? dataMaxX : 1;
  const domain: BattleReportSeriesDomain = { xMin: 0, xMax, yMin: 0, yMax };

  return (
    <figure
      className={'rich-battle-report-chart' + (wide ? ' rich-battle-report-chart--wide' : '')}
      data-testid="rich-battle-report-chart"
    >
      <figcaption className="rich-battle-report-chart-title">{title}</figcaption>
      {hasData ? (
        <>
          <ul className="rich-battle-report-chart-legend">
            {series.map((item) => {
              const last = item.points[item.points.length - 1];
              return (
                <li key={item.label}>
                  <span className="rich-battle-report-chart-swatch" style={{ backgroundColor: item.color }} aria-hidden="true" />
                  <span>{item.label}</span>
                  {last ? <span className="rich-battle-report-chart-value">{formatCompactNumber(last.y)}</span> : null}
                </li>
              );
            })}
          </ul>
          <svg
            className="rich-battle-report-chart-svg"
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            role="img"
            aria-label={title}
            xmlns="http://www.w3.org/2000/svg"
          >
            <title>{title}</title>
            <desc>{description}</desc>
            <g transform={`translate(${PADDING.left} ${PADDING.top})`}>
              {Y_TICKS.map((ratio) => (
                <line
                  key={'grid-' + ratio}
                  className="rich-battle-report-chart-grid"
                  x1={0}
                  x2={PLOT_WIDTH}
                  y1={PLOT_HEIGHT * (1 - ratio)}
                  y2={PLOT_HEIGHT * (1 - ratio)}
                />
              ))}
              {Y_TICKS.map((ratio) => (
                <text
                  key={'tick-' + ratio}
                  className="rich-battle-report-chart-axis"
                  x={-8}
                  y={PLOT_HEIGHT * (1 - ratio) + 3}
                  textAnchor="end"
                >
                  {formatCompactNumber(yMax * ratio)}
                </text>
              ))}
              {series.map((item) => (item.area && item.points.length > 1 ? (
                <polygon
                  key={'area-' + item.label}
                  points={areaPolygonPoints(item.points, PLOT_WIDTH, PLOT_HEIGHT, domain)}
                  fill={item.color}
                  fillOpacity={0.14}
                  stroke="none"
                />
              ) : null))}
              {series.map((item) => (item.points.length ? (
                <polyline
                  key={'line-' + item.label}
                  points={polylinePoints(item.points, PLOT_WIDTH, PLOT_HEIGHT, domain)}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null))}
              {series.map((item) => {
                const last = item.points[item.points.length - 1];
                if (!last) return null;
                const position = mapSeriesPoint(last, PLOT_WIDTH, PLOT_HEIGHT, domain);
                if (!position) return null;
                return <circle key={'dot-' + item.label} cx={position.x} cy={position.y} r={2.5} fill={item.color} />;
              })}
              <text className="rich-battle-report-chart-axis" x={0} y={PLOT_HEIGHT + 17}>0:00</text>
              <text className="rich-battle-report-chart-axis" x={PLOT_WIDTH} y={PLOT_HEIGHT + 17} textAnchor="end">
                {formatBattleReportDuration(xMax)}
              </text>
            </g>
          </svg>
        </>
      ) : (
        <p className="rich-battle-report-chart-empty">暂无图表数据</p>
      )}
    </figure>
  );
}

export interface BattleReportChartsProps {
  metrics: TimelapseMetricPoint[];
  durationSeconds: number;
}

export function BattleReportCharts({ metrics, durationSeconds }: BattleReportChartsProps) {
  const safeDuration = typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) && durationSeconds > 0
    ? durationSeconds
    : 0;
  const powerSeries: ChartSeries[] = [
    { label: '发电', color: 'var(--br-chart-power-gen)', points: buildSeries(metrics, 'power_gen') },
    { label: '用电', color: 'var(--br-chart-power-use)', points: buildSeries(metrics, 'power_use') },
    { label: '储能', color: 'var(--br-chart-stored)', points: buildSeries(metrics, 'power_stored'), area: true },
  ];
  const coreSeries: ChartSeries[] = [
    { label: '核心库存', color: 'var(--br-chart-core)', points: buildSeries(metrics, 'core_items') },
    { label: '产能/分钟', color: 'var(--br-chart-rate)', points: buildSeries(metrics, 'item_rate_per_min') },
  ];
  const unitSeries: ChartSeries[] = [
    { label: '己方单位', color: 'var(--br-chart-ally)', points: buildSeries(metrics, 'units_ally') },
    { label: '敌方单位', color: 'var(--br-chart-enemy)', points: buildSeries(metrics, 'units_enemy') },
  ];

  return (
    <div className="rich-battle-report-charts" data-testid="rich-battle-report-charts">
      <LineChart
        wide
        title="电力供需"
        description="横轴为战斗时间，纵轴为电力。折线分别表示发电与用电，面积表示储能水平。"
        series={powerSeries}
        durationSeconds={safeDuration}
      />
      <LineChart
        title="核心库存 / 产能"
        description="横轴为战斗时间，折线分别表示核心库存与每分钟产能，共用一根纵轴。"
        series={coreSeries}
        durationSeconds={safeDuration}
      />
      <LineChart
        title="单位数量"
        description="横轴为战斗时间，折线分别表示己方与敌方单位数量。"
        series={unitSeries}
        durationSeconds={safeDuration}
      />
    </div>
  );
}
