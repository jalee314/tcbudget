import React from 'react'

export type Page = 'portfolio' | 'analytics' | 'market' | 'settings'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  currentPage: Page
  onPageChange: (p: Page) => void
}

interface NavItemProps {
  collapsed: boolean
  active: boolean
  label: string
  icon: React.ReactNode
  onClick: () => void
}

function NavItem({ collapsed, active, label, icon, onClick }: NavItemProps) {
  const stateClasses = active
    ? 'bg-brand-100 text-brand-800'
    : 'text-sidebar-item hover:bg-sidebar-item-hover hover:text-surface-900'

  // Fixed-width icon column keeps the icon anchored at the same horizontal
  // position regardless of sidebar width — so it doesn't snap or drift
  // during the collapse/expand animation. The label is always mounted and
  // fades via opacity so it animates in sync with the width transition.
  return (
    <button
      onClick={onClick}
      className={`group relative w-full flex items-center h-10 rounded-lg transition-colors duration-150 overflow-hidden ${stateClasses}`}
      title={collapsed ? label : undefined}
    >
      {active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-brand-500" />
      )}
      <span
        className={`w-12 h-10 flex items-center justify-center flex-shrink-0 ${active ? 'text-brand-700' : ''}`}
      >
        {icon}
      </span>
      <span
        className={`flex-1 min-w-0 text-left text-sm font-medium truncate whitespace-nowrap pr-3 transition-opacity duration-200 ease-out ${
          collapsed ? 'opacity-0' : 'opacity-100'
        }`}
        aria-hidden={collapsed}
      >
        {label}
      </span>
    </button>
  )
}

// Lucide-style icons inlined to avoid pulling in a whole icon library.
const Icons = {
  portfolio: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-9-9" />
      <path d="M21 12A9 9 0 0 0 12 3v9z" />
    </svg>
  ),
  analytics: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 14l4-4 4 4 5-6" />
    </svg>
  ),
  market: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7h18l-1.5 11a2 2 0 0 1-2 1.75H6.5a2 2 0 0 1-2-1.75L3 7z" />
      <path d="M8 7V5a4 4 0 0 1 8 0v2" />
    </svg>
  ),
  settings: (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

export default function Sidebar({
  collapsed,
  onToggle,
  currentPage,
  onPageChange
}: SidebarProps) {
  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent)

  // macOS traffic-light cluster sits at x=16 and is ~70px wide (see
  // trafficLightPosition in src/main/index.ts). When collapsed, the sidebar
  // needs to be wide enough to fully contain the cluster so the controls
  // don't spill past the sidebar's right edge into the header.
  const collapsedWidth = isMac ? 'w-[92px]' : 'w-16'

  return (
    <aside
      className={`relative flex flex-col bg-sidebar-bg border-r border-sidebar-border transition-[width] duration-200 ease-out ${
        collapsed ? collapsedWidth : 'w-[232px]'
      }`}
    >
      {/* macOS: leave clearance for the traffic-light controls and make the
          area above the logo a drag region so users can move the window.
          h-10 keeps the logo well below the controls (y=14, ~12px tall). */}
      {isMac && <div className="titlebar-drag h-10 w-full flex-shrink-0" />}

      {/* Logo + collapse toggle. Fixed h-16 so the row height doesn't depend
          on whether the wordmark is visible — otherwise the logo (and
          everything below it) shifts a few pixels when toggling. */}
      {/* No class flip between states: keeping gap-2.5 px-4 in both collapsed
          and expanded keeps the logo anchored at the same horizontal position
          (center = 32px from sidebar left) so it doesn't snap on toggle. The
          wordmark and chevron are always mounted and fade with opacity so they
          animate in lockstep with the width transition. overflow-hidden clips
          the content that overflows the narrow collapsed button. */}
      <button
        onClick={onToggle}
        className="titlebar-no-drag flex items-center w-full h-16 flex-shrink-0 gap-2.5 px-4 hover:bg-sidebar-item-hover transition-colors overflow-hidden"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        </div>
        <div
          className={`flex-1 min-w-0 text-left overflow-hidden transition-opacity duration-200 ease-out ${
            collapsed ? 'opacity-0' : 'opacity-100'
          }`}
          aria-hidden={collapsed}
        >
          <h1 className="text-sm font-bold text-surface-900 tracking-tight whitespace-nowrap">
            TC<span className="text-surface-600">Budget</span>
          </h1>
          <p className="text-[10px] text-surface-500 font-medium tracking-wide uppercase whitespace-nowrap">
            P&amp;L Tracker
          </p>
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden={collapsed}
          className={`text-surface-400 flex-shrink-0 transition-opacity duration-200 ease-out ${
            collapsed ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <div className="h-px bg-sidebar-border mx-3" />

      <nav className="flex-1 px-2 py-3 overflow-y-auto overflow-x-hidden">
        {/* Section label space is always reserved — collapsing just fades the
            text so nav items don't jump up/down by 28px on toggle. */}
        <div
          className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-section-label transition-opacity duration-200 ease-out whitespace-nowrap ${
            collapsed ? 'opacity-0' : 'opacity-100'
          }`}
          aria-hidden={collapsed}
        >
          Pages
        </div>
        <div className="flex flex-col gap-0.5">
          <NavItem
            collapsed={collapsed}
            active={currentPage === 'portfolio'}
            label="Portfolio"
            icon={Icons.portfolio}
            onClick={() => onPageChange('portfolio')}
          />
          <NavItem
            collapsed={collapsed}
            active={currentPage === 'analytics'}
            label="Analytics"
            icon={Icons.analytics}
            onClick={() => onPageChange('analytics')}
          />
          <NavItem
            collapsed={collapsed}
            active={currentPage === 'market'}
            label="Market"
            icon={Icons.market}
            onClick={() => onPageChange('market')}
          />
        </div>
      </nav>

      <div className="h-px bg-sidebar-border mx-3" />

      <div className="px-2 py-3">
        <NavItem
          collapsed={collapsed}
          active={currentPage === 'settings'}
          label="Settings"
          icon={Icons.settings}
          onClick={() => onPageChange('settings')}
        />
      </div>
    </aside>
  )
}
