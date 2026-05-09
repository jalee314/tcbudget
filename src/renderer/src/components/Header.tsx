import React, { useEffect, useRef, useState } from 'react'

const DARK_MODE_KEY = 'tcbudget_dark_mode_v1'

interface HeaderProps {
  onAddCard: () => void
  onRefreshPrices: () => void
  onExportCsv: () => void
  onExportDb: () => void
  onImportDb: () => void
  isRefreshing: boolean
}

export default function Header({ onAddCard, onRefreshPrices, onExportCsv, onExportDb, onImportDb, isRefreshing }: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [isDark, setIsDark] = useState<boolean>(() => {
    try { return localStorage.getItem(DARK_MODE_KEY) === '1' } catch { return false }
  })

  useEffect(() => {
    if (isDark) document.documentElement.setAttribute('data-theme', 'dark')
    else document.documentElement.removeAttribute('data-theme')
  }, [isDark])

  const toggleDark = () => {
    setIsDark(d => {
      const next = !d
      try { localStorage.setItem(DARK_MODE_KEY, next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }
  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent)
  const headerClassName = isMac
    ? 'titlebar-drag flex items-center justify-between pl-[88px] pr-5 py-2 min-h-[56px] border-b border-surface-200'
    : 'titlebar-drag flex items-center justify-between pl-5 pr-36 py-3 border-b border-surface-200'

  useEffect(() => {
    if (!isMenuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMenuOpen(false)
    }
    window.addEventListener('mousedown', handleClick)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handleClick)
      window.removeEventListener('keydown', handleKey)
    }
  }, [isMenuOpen])

  const choose = (fn: () => void) => () => {
    setIsMenuOpen(false)
    fn()
  }

  return (
    <header
      className={headerClassName}
    >
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
        <button onClick={toggleDark}
          className="btn-ghost flex items-center justify-center w-9 h-9 !p-0"
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4"/>
              <path d="M12 2v2"/><path d="M12 20v2"/>
              <path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/>
              <path d="M2 12h2"/><path d="M20 12h2"/>
              <path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setIsMenuOpen(o => !o)}
            className="btn-ghost flex items-center gap-2 text-xs"
            title="Import or export your data"
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>
            </svg>
            Import / Export
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          {isMenuOpen && (
            <div role="menu" className="absolute right-0 mt-1.5 w-56 bg-white border border-surface-200 rounded-lg shadow-lg overflow-hidden z-20 animate-fade-in">
              <button
                role="menuitem"
                onClick={choose(onExportDb)}
                className="w-full text-left px-3 py-2.5 text-xs text-surface-800 hover:bg-surface-50 flex flex-col gap-0.5"
              >
                <span className="font-semibold">Export Database</span>
                <span className="text-[10px] text-surface-500">Save a .db file to sync to another device</span>
              </button>
              <button
                role="menuitem"
                onClick={choose(onImportDb)}
                className="w-full text-left px-3 py-2.5 text-xs text-surface-800 hover:bg-surface-50 flex flex-col gap-0.5 border-t border-surface-100"
              >
                <span className="font-semibold">Import Database</span>
                <span className="text-[10px] text-surface-500">Replace current data from a .db file</span>
              </button>
              <button
                role="menuitem"
                onClick={choose(onExportCsv)}
                className="w-full text-left px-3 py-2.5 text-xs text-surface-800 hover:bg-surface-50 flex flex-col gap-0.5 border-t border-surface-100"
              >
                <span className="font-semibold">Export CSV</span>
                <span className="text-[10px] text-surface-500">Spreadsheet-friendly snapshot</span>
              </button>
            </div>
          )}
        </div>
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
