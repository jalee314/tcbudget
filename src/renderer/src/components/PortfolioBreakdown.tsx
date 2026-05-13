import { useRef } from 'react'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  type Chart as ChartType,
  type TooltipModel
} from 'chart.js'
import { Doughnut } from 'react-chartjs-2'
import { InventoryCard } from '../types'

ChartJS.register(ArcElement, Tooltip)

// Mirrors the chart palette in tailwind.config.js (chart-1/2/4). Sealed gets
// the amber tone — echoes booster-pack foil; Other gets violet to keep clear
// distance from the pink "sold" badge.
const TYPE_COLOR: Record<string, string> = {
  Card:   '#37B86C',
  Sealed: '#F59E0B',
  Other:  '#8B5CF6'
}

function formatUSD(v: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(v)
}

interface Slice {
  label: string
  value: number
  color: string
}

interface PortfolioBreakdownProps {
  inventory: InventoryCard[]
}

// HTML tooltip — Chart.js's default tooltip is drawn onto the canvas and gets
// clipped at the canvas edge. With an 80×80 donut, the "$X · YY%" text gets
// cut off. Rendering as a positioned HTML node lets it extend past the canvas
// into the hero card (and beyond, since .glass-card-hero no longer clips).
function makeExternalTooltip(containerRef: React.MutableRefObject<HTMLDivElement | null>) {
  return (context: { chart: ChartType; tooltip: TooltipModel<'doughnut'> }) => {
    const { chart, tooltip } = context
    const parent = containerRef.current
    if (!parent) return

    let el = parent.querySelector<HTMLDivElement>(':scope > .chartjs-tooltip')
    if (!el) {
      el = document.createElement('div')
      el.className = 'chartjs-tooltip'
      Object.assign(el.style, {
        position: 'absolute',
        pointerEvents: 'none',
        background: 'rgba(17, 24, 39, 0.95)',
        color: '#F9FAFB',
        padding: '6px 10px',
        borderRadius: '6px',
        fontSize: '11px',
        lineHeight: '1.35',
        whiteSpace: 'nowrap',
        opacity: '0',
        transform: 'translate(-50%, -100%)',
        transition: 'opacity 120ms ease',
        boxShadow: '0 8px 20px rgba(0, 0, 0, 0.25)',
        zIndex: '40'
      } as CSSStyleDeclaration)
      parent.appendChild(el)
    }

    if (tooltip.opacity === 0) {
      el.style.opacity = '0'
      return
    }

    const title = tooltip.title?.[0] ?? ''
    const body = tooltip.body?.[0]?.lines?.[0] ?? ''
    el.innerHTML =
      `<div style="font-weight:600;margin-bottom:1px">${title}</div>` +
      `<div style="opacity:0.85">${body}</div>`

    // tooltip.caretX/Y are relative to the canvas. The canvas sits inside the
    // chart wrapper (containerRef), so they're also the right coordinates
    // relative to the wrapper as long as canvas fills it.
    const canvas = chart.canvas
    const offsetX = canvas.offsetLeft + tooltip.caretX
    const offsetY = canvas.offsetTop + tooltip.caretY
    el.style.left = `${offsetX}px`
    el.style.top = `${offsetY - 6}px`
    el.style.opacity = '1'
  }
}

export default function PortfolioBreakdown({ inventory }: PortfolioBreakdownProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Held items only — keeps the chart consistent with the Market Value figure
  // shown next to it (opened sealed and sold items don't contribute to MV).
  const held = inventory.filter(c => !c.is_sold && !c.is_opened)

  const buckets = new Map<string, number>()
  for (const c of held) {
    const type = c.item_type ?? 'Card'
    buckets.set(type, (buckets.get(type) ?? 0) + c.market_price * c.quantity)
  }

  const slices: Slice[] = Array.from(buckets.entries())
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({
      label,
      value,
      color: TYPE_COLOR[label] ?? TYPE_COLOR.Other
    }))

  const total = slices.reduce((s, x) => s + x.value, 0)

  if (slices.length === 0 || total <= 0) {
    return (
      <div className="flex items-center justify-center text-[11px] text-surface-400 italic min-w-[140px]">
        No held items
      </div>
    )
  }

  const data = {
    labels: slices.map(s => s.label),
    datasets: [{
      data: slices.map(s => s.value),
      backgroundColor: slices.map(s => s.color),
      hoverBackgroundColor: slices.map(s => s.color),
      borderWidth: 0,
      hoverOffset: 0,
      hoverBorderWidth: 0
    }]
  }

  const options = {
    cutout: '68%',
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: false,
        external: makeExternalTooltip(wrapRef),
        callbacks: {
          title: (ctx: { label?: string }[]) => String(ctx[0]?.label ?? ''),
          label: (ctx: { parsed: number }) => {
            const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : '0'
            return `${formatUSD(ctx.parsed)} · ${pct}%`
          }
        }
      }
    },
    maintainAspectRatio: false
  }

  return (
    <div ref={wrapRef} className="relative flex items-center gap-3">
      <div className="w-24 h-24 flex-shrink-0">
        <Doughnut data={data} options={options} />
      </div>
      <ul className="flex flex-col gap-1 min-w-[92px]">
        {slices.map(s => {
          const pct = total > 0 ? (s.value / total) * 100 : 0
          return (
            <li key={s.label} className="flex items-center gap-1.5 text-[11px] leading-tight">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: s.color }}
              />
              <span className="text-surface-600 font-medium">{s.label}</span>
              <span className="ml-auto text-surface-900 font-semibold tabular-nums">
                {pct.toFixed(0)}%
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
