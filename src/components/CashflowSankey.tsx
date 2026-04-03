import { sankey as d3Sankey, sankeyLinkHorizontal } from 'd3-sankey';
import { formatCurrency } from '../lib/utils';
import type { SankeyData } from '../lib/analytics';

const SANKEY_COLORS = [
  '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444',
  '#ec4899', '#6366f1', '#14b8a6', '#f97316', '#84cc16',
  '#a855f7', '#22d3ee', '#34d399', '#fbbf24', '#f87171',
];

export default function CashflowSankey({ data, width = 700, height = 360 }: { data: SankeyData; width?: number; height?: number }) {
  if (data.links.length === 0) return <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Geen cashflow data</p>;

  const nodeIndex = new Map(data.nodes.map((n, i) => [n.id, i]));
  const sankeyData = {
    nodes: data.nodes.map(n => ({ ...n })),
    links: data.links.map(l => ({
      source: nodeIndex.get(l.source) ?? 0,
      target: nodeIndex.get(l.target) ?? 0,
      value: l.value,
    })),
  };

  const generator = d3Sankey<{ id: string; label: string }, { source: number; target: number; value: number }>()
    .nodeId((_d, i) => i)
    .nodeWidth(14)
    .nodePadding(10)
    .nodeAlign((node) => {
      const n = data.nodes[(node as unknown as { index: number }).index ?? 0];
      if (!n) return 1;
      if (n.id.startsWith('in_')) return 0;
      if (n.id === 'hub_income') return 1;
      return 2;
    })
    .extent([[140, 8], [width - 140, height - 8]]);

  const layout = generator(sankeyData as Parameters<typeof generator>[0]);
  const pathGen = sankeyLinkHorizontal();

  return (
    <svg width={width} height={height} style={{ width: '100%', height: 'auto' }} viewBox={`0 0 ${width} ${height}`}>
      {(layout.links ?? []).map((link, i) => {
        const sourceNode = typeof link.source === 'object' ? link.source : null;
        const color = SANKEY_COLORS[i % SANKEY_COLORS.length];
        const targetNode = typeof link.target === 'object' ? link.target : null;
        const isGespaard = targetNode && 'id' in targetNode && (targetNode as { id: string }).id === 'out_savings';
        return (
          <path
            key={i}
            d={pathGen(link as Parameters<typeof pathGen>[0]) ?? ''}
            fill="none"
            stroke={isGespaard ? '#10b981' : color}
            strokeOpacity={0.35}
            strokeWidth={Math.max((link as { width?: number }).width ?? 1, 1)}
          >
            <title>
              {sourceNode && 'label' in sourceNode ? (sourceNode as { label: string }).label : ''} → {targetNode && 'label' in targetNode ? (targetNode as { label: string }).label : ''}: {formatCurrency(link.value)}
            </title>
          </path>
        );
      })}
      {(layout.nodes ?? []).map((node, i) => {
        const x0 = (node as { x0?: number }).x0 ?? 0;
        const x1 = (node as { x1?: number }).x1 ?? 0;
        const y0 = (node as { y0?: number }).y0 ?? 0;
        const y1 = (node as { y1?: number }).y1 ?? 0;
        const n = node as { id?: string; label?: string };
        const isHub = n.id === 'hub_income';
        const isGespaard = n.id === 'out_savings';
        const isIncome = n.id?.startsWith('in_');
        const nodeColor = isGespaard ? '#10b981' : isHub ? '#8b5cf6' : isIncome ? '#06b6d4' : SANKEY_COLORS[i % SANKEY_COLORS.length];
        const nodeHeight = y1 - y0;

        return (
          <g key={i}>
            <rect x={x0} y={y0} width={x1 - x0} height={nodeHeight} fill={nodeColor} rx={2} opacity={0.85} />
            {nodeHeight > 12 && (
              <text
                x={isIncome ? x0 - 6 : x1 + 6}
                y={(y0 + y1) / 2}
                dy="0.35em"
                textAnchor={isIncome ? 'end' : 'start'}
                fill="#cbd5e1"
                fontSize={10}
                fontFamily="Inter, sans-serif"
              >
                {(n.label ?? '').length > 24 ? (n.label ?? '').slice(0, 22) + '…' : n.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
