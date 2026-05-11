import React from 'react'

export type Page = 'portfolio' | 'settings'

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
  const base =
    'group relative w-full flex items-center rounded-lg transition-colors duration-150 ' +
    (collapsed ? 'justify-center px-0 h-10' : 'gap-3 px-3 h-10')
  const stateClasses = active
    ? 'bg-brand-100 text-brand-800'
    : 'text-sidebar-item hover:bg-sidebar-item-hover hover:text-surface-900'

  return (
    <button
      onClick={onClick}
      className={`${base} ${stateClasses}`}
      title={collapsed ? label : undefined}
    >
      {active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-brand-500" />
      )}
      <span className={`flex-shrink-0 ${active ? 'text-brand-700' : ''}`}>{icon}</span>
      {!collapsed && (
        <span className="flex-1 min-w-0 text-left text-sm font-medium truncate">{label}</span>
      )}
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

  return (
    <aside
      className={`relative flex flex-col bg-sidebar-bg border-r border-sidebar-border transition-[width] duration-200 ease-out ${
        collapsed ? 'w-16' : 'w-[232px]'
      }`}
    >
      {/* macOS: leave clearance for the traffic-light controls and make the
          area above the logo a drag region so users can move the window. */}
      {isMac && <div className="titlebar-drag h-9 w-full flex-shrink-0" />}

      {/* Logo + collapse toggle. Fixed h-16 so the row height doesn't depend
          on whether the wordmark is visible — otherwise the logo (and
          everything below it) shifts a few pixels when toggling. */}
      <button
        onClick={onToggle}
        className={`titlebar-no-drag flex items-center w-full h-16 flex-shrink-0 ${
          collapsed ? 'justify-center px-0' : 'gap-2.5 px-4'
        } hover:bg-sidebar-item-hover transition-colors`}
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
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0 text-left">
              <h1 className="text-sm font-bold text-surface-900 tracking-tight">
                TC<span className="text-surface-600">Budget</span>
              </h1>
              <p className="text-[10px] text-surface-500 font-medium tracking-wide uppercase">
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
              className="text-surface-400 flex-shrink-0"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </>
        )}
      </button>

      <div className="h-px bg-sidebar-border mx-3" />

      <nav className="flex-1 px-2 py-3 overflow-y-auto overflow-x-hidden">
        {/* Section label space is always reserved — collapsing just fades the
            text so nav items don't jump up/down by 28px on toggle. */}
        <div
          className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-section-label transition-opacity duration-150 ${
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
