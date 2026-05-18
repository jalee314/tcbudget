import React, { useMemo } from 'react'
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  Filler,
  Legend
} from 'chart.js'
import { Line, Bar } from 'react-chartjs-2'
import { InventoryCard } from '../types'

ChartJS.register(BarElement, CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Filler, Legend)

interface AnalyticsPageProps {
  inventory: InventoryCard[]
}

function formatUSD(v: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(v)
}

function formatPct(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
}

interface InsightStatProps {
  label: string
  value: string
  subValue?: string
  icon: React.ReactNode
  variant?: 'default' | 'gain' | 'loss' | 'accent'
}

function InsightStat({ label, value, subValue, icon, variant = 'default' }: InsightStatProps) {
  const iconBg = {
    default: 'bg-surface-100 text-surface-500',
    gain: 'bg-gain/10 text-gain',
    loss: 'bg-loss/10 text-loss',
    accent: 'bg-accent/10 text-accent-dark'
  }[variant]

  const valueColor = {
    default: 'text-surface-900',
    gain: 'text-gain',
    loss: 'text-loss',
    accent: 'text-surface-900'
  }[variant]

  return (
    <div className="glass-card-subtle p-5 flex flex-col h-full transition-colors duration-200 group min-w-0">
      <div className="flex items-start justify-between mb-3 gap-2 min-w-0">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-surface-500 truncate">{label}</span>
        <div className={`p-2 rounded-lg ${iconBg} flex-shrink-0`}>{icon}</div>
      </div>
      <div className="mt-auto min-w-0">
        <div className={`text-2xl font-bold ${valueColor} tabular-nums leading-tight truncate`}>{value}</div>
        {subValue && <div className="text-[11px] text-surface-500 mt-1.5 truncate">{subValue}</div>}
      </div>
    </div>
  )
}

interface InsightCardProps {
  title: string
  subtitle?: string
  children: React.ReactNode
}

