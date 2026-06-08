import React, { useMemo, useState, useCallback } from 'react'
import { InventoryCard } from '../types'

type TxType = 'buy' | 'sell'
type TypeFilter = 'all' | TxType
type RangeFilter = 'all' | '7d' | '30d' | 'ytd'

interface Transaction {
  key: string
  type: TxType
  date: string // YYYY-MM-DD
  card: InventoryCard
  quantity: number
  unitPrice: number
  total: number // negative for buy, positive for sell
  realizedPL?: number
}

interface HistoryPageProps {
  inventory: InventoryCard[]
  onNavigateToPortfolio?: () => void
  onEditSale?: (card: InventoryCard) => void
}

function formatUSD(v: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(v)
}

function formatSignedUSD(v: number): string {
  if (v === 0) return formatUSD(0)
  const sign = v > 0 ? '+' : '−'
  return `${sign}${formatUSD(Math.abs(v))}`
}

function formatDayHeader(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return dateStr
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function deriveTransactions(inventory: InventoryCard[]): Transaction[] {
  const txs: Transaction[] = []
  for (const c of inventory) {
    // Skip non-purchases from the Buy feed:
    //  - parent_id set → pulled from an opened sealed product
    //  - purchase_price === 0 → gifted (per SearchModal's "Gifted" checkbox)
    // Their Sell event (if any) is still a real transaction and stays.
    if (c.purchase_date && !c.parent_id && c.purchase_price > 0) {
      txs.push({
        key: `${c.id}-buy`,
        type: 'buy',
        date: c.purchase_date,
        card: c,
        quantity: c.quantity,
        unitPrice: c.purchase_price,
        total: -(c.purchase_price * c.quantity)
      })
    }
    if (c.is_sold === 1 && c.sale_date) {
      const cost = c.purchase_price * c.quantity
      txs.push({
        key: `${c.id}-sell`,
        type: 'sell',
        date: c.sale_date,
        card: c,
        quantity: c.quantity,
        unitPrice: c.quantity > 0 ? c.sale_price / c.quantity : c.sale_price,
        total: c.sale_price,
        realizedPL: c.sale_price - cost
      })
    }
  }
  return txs
}

function withinRange(dateStr: string, range: RangeFilter): boolean {
  if (range === 'all') return true
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return true
  const txDate = new Date(y, m - 1, d)
  const now = new Date()
  if (range === '7d') {
    const cutoff = new Date()
    cutoff.setDate(now.getDate() - 7)
    return txDate >= cutoff
  }
  if (range === '30d') {
    const cutoff = new Date()
    cutoff.setDate(now.getDate() - 30)
    return txDate >= cutoff
  }
  if (range === 'ytd') {
    return y === now.getFullYear()
  }
  return true
}

interface SegmentedControlProps<T extends string> {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}

function SegmentedControl<T extends string>({
  value,
  onChange,
  options
}: SegmentedControlProps<T>) {
  return (
    <div className="inline-flex bg-surface-100 rounded-lg p-0.5 gap-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
            value === opt.value
              ? 'bg-white text-surface-900 shadow-sm'
              : 'text-surface-500 hover:text-surface-700'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

interface TransactionRowProps {
  tx: Transaction
  onClick?: () => void
}

function TransactionRow({ tx, onClick }: TransactionRowProps) {
  const isBuy = tx.type === 'buy'
  const chipClasses = isBuy
    ? 'bg-loss/10 text-loss border border-loss/20'
    : 'bg-gain/10 text-gain border border-gain/20'
  const totalClasses = isBuy ? 'text-loss' : 'text-gain'

  const subParts: string[] = []
  if (tx.card.set_name) subParts.push(tx.card.set_name)
  if (tx.card.card_number) subParts.push(`#${tx.card.card_number}`)
  if (tx.card.condition) subParts.push(tx.card.condition)
  const subtitle = subParts.join(' · ')

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
        onClick ? 'hover:bg-surface-50 cursor-pointer' : 'cursor-default'
      }`}
    >
      <div className="w-9 h-12 flex-shrink-0 rounded-md bg-surface-100 overflow-hidden flex items-center justify-center">
        {tx.card.image_url ? (
          <img src={tx.card.image_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-surface-200" />
        )}
      </div>
      <span
        className={`badge ${chipClasses} flex-shrink-0 justify-center`}
        style={{ width: 72 }}
      >
        {isBuy ? 'Bought' : 'Sold'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-surface-900 truncate">{tx.card.name}</p>
        {subtitle && <p className="text-[11px] text-surface-500 truncate">{subtitle}</p>}
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-[11px] text-surface-500 tabular-nums">
          {tx.quantity} × {formatUSD(tx.unitPrice)}
        </div>
        <div className={`text-sm font-bold tabular-nums ${totalClasses}`}>
          {formatSignedUSD(tx.total)}
        </div>
        {tx.realizedPL != null && (
          <div
            className={`text-[11px] font-semibold tabular-nums ${
              tx.realizedPL >= 0 ? 'text-gain' : 'text-loss'
            }`}
          >
            {formatSignedUSD(tx.realizedPL)} P/L
          </div>
        )}
      </div>
    </button>
  )
}

export default function HistoryPage({ inventory, onNavigateToPortfolio, onEditSale }: HistoryPageProps) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>('all')
  const [search, setSearch] = useState('')

  const allTx = useMemo(() => deriveTransactions(inventory), [inventory])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allTx
      .filter((tx) => typeFilter === 'all' || tx.type === typeFilter)
      .filter((tx) => withinRange(tx.date, rangeFilter))
      .filter((tx) => {
        if (!q) return true
        return (
          tx.card.name.toLowerCase().includes(q) ||
          tx.card.set_name.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [allTx, typeFilter, rangeFilter, search])

  const grouped = useMemo(() => {
    const groups = new Map<string, Transaction[]>()
    for (const tx of filtered) {
      const arr = groups.get(tx.date) ?? []
      arr.push(tx)
      groups.set(tx.date, arr)
    }
    return Array.from(groups.entries())
  }, [filtered])

  const totals = useMemo(() => {
    let spent = 0
    let received = 0
    let realized = 0
    for (const tx of filtered) {
      if (tx.type === 'buy') {
        spent += -tx.total
      } else {
        received += tx.total
        realized += tx.realizedPL ?? 0
      }
    }
    return { spent, received, realized, netCash: received - spent, count: filtered.length }
  }, [filtered])

  const handleExportCsv = useCallback(() => {
    const rows: string[][] = [
      ['Date', 'Type', 'Item', 'Set', 'Card #', 'Condition', 'Quantity', 'Unit Price', 'Total', 'Realized P/L']
    ]
    for (const tx of filtered) {
      rows.push([
        tx.date,
        tx.type === 'buy' ? 'Bought' : 'Sold',
        tx.card.name,
        tx.card.set_name,
        tx.card.card_number,
        tx.card.condition,
        String(tx.quantity),
        tx.unitPrice.toFixed(2),
        tx.total.toFixed(2),
        tx.realizedPL != null ? tx.realizedPL.toFixed(2) : ''
      ])
    }
    const csv = rows
      .map((r) =>
        r
          .map((cell) => {
            const s = String(cell)
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
          })
          .join(',')
      )
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [filtered])

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="px-6 pt-5 pb-3 flex-shrink-0">
        <div className="flex items-baseline justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-semibold text-surface-900">Transaction History</h2>
            <p className="text-sm text-surface-500 mt-0.5">
              All purchases and sales across your portfolio.
            </p>
          </div>
          <button
            onClick={handleExportCsv}
            disabled={filtered.length === 0}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-surface-700 border border-surface-200 bg-white hover:bg-surface-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Export CSV
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'buy', label: 'Bought' },
              { value: 'sell', label: 'Sold' }
            ]}
          />
          <SegmentedControl
            value={rangeFilter}
            onChange={setRangeFilter}
            options={[
              { value: 'all', label: 'All time' },
              { value: 'ytd', label: 'YTD' },
              { value: '30d', label: '30d' },
              { value: '7d', label: '7d' }
            ]}
          />
          <div className="relative flex-1 min-w-[200px] max-w-[320px]">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search item or set"
              className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs text-surface-900 border border-surface-200 bg-white focus:outline-none focus:border-accent placeholder:text-surface-400"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-3 min-h-0">
        {grouped.length === 0 ? (
          <div className="glass-card-subtle p-8 text-center">
            <p className="text-sm text-surface-500">
              {allTx.length === 0
                ? 'No transactions yet. Add an item to your portfolio to get started.'
                : 'No transactions match your filters.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {grouped.map(([date, txs]) => (
              <div key={date}>
                <div className="py-1.5 mb-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">
                    {formatDayHeader(date)}
                  </span>
                </div>
                <div className="glass-card-subtle divide-y divide-surface-100 overflow-hidden">
                  {txs.map((tx) => (
                    <TransactionRow
                      key={tx.key}
                      tx={tx}
                      onClick={
                        tx.type === 'sell' && onEditSale
                          ? () => onEditSale(tx.card)
                          : onNavigateToPortfolio
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-surface-200 bg-white px-6 py-3 flex-shrink-0">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 justify-between">
          <div className="text-xs text-surface-500">
            {totals.count} {totals.count === 1 ? 'transaction' : 'transactions'}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
            <span>
              <span className="text-surface-500">Spent</span>{' '}
              <span className="font-semibold text-surface-900 tabular-nums">
                {formatUSD(totals.spent)}
              </span>
            </span>
            <span>
              <span className="text-surface-500">Received</span>{' '}
              <span className="font-semibold text-surface-900 tabular-nums">
                {formatUSD(totals.received)}
              </span>
            </span>
            <span>
              <span className="text-surface-500">Net cash</span>{' '}
              <span
                className={`font-semibold tabular-nums ${
                  totals.netCash >= 0 ? 'text-gain' : 'text-loss'
                }`}
              >
                {formatSignedUSD(totals.netCash)}
              </span>
            </span>
            <span>
              <span className="text-surface-500">Net realized</span>{' '}
              <span
                className={`font-semibold tabular-nums ${
                  totals.realized >= 0 ? 'text-gain' : 'text-loss'
                }`}
              >
                {formatSignedUSD(totals.realized)}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
