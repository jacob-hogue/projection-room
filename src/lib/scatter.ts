/**
 * Clicks against 1950 population for the 1947 originals: one point per code, drawn in
 * fastest first, with the ends of the pattern labelled.
 */
import { axisBottom, axisLeft, easeCubicOut, format, scaleLinear, scaleLog, select } from 'd3';
import 'd3-transition';
import { pulses } from './pulses';

export interface PopulationRow {
  code: string;
  population_1950: number;
}

const CALL_OUT = new Set(['212', '213', '312', '605', '803', '704', '305', '214']);
const NAMES: Record<string, string> = {
  '212': 'New York',
  '213': 'Los Angeles',
  '312': 'Chicago',
  '605': 'South Dakota',
  '803': 'South Carolina',
  '704': 'W. North Carolina',
  '305': 'Florida',
  '214': 'Dallas',
};

export function drawScatter(host: HTMLElement, rows: PopulationRow[], color: (clicks: number) => string, reduced: boolean): void {
  host.replaceChildren();
  const width = Math.max(320, host.clientWidth || 480);
  const height = Math.round(width * 0.62);
  const m = { top: 12, right: 16, bottom: 36, left: 40 };
  const data = rows.filter((r) => r.population_1950 > 0).map((r) => ({ ...r, clicks: pulses(r.code) }));
  const x = scaleLog()
    .domain([Math.max(50_000, Math.min(...data.map((d) => d.population_1950)) * 0.8), Math.max(...data.map((d) => d.population_1950)) * 1.3])
    .range([m.left, width - m.right]);
  const y = scaleLinear().domain([4, 22]).range([height - m.bottom, m.top]);

  const svg = select(host)
    .append('svg')
    .attr('class', 'chart scatter-chart')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('width', width)
    .attr('height', height)
    .attr('role', 'img')
    .attr('aria-label', 'Clicks to dial each 1947 area code against the 1950 population of its territory');

  svg
    .append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${height - m.bottom})`)
    .call(axisBottom(x).ticks(4, (d: number) => (d >= 1e6 ? `${format('.0f')(d / 1e6)}M` : `${format('.0f')(d / 1e3)}k`)).tickSize(-(height - m.top - m.bottom)));
  svg
    .append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(${m.left},0)`)
    .call(axisLeft(y).tickValues([5, 10, 15, 20]).tickSize(-(width - m.left - m.right)));
  svg
    .append('text')
    .attr('class', 'axis-title')
    .attr('x', width - m.right)
    .attr('y', height - 6)
    .attr('text-anchor', 'end')
    .text('people in the territory, 1950');
  svg.append('text').attr('class', 'axis-title').attr('x', m.left).attr('y', m.top - 2).text('clicks to dial');

  const ordered = [...data].sort((a, b) => a.clicks - b.clicks || b.population_1950 - a.population_1950);
  const dots = svg
    .append('g')
    .attr('class', 'dots')
    .selectAll('circle')
    .data(ordered)
    .join('circle')
    .attr('cx', (d) => x(d.population_1950))
    .attr('cy', (d) => y(d.clicks))
    .attr('r', reduced ? 4.5 : 0)
    .attr('fill', (d) => color(d.clicks))
    .attr('stroke', '#0f1117')
    .attr('stroke-width', 1);
  if (!reduced) {
    dots
      .transition()
      .delay((_d, i) => i * 28)
      .duration(350)
      .ease(easeCubicOut)
      .attr('r', 4.5);
  }

  const labels = svg
    .append('g')
    .attr('class', 'dot-labels')
    .selectAll('text')
    .data(ordered.filter((d) => CALL_OUT.has(d.code)))
    .join('text')
    .attr('x', (d) => x(d.population_1950) + 7)
    .attr('y', (d) => y(d.clicks) + 3.5)
    .attr('opacity', reduced ? 1 : 0)
    .text((d) => `${d.code} ${NAMES[d.code] ?? ''}`.trim());
  if (!reduced) labels.transition().delay(ordered.length * 28 + 200).duration(400).attr('opacity', 1);
}