function InsightCard({ title, subtitle, children }: InsightCardProps) {
  return (
    <div className="glass-card p-5 flex flex-col min-w-0">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-surface-900">{title}</h3>
        {subtitle && <p className="text-[11px] text-surface-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

export default function AnalyticsPage({ inventory }: AnalyticsPageProps) {
  const insights = useMemo(() => {
    const held = inventory.filter(c => !c.is_sold && !c.is_opened && c.is_kept !== 1)
    const sold = inventory.filter(c => c.is_sold === 1)

    // Per-position P&L for held items
    const heldWithPL = held.map(c => {
      const cost = c.purchase_price * c.quantity
      const market = c.market_price * c.quantity
      return { card: c, pl: market - cost, cost, market }
    })

    const heldCost = heldWithPL.reduce((s, x) => s + x.cost, 0)
    const heldMarket = heldWithPL.reduce((s, x) => s + x.market, 0)
    const winners = heldWithPL.filter(x => x.pl > 0)
    const losers = heldWithPL.filter(x => x.pl < 0)
    const winRate = heldWithPL.length > 0 ? (winners.length / heldWithPL.length) * 100 : 0
    const avgRoi = heldCost > 0 ? ((heldMarket - heldCost) / heldCost) * 100 : 0

    const sortedByPL = [...heldWithPL].sort((a, b) => b.pl - a.pl)
    const best = sortedByPL[0] ?? null
    const worst = sortedByPL[sortedByPL.length - 1] ?? null

    // Cost vs current value over time: walk held positions in purchase-date
    // order, accumulating both lines. Multiple buys on the same date collapse
    // into one point so the chart isn't densely stacked at popular dates.
    const datedHeld = heldWithPL
      .filter(x => !!x.card.purchase_date)
      .sort((a, b) => (a.card.purchase_date ?? '').localeCompare(b.card.purchase_date ?? ''))

    let cumCost = 0
    let cumMarket = 0
    const valueOverTime: { date: string; cost: number; market: number }[] = []
    for (const x of datedHeld) {
      cumCost += x.cost
      cumMarket += x.market
      const last = valueOverTime[valueOverTime.length - 1]
      if (last && last.date === x.card.purchase_date) {
        last.cost = cumCost
        last.market = cumMarket
      } else {
        valueOverTime.push({ date: x.card.purchase_date!, cost: cumCost, market: cumMarket })
      }
    }

    // P&L by set (top 8 by absolute P&L)
    const setBuckets = new Map<string, number>()
    for (const x of heldWithPL) {
      const k = x.card.set_name || 'Unknown'
      setBuckets.set(k, (setBuckets.get(k) ?? 0) + x.pl)
    }
    const setRows = Array.from(setBuckets.entries())
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 8)

    // Top movers (since baseline, $ swing on a single position)
    const movers = heldWithPL
      .filter(x => x.card.price_change_baseline != null)
      .map(x => {
        const baseline = (x.card.price_change_baseline ?? x.card.market_price) * x.card.quantity
        return { ...x, swing: x.market - baseline }
      })
      .filter(x => Math.abs(x.swing) > 0.001)
      .sort((a, b) => Math.abs(b.swing) - Math.abs(a.swing))
      .slice(0, 6)

    // Sales performance: realized P&L (sale vs cost)
    const realized = sold.reduce((s, c) => s + (c.sale_price - c.purchase_price * c.quantity), 0)

    return {
      heldCount: held.length,
      soldCount: sold.length,
      winRate,
      avgRoi,
      best,
      worst,
      valueOverTime,
      heldCost,
      heldMarket,
      setRows,
      movers,
      realized,
      totalPL: heldMarket - heldCost
    }
  }, [inventory])

  const hasData = inventory.length > 0

  if (!hasData) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-12 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-surface-500">
            <path d="M3 3v18h18" />
            <path d="M7 14l4-4 4 4 5-6" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-surface-900">No data yet</h2>
        <p className="text-sm text-surface-500 mt-1 max-w-md">
          Add a few items to your portfolio and insights will appear here — win rate, top movers, breakdowns by set and rarity.
        </p>
      </div>
    )
  }

  // ─── Line: Cost basis vs Current value over time ────────────────────────
  const formatShortDate = (iso: string): string => {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
  }
  const valueOverTimeData = {
    labels: insights.valueOverTime.map(p => p.date),
    datasets: [
      {
        label: 'Cost Basis',
        data: insights.valueOverTime.map(p => p.cost),
        borderColor: '#94A3B8',
        backgroundColor: 'rgba(148, 163, 184, 0.08)',
        borderWidth: 2,
        tension: 0.25,
        pointRadius: 2,
        pointHoverRadius: 5,
        pointBackgroundColor: '#94A3B8'
      },
      {
        label: 'Current Value',
        data: insights.valueOverTime.map(p => p.market),
        borderColor: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
        borderWidth: 2,
        tension: 0.25,
        pointRadius: 2,
        pointHoverRadius: 5,
        pointBackgroundColor: '#10B981',
        fill: '-1' as const
      }
    ]
  }
  const valueOverTimeOptions = {
    plugins: {
      legend: {
        display: true,
        position: 'bottom' as const,
        labels: {
          boxWidth: 10,
          boxHeight: 10,
          font: { size: 11 },
          color: '#6B7280',
          usePointStyle: true,
          pointStyle: 'circle' as const,
          padding: 12
        }
      },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        titleFont: { size: 11, weight: 600 as const },
        bodyFont: { size: 11 },
        padding: 8,
        callbacks: {
          title: (items: { label: string }[]) => formatShortDate(items[0]?.label ?? ''),
          label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) =>
            `${ctx.dataset.label}: ${formatUSD(ctx.parsed.y ?? 0)}`
        }
      }
    },
    interaction: { intersect: false, mode: 'index' as const },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: '#6B7280',
          font: { size: 10 },
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 6,
          callback: function (this: { getLabelForValue: (v: number) => string }, val: number | string) {
            const label = typeof val === 'number' ? this.getLabelForValue(val) : String(val)
            return formatShortDate(label)
          }
        }
      },
      y: {
        grid: { color: 'rgba(17, 24, 39, 0.06)' },
        ticks: {
          color: '#6B7280',
          font: { size: 10 },
          callback: (val: number | string) => formatUSD(Number(val))
        }
      }
    },
    maintainAspectRatio: false
  }

  // ─── Bar: P&L by set ────────────────────────────────────────────────────
  const setLabels = insights.setRows.map(([k]) => k)
  const setValues = insights.setRows.map(([, v]) => v)
  const setData = {
    labels: setLabels,
    datasets: [{
      data: setValues,
      backgroundColor: setValues.map(v => v >= 0 ? 'rgba(16, 185, 129, 0.75)' : 'rgba(239, 68, 68, 0.75)'),
      borderColor: setValues.map(v => v >= 0 ? '#10B981' : '#EF4444'),
      borderWidth: 1,
      borderRadius: 4
    }]
  }
  const setOptions = {
    indexAxis: 'y' as const,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        titleFont: { size: 11, weight: 600 as const },
        bodyFont: { size: 11 },
        padding: 8,
        callbacks: {
          label: (ctx: { parsed: { x: number | null } }) => formatUSD(ctx.parsed.x ?? 0)
        }
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(17, 24, 39, 0.06)' },
        ticks: {
          color: '#6B7280',
          font: { size: 10 },
          callback: (val: string | number) => formatUSD(Number(val))
        }
      },
      y: {
        grid: { display: false },
        ticks: { color: '#374151', font: { size: 11 } }
      }
    },
    maintainAspectRatio: false
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 animate-fade-in">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <InsightStat
          label="Win Rate"
          value={`${insights.winRate.toFixed(0)}%`}
          subValue={`${insights.heldCount} held positions`}
          variant={insights.winRate >= 50 ? 'gain' : 'loss'}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          }
        />
        <InsightStat
          label="Avg ROI"
          value={formatPct(insights.avgRoi)}
          subValue={formatUSD(insights.totalPL) + ' unrealized'}
          variant={insights.avgRoi >= 0 ? 'gain' : 'loss'}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points={insights.avgRoi >= 0 ? "22 7 13.5 15.5 8.5 10.5 2 17" : "22 17 13.5 8.5 8.5 13.5 2 7"} />
              <polyline points={insights.avgRoi >= 0 ? "16 7 22 7 22 13" : "16 17 22 17 22 11"} />
            </svg>
          }
        />
        <InsightStat
          label="Best Position"
          value={insights.best ? formatUSD(insights.best.pl) : '—'}
          subValue={insights.best ? insights.best.card.name : 'No positions yet'}
          variant="gain"
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          }
        />
        <InsightStat
          label="Worst Position"
          value={insights.worst && insights.worst.pl < 0 ? formatUSD(insights.worst.pl) : '—'}
          subValue={insights.worst && insights.worst.pl < 0 ? insights.worst.card.name : 'No losers'}
          variant="loss"
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            </svg>
          }
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
        <InsightCard
          title="Cost vs. Current Value"
          subtitle={
            insights.valueOverTime.length > 0
              ? `${formatUSD(insights.heldCost)} invested · ${formatUSD(insights.heldMarket)} now`
              : 'How your held portfolio has accumulated over time'
          }
        >
          {insights.valueOverTime.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center text-[12px] text-surface-400 italic">
              No dated purchases yet
            </div>
          ) : (
            <div className="h-[220px]">
              <Line data={valueOverTimeData} options={valueOverTimeOptions} />
            </div>
          )}
        </InsightCard>

        <InsightCard
          title="P&L by Set"
          subtitle="Top sets ranked by absolute unrealized gain or loss"
        >
          {insights.setRows.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center text-[12px] text-surface-400 italic">
              No held items
            </div>
          ) : (
            <div className="h-[220px]">
              <Bar data={setData} options={setOptions} />
            </div>
          )}
        </InsightCard>
      </div>

      {/* Top movers + sales perf */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <InsightCard
            title="Top Movers"
            subtitle="Largest price changes since you added the position"
          >
            {insights.movers.length === 0 ? (
              <div className="py-8 text-center text-[12px] text-surface-400 italic">
                No price movement recorded yet — try refreshing prices from the header.
              </div>
            ) : (
              <ul className="divide-y divide-surface-100">
                {insights.movers.map(m => {
                  const isGain = m.swing >= 0
                  const baseline = (m.card.price_change_baseline ?? m.card.market_price)
                  const pctChange = baseline > 0 ? ((m.card.market_price - baseline) / baseline) * 100 : 0
                  return (
                    <li key={m.card.id} className="flex items-center gap-3 py-2.5">
                      <div className="w-9 h-12 rounded-md overflow-hidden flex-shrink-0 bg-surface-100">
                        {m.card.image_url ? (
                          <img src={m.card.image_url} alt={m.card.name} className="w-full h-full object-contain" loading="lazy" />
                        ) : null}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-surface-900 truncate">{m.card.name}</div>
                        <div className="text-[11px] text-surface-500 truncate">{m.card.set_name}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className={`text-sm font-semibold tabular-nums ${isGain ? 'text-gain' : 'text-loss'}`}>
                          {isGain ? '+' : ''}{formatUSD(m.swing)}
                        </div>
                        <div className="text-[11px] text-surface-500 tabular-nums">{formatPct(pctChange)}</div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </InsightCard>
        </div>

        <InsightCard
          title="Sales Performance"
          subtitle={`${insights.soldCount} completed ${insights.soldCount === 1 ? 'trade' : 'trades'}`}
        >
          {insights.soldCount === 0 ? (
            <div className="py-8 text-center text-[12px] text-surface-400 italic">
              No sales yet
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">Realized P&L</div>
                <div className={`text-2xl font-bold tabular-nums mt-0.5 ${insights.realized >= 0 ? 'text-gain' : 'text-loss'}`}>
                  {formatUSD(insights.realized)}
                </div>
              </div>
              <div className="h-px bg-surface-100" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">Held Win Rate</div>
                  <div className="text-base font-semibold text-surface-900 tabular-nums mt-0.5">{insights.winRate.toFixed(0)}%</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">Held Avg ROI</div>
                  <div className={`text-base font-semibold tabular-nums mt-0.5 ${insights.avgRoi >= 0 ? 'text-gain' : 'text-loss'}`}>
                    {formatPct(insights.avgRoi)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </InsightCard>
      </div>
    </div>
  )
}
