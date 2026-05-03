import React from 'react'

interface HeaderProps {
  onAddCard: () => void
  onRefreshPrices: () => void
  onExportCsv: () => void
  isRefreshing: boolean
}

export default function Header({ onAddCard, onRefreshPrices, onExportCsv, isRefreshing }: HeaderProps) {
  return (
    <header className="titlebar-drag flex items-center justify-between pl-5 pr-36 py-3 border-b border-surface-200">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5 titlebar-no-drag">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-bold text-surface-900 tracking-tight">
              TC<span className="text-surface-600">Budget</span>
            </h1>
            <p className="text-[10px] text-surface-500 font-medium tracking-wide uppercase">P&amp;L Tracker</p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 titlebar-no-drag">
        <button onClick={onRefreshPrices} disabled={isRefreshing}
          className="btn-ghost flex items-center gap-2 text-xs disabled:opacity-50" title="Refresh market prices">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={isRefreshing ? 'animate-spin' : ''}>
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
            <path d="M16 16h5v5"/>
          </svg>
          {isRefreshing ? 'Syncing…' : 'Refresh'}
        </button>
        <button onClick={onExportCsv} className="btn-ghost flex items-center gap-2 text-xs" title="Export to CSV">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>
          </svg>
          Export
        </button>
        <button onClick={onAddCard} className="btn-primary flex items-center gap-2 text-xs" id="add-card-btn">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14"/><path d="M5 12h14"/>
          </svg>
          Add Item
        </button>
      </div>
    </header>
  )
}
