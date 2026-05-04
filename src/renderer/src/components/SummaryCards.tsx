import React from 'react'
import { PortfolioSummary } from '../types'

interface SummaryCardsProps {
  summary: PortfolioSummary
}

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(val)
}

function formatPercent(val: number): string {
  return `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`
}

interface StatCardProps {
  label: string
  value: string
  subValue?: string
  icon: React.ReactNode
  variant?: 'default' | 'gain' | 'loss' | 'accent'
}

function StatCard({ label, value, subValue, icon, variant = 'default' }: StatCardProps) {
  const borderColor = {
    default: 'border-surface-200',
    gain: 'border-gain/20',
    loss: 'border-loss/20',
    accent: 'border-accent'
  }[variant]

  const iconBg = {
    default: 'bg-surface-100 text-surface-500',
    gain: 'bg-gain/10 text-gain',
    loss: 'bg-loss/10 text-loss',
    accent: 'bg-accent text-surface-900'
  }[variant]

  const valueColor = {
    default: 'text-surface-900',
    gain: 'text-gain',
    loss: 'text-loss',
    accent: 'text-surface-900'
  }[variant]

  return (
    <div className={`glass-card-subtle p-4 ${borderColor} transition-all duration-300 hover:border-opacity-50 group`}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">{label}</span>
        <div className={`p-1.5 rounded-lg ${iconBg} transition-transform duration-300 group-hover:scale-110`}>
          {icon}
        </div>
      </div>
      <div className={`text-xl font-bold font-mono ${valueColor} tabular-nums`}>{value}</div>
      {subValue && (
        <div className="text-[11px] text-surface-500 mt-1 font-mono">{subValue}</div>
      )}
    </div>
  )
}

export default function SummaryCards({ summary }: SummaryCardsProps) {
  const plVariant = summary.unrealizedPL >= 0 ? 'gain' : 'loss'
  const realizedVariant = summary.realizedGains >= 0 ? 'gain' : 'loss'

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 px-5 py-4 animate-fade-in">
      <StatCard
        label="Market Value"
        value={formatCurrency(summary.totalMarketValue)}
        subValue={`${summary.totalQuantity} items across ${summary.totalCards} positions`}
        variant="accent"
        icon={
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
        }
      />
      <StatCard
        label="Cost Basis"
        value={formatCurrency(summary.totalCostBasis)}
        subValue={`${summary.heldCount} held · ${summary.soldCount} sold`}
        variant="default"
        icon={
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>
          </svg>
        }
      />
      <StatCard
        label="Unrealized P&L"
        value={formatCurrency(summary.unrealizedPL)}
        subValue={formatPercent(summary.unrealizedPLPercent)}
        variant={plVariant}
        icon={
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points={summary.unrealizedPL >= 0 ? "22 7 13.5 15.5 8.5 10.5 2 17" : "22 17 13.5 8.5 8.5 13.5 2 7"}/>
            <polyline points={summary.unrealizedPL >= 0 ? "16 7 22 7 22 13" : "16 17 22 17 22 11"}/>
          </svg>
        }
      />
      <StatCard
        label="Sold vs Market"
        value={summary.soldVsMarketPercent == null ? '—' : `${summary.soldVsMarketPercent.toFixed(1)}%`}
        subValue={
          summary.soldVsMarketPercent == null
            ? 'No sales yet'
            : summary.soldVsMarketPercent >= 80
              ? 'On target'
              : 'Below target'
        }
        variant={
          summary.soldVsMarketPercent == null
            ? 'default'
            : summary.soldVsMarketPercent >= 80
              ? 'gain'
              : 'loss'
        }
        icon={
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>
          </svg>
        }
      />
      <StatCard
        label="Realized Gains"
        value={formatCurrency(summary.realizedGains)}
        subValue={`${summary.soldCount} completed ${summary.soldCount === 1 ? 'trade' : 'trades'}`}
        variant={realizedVariant}
        icon={
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5"/>
          </svg>
        }
      />
    </div>
  )
}
