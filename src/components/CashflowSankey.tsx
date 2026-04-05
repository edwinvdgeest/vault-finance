import { useState } from 'react';
import { sankey as d3Sankey, sankeyLinkHorizontal } from 'd3-sankey';
import { formatCurrency } from '../lib/utils';
import type { SankeyData } from '../lib/analytics';

const SANKEY_COLORS = [
  '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444',
  '#ec4899', '#6366f1', '#14b8a6', '#f97316', '#84cc16',
  '#a855f7', '#22d3ee', '#34d399', '#fbbf24', '#f87171',
];

interface HoverInfo {
  x: number;
  y: number;
  title: string;
  amount: number;
  pctOfTotal: number;
}

export default function CashflowSankey({ data, width = 700, height = 360 }: { data: SankeyData; width?: number; height?: number }) {
  const [hover, setHover] = useState<HoverInfo | null>(null);

  if (data.links.length === 0) return <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Geen cashflow data</p>;

  // Total income = sum of links into the hub
  const totalIncome = data.links
    .filter(l => l.target === 'hub_income')
    .reduce((sum, l) => sum + l.value, 0);

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

  function handleMouseMove(e: React.MouseEvent, title: string, amount: number) {
    const svg = e.currentTarget.closest('svg');
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    setHover({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      title,
      amount,
      pctOfTotal: totalIncome > 0 ? (amount / totalIncome) * 100 : 0,
    });
  }

  return (
    <div style={{ position: 'relative' }}>
      <svg width={width} height={height} style={{ width: '100%', height: 'auto' }} viewBox={`0 0 ${width} ${height}`}>
        {(layout.links ?? []).map((link, i) => {
          const sourceNode = typeof link.source === 'object' ? link.source : null;
          const color = SANKEY_COLORS[i % SANKEY_COLORS.length];
          const targetNode = typeof link.target === 'object' ? link.target : null;
          const isGespaard = targetNode && 'id' in targetNode && (targetNode as { id: string }).id === 'out_savings';
          const sourceLabel = sourceNode && 'label' in sourceNode ? (sourceNode as { label: string }).label : '';
          const targetLabel = targetNode && 'label' in targetNode ? (targetNode as { label: string }).label : '';
          const title = `${sourceLabel} → ${targetLabel}`;
          return (
            <path
              key={i}
              d={pathGen(link as Parameters<typeof pathGen>[0]) ?? ''}
              fill="none"
              stroke={isGespaard ? '#10b981' : color}
              strokeOpacity={hover && hover.title === title ? 0.65 : 0.35}
              strokeWidth={Math.max((link as { width?: number }).width ?? 1, 1)}
              style={{ cursor: 'pointer', transition: 'stroke-opacity 0.15s' }}
              onMouseMove={e => handleMouseMove(e, title, link.value)}
              onMouseLeave={() => setHover(null)}
            />
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
      {hover && (
        <div
          style={{
            position: 'absolute',
            left: hover.x + 12,
            top: hover.y + 12,
            background: 'rgba(15, 10, 30, 0.97)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 8,
            padding: '0.5rem 0.75rem',
            pointerEvents: 'none',
            fontSize: 12,
            color: 'white',
            zIndex: 10,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '0.2rem', color: '#c4b5fd' }}>{hover.title}</div>
          <div style={{ color: '#10b981', fontWeight: 700 }}>{formatCurrency(hover.amount)}</div>
          <div style={{ color: '#94a3b8', fontSize: 11, marginTop: '0.15rem' }}>
            {hover.pctOfTotal.toFixed(1)}% van inkomsten
          </div>
        </div>
      )}
    </div>
  );
}
