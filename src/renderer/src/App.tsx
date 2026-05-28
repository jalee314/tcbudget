import React, { useState, useEffect, useCallback, useMemo } from 'react'
import Header from './components/Header'
import Sidebar, { type Page } from './components/Sidebar'
import SummaryCards from './components/SummaryCards'
import DataGrid from './components/DataGrid'
import SearchModal from './components/SearchModal'
import SellModal from './components/SellModal'
import OpenModal from './components/OpenModal'
import PulledFromEditor from './components/PulledFromEditor'
import PackOpenAnimation from './components/PackOpenAnimation'
import AnalyticsPage from './components/AnalyticsPage'
import HistoryPage from './components/HistoryPage'
import MarketPage, { type WatchlistItem } from './components/MarketPage'
import { InventoryCard, SearchCard, SealedProduct, PortfolioSummary } from './types'
import { v4 as uuidv4 } from 'uuid'

const LIQUIDATION_PCT_KEY = 'liquidation_pct_v1'
const LAST_AUTO_REFRESH_KEY = 'last_auto_refresh_at'
const ROW_ORDER_KEY = 'inventory_row_order_v1'
const INCLUDE_HELD_IN_PL_KEY = 'include_held_in_pl_v1'
const SIDEBAR_COLLAPSED_KEY = 'tcbudget_sidebar_collapsed_v1'
const CURRENT_PAGE_KEY = 'tcbudget_current_page_v1'
const DARK_MODE_KEY = 'tcbudget_dark_mode_v1'
const WATCHLIST_KEY = 'tcbudget_watchlist_v1'
const AUTO_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000 // 12 hours

// Analytics and Market are temporarily hidden from the sidebar; only Portfolio
// and Settings are reachable. Old persisted values for the hidden pages fall
// back to 'portfolio' so users don't get stranded on a page with no nav.
const VALID_PAGES: Page[] = ['portfolio', 'history', 'settings']

function loadWatchlist(): WatchlistItem[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function applySavedOrder(rows: InventoryCard[]): InventoryCard[] {
  const raw = localStorage.getItem(ROW_ORDER_KEY)
  if (!raw) return rows
  try {
    const savedIds: string[] = JSON.parse(raw)
    const idToIndex = new Map(savedIds.map((id, i) => [id, i]))
    // Items not in the saved order are newly added since the last reorder —
    // append them after the saved tail so they appear at the bottom.
    return [...rows].sort((a, b) => {
      const ia = idToIndex.has(a.id) ? idToIndex.get(a.id)! : Number.MAX_SAFE_INTEGER
      const ib = idToIndex.has(b.id) ? idToIndex.get(b.id)! : Number.MAX_SAFE_INTEGER
      return ia - ib
    })
  } catch {
    return rows
  }
}

function loadLiquidationPct(): number {
  const raw = localStorage.getItem(LIQUIDATION_PCT_KEY)
  if (!raw) return 100
  const n = parseFloat(raw)
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : 100
}

export default function App() {
  const [inventory, setInventory] = useState<InventoryCard[]>([])
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [activeParentFilter, setActiveParentFilter] = useState<string | null>(null)
  const [sellingCard, setSellingCard] = useState<InventoryCard | null>(null)
  const [openingCard, setOpeningCard] = useState<InventoryCard | null>(null)
  const [editingPulledFromFor, setEditingPulledFromFor] = useState<InventoryCard | null>(null)
  const [ripAnimationParent, setRipAnimationParent] = useState<InventoryCard | null>(null)
  const [liquidationPct, setLiquidationPct] = useState<number>(() => loadLiquidationPct())
  const [includeHeldInPL, setIncludeHeldInPL] = useState<boolean>(() => {
    const raw = localStorage.getItem(INCLUDE_HELD_IN_PL_KEY)
    return raw == null ? true : raw === '1'
  })
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1' } catch { return false }
  })
  const [currentPage, setCurrentPage] = useState<Page>(() => {
    const raw = localStorage.getItem(CURRENT_PAGE_KEY) as Page | null
    return raw && VALID_PAGES.includes(raw) ? raw : 'portfolio'
  })
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(() => loadWatchlist())
  const [isDark, setIsDark] = useState<boolean>(() => {
    try { return localStorage.getItem(DARK_MODE_KEY) === '1' } catch { return false }
  })

  useEffect(() => {
    try { localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist)) } catch { /* ignore */ }
  }, [watchlist])

  useEffect(() => {
    if (isDark) document.documentElement.setAttribute('data-theme', 'dark')
    else document.documentElement.removeAttribute('data-theme')
    // Re-theme the Windows native title bar overlay so the min/max/close
    // controls don't stay on a light background in dark mode. No-op on macOS.
    window.electronAPI?.window?.setTitleBarOverlay(
      isDark
        ? { color: '#000000', symbolColor: '#E5E7EB' }
        : { color: '#F3F4F6', symbolColor: '#111827' }
    )
  }, [isDark])

  const toggleDark = useCallback(() => {
    setIsDark(d => {
      const next = !d
      try { localStorage.setItem(DARK_MODE_KEY, next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }, [])

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(v => {
      const next = !v
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }, [])

  const updateCurrentPage = useCallback((p: Page) => {
    setCurrentPage(p)
    try { localStorage.setItem(CURRENT_PAGE_KEY, p) } catch { /* ignore */ }
  }, [])

  const updateLiquidationPct = useCallback((value: number) => {
    const clamped = Math.max(1, Math.min(100, Math.round(value)))
    setLiquidationPct(clamped)
    localStorage.setItem(LIQUIDATION_PCT_KEY, String(clamped))
  }, [])

  const toggleIncludeHeldInPL = useCallback(() => {
    setIncludeHeldInPL(v => {
      const next = !v
      localStorage.setItem(INCLUDE_HELD_IN_PL_KEY, next ? '1' : '0')
      return next
    })
  }, [])

  const handleToggleKeep = useCallback(async (card: InventoryCard) => {
    const next = card.is_kept === 1 ? 0 : 1
    try {
      if (window.electronAPI) {
        await window.electronAPI.db.update(card.id, 'is_kept', next)
      }
      setInventory(prev => prev.map(c =>
        c.id === card.id ? { ...c, is_kept: next } : c
      ))
    } catch (err) {
      console.error('Failed to toggle keep:', err)
    }
  }, [])

  // ─── Load data on mount ────────────────────────────────────────────
  useEffect(() => {
    async function loadData() {
      try {
        if (window.electronAPI) {
          // One-time wipe of all pre-existing demo data.
          if (!localStorage.getItem('seed_cleanup_v2')) {
            const existing = await window.electronAPI.db.getAll() as unknown as InventoryCard[]
            for (const row of existing) {
              await window.electronAPI.db.delete(row.id)
            }
            localStorage.setItem('seed_cleanup_v2', '1')
          }
          const rows = (await window.electronAPI.db.getAll()) as unknown as InventoryCard[]
          // Backfill price_change_baseline for any legacy item missing one — lock it to
          // current market price so price-change starts at 0 from this point on.
          for (const row of rows) {
            if (row.price_change_baseline == null) {
              const baseline = row.market_price ?? 0
              await window.electronAPI.db.update(row.id, 'price_change_baseline', baseline)
              row.price_change_baseline = baseline
            }
          }
          setInventory(applySavedOrder(rows))
        } else {
          setInventory([])
        }
      } catch (err) {
        console.error('Failed to load data:', err)
        setInventory([])
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [])

  // ─── Portfolio summary ─────────────────────────────────────────────
  const summary = useMemo<PortfolioSummary>(() => {
    const held = inventory.filter(c => !c.is_sold && !c.is_opened)
    const opened = inventory.filter(c => c.is_opened === 1 && !c.is_sold)
    const sold = inventory.filter(c => c.is_sold === 1)

    const totalCostBasis =
      held.reduce((sum, c) => sum + c.purchase_price * c.quantity, 0) +
      opened.reduce((sum, c) => sum + c.purchase_price * c.quantity, 0) +
      sold.reduce((sum, c) => sum + c.purchase_price * c.quantity, 0)
    // Opened sealed items have no resale value as sealed product — treated as $0 market value
    const totalMarketValue = held.reduce((sum, c) => sum + c.market_price * c.quantity, 0)
    // P&L excludes per-item "keeping" flags from both sides. When the global toggle is
    // OFF, Card-type held items are also excluded (treated as if all kept) — sealed
    // products still contribute. Already-kept items aren't double-excluded.
    const plHeld = held.filter(c => {
      if (c.is_kept === 1) return false
      if (!includeHeldInPL && c.item_type === 'Card') return false
      return true
    })
    const heldMarketValue = plHeld.reduce((sum, c) => sum + c.market_price * c.quantity, 0)
    const heldCostBasis = plHeld.reduce((sum, c) => sum + c.purchase_price * c.quantity, 0)
    const liquidationFactor = liquidationPct / 100
    const unrealizedPL = heldMarketValue * liquidationFactor - heldCostBasis
    const unrealizedPLPercent = heldCostBasis > 0 ? (unrealizedPL / heldCostBasis) * 100 : 0
    const kept = held.filter(c => c.is_kept === 1)
    const keptValue = kept.reduce((sum, c) => sum + c.market_price * c.quantity, 0)
    const realizedGains =
      sold.reduce((sum, c) => sum + c.sale_price - (c.purchase_price * c.quantity), 0) -
      opened.reduce((sum, c) => sum + c.purchase_price * c.quantity, 0)
    const soldRevenue = sold.reduce((sum, c) => sum + c.sale_price, 0)
    const soldMarketValue = sold.reduce((sum, c) => sum + c.market_price * c.quantity, 0)
    const soldVsMarketPercent = soldMarketValue > 0 ? (soldRevenue / soldMarketValue) * 100 : null
    const totalQuantity = held.reduce((sum, c) => sum + c.quantity, 0)
    const openedCost = opened.reduce((sum, c) => sum + c.purchase_price * c.quantity, 0)

    return {
      totalCards: held.length,
      totalQuantity,
      totalCostBasis,
      totalMarketValue,
      unrealizedPL,
      unrealizedPLPercent,
      realizedGains,
      soldVsMarketPercent,
      heldCount: held.length,
      soldCount: sold.length,
      openedCount: opened.length,
      openedCost,
      keptCount: kept.length,
      keptValue
    }
  }, [inventory, liquidationPct, includeHeldInPL])

  // ─── Row reorder ──────────────────────────────────────────────────
  const handleReorder = useCallback((orderedIds: string[]) => {
    localStorage.setItem(ROW_ORDER_KEY, JSON.stringify(orderedIds))
    const idToIndex = new Map(orderedIds.map((id, i) => [id, i]))
    setInventory(prev => [...prev].sort((a, b) => {
      const ia = idToIndex.has(a.id) ? idToIndex.get(a.id)! : -1
      const ib = idToIndex.has(b.id) ? idToIndex.get(b.id)! : -1
      return ia - ib
    }))
  }, [])

  // ─── Cell edit handler (auto-save) ─────────────────────────────────
  const handleCellValueChanged = useCallback(async (id: string, field: string, value: unknown) => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.db.update(id, field, value)
      }
      setInventory(prev => prev.map(card =>
        card.id === id ? { ...card, [field]: value } : card
      ))
    } catch (err) {
      console.error('Failed to update:', err)
    }
  }, [])

  // ─── Add card from search ─────────────────────────────────────────
  const handleAddCard = useCallback(async (
    searchCard: SearchCard,
    purchasePrice: number,
    quantity: number,
    condition: string,
    itemType: 'Card' | 'Sealed' | 'Other' = 'Card',
    parentId: string | null = null,
    variantId: string | null = null,
    purchaseDate?: string
  ) => {
    const now = new Date().toISOString()
    const newCard: InventoryCard = {
      id: uuidv4(),
      card_id: searchCard.id,
      name: searchCard.name,
      set_name: searchCard.set_name,
      set_id: searchCard.set_id,
      card_number: searchCard.card_number,
      rarity: searchCard.rarity,
      image_url: searchCard.image_url,
      purchase_price: purchasePrice,
      purchase_date: purchaseDate || now.split('T')[0],
      quantity,
      condition,
      market_price: searchCard.market_price,
      last_updated: now,
      is_sold: 0,
      sale_price: 0,
      sale_date: '',
      notes: '',
      item_type: itemType,
      parent_id: parentId,
      variant_id: variantId,
      price_change_baseline: searchCard.market_price
    }

    try {
      if (window.electronAPI) {
        await window.electronAPI.db.insert(newCard as unknown as Record<string, unknown>)
      }
      setInventory(prev => [...prev, newCard])
    } catch (err) {
      console.error('Failed to add card:', err)
    }
  }, [])

  // ─── Watchlist handlers ───────────────────────────────────────────
  const handleAddToWatchlist = useCallback((item: WatchlistItem) => {
    setWatchlist(prev => (prev.some(w => w.id === item.id) ? prev : [...prev, item]))
  }, [])

  const handleRemoveFromWatchlist = useCallback((id: string) => {
    setWatchlist(prev => prev.filter(w => w.id !== id))
  }, [])

  const handleRefreshWatchlist = useCallback(async () => {
    const withVariants = watchlist.filter(w => w.variant_id)
    if (withVariants.length === 0 || !window.electronAPI) return
    try {
      const variantIds = withVariants.map(w => w.variant_id as string)
      const result = await window.electronAPI.justtcg.batchRefresh(variantIds)
      if (result.error) {
        console.error('Watchlist refresh error:', result.error)
        return
      }
      const priceMap = new Map<string, number>()
      for (const raw of result.data as any[]) {
        for (const v of raw.variants ?? []) {
          if (v.id && v.price != null) priceMap.set(v.id, v.price)
        }
      }
      const now = new Date().toISOString()
      setWatchlist(prev => prev.map(w => {
        if (!w.variant_id) return w
        const next = priceMap.get(w.variant_id)
        if (next == null) return w
        return { ...w, last_price: next, last_updated: now }
      }))
    } catch (err) {
      console.error('Failed to refresh watchlist:', err)
    }
  }, [watchlist])

  // Bridge from MarketPage's "Add to Portfolio" buttons to the existing
  // add-card flow. Uses the current market price as both purchase price
  // and baseline so the row lands with zero P&L until the user edits it.
  const handleAddToPortfolioFromCard = useCallback((
    card: SearchCard,
    variantId: string | null,
    condition: string
  ) => {
    handleAddCard(card, card.market_price, 1, condition, 'Card', null, variantId)
  }, [handleAddCard])

  const handleAddToPortfolioFromSealed = useCallback((product: SealedProduct) => {
    const sealedAsCard: SearchCard = {
      id: product.id,
      name: product.name,
      set_name: product.set_name,
      set_id: product.set_id,
      card_number: '',
      rarity: product.product_type,
      image_url: product.image_url,
      image_url_large: product.image_url,
      market_price: product.market_price,
    }
    handleAddCard(sealedAsCard, product.market_price, 1, 'Sealed', 'Sealed', null, product.variant_id ?? null)
  }, [handleAddCard])

  // ─── Delete card ──────────────────────────────────────────────────
  const handleDeleteRow = useCallback(async (id: string) => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.db.delete(id)
      }
      setInventory(prev => prev.filter(card => card.id !== id))
    } catch (err) {
      console.error('Failed to delete:', err)
    }
  }, [])

  // ─── Toggle opened status (sealed items only) ────────────────────
  const handleToggleOpened = useCallback(async (card: InventoryCard) => {
    if (card.is_opened) {
      // Transitioning back to sealed - check if we can merge
      const match = inventory.find(c =>
        !c.is_opened &&
        !c.is_sold &&
        c.id !== card.id &&
        c.card_id === card.card_id &&
        c.purchase_price === card.purchase_price &&
        c.condition === card.condition &&
        c.variant_id === card.variant_id
      )

      if (match) {
        try {
          if (window.electronAPI) {
            await window.electronAPI.db.update(match.id, 'quantity', match.quantity + card.quantity)
            await window.electronAPI.db.delete(card.id)
          }
          setInventory(prev => prev.map(c =>
            c.id === match.id ? { ...c, quantity: c.quantity + card.quantity } : c
          ).filter(c => c.id !== card.id))
        } catch (err) {
          console.error('Failed to merge items:', err)
        }
      } else {
        try {
          if (window.electronAPI) {
            await window.electronAPI.db.update(card.id, 'is_opened', 0)
          }
          setInventory(prev => prev.map(c =>
            c.id === card.id ? { ...c, is_opened: 0 } : c
          ))
        } catch (err) {
          console.error('Failed to toggle opened:', err)
        }
      }
    } else {
      // Transitioning to opened
      if (card.quantity > 1) {
        setOpeningCard(card)
      } else {
        try {
          if (window.electronAPI) {
            await window.electronAPI.db.update(card.id, 'is_opened', 1)
          }
          setInventory(prev => prev.map(c =>
            c.id === card.id ? { ...c, is_opened: 1 } : c
          ))
        } catch (err) {
          console.error('Failed to toggle opened:', err)
        }
      }
    }
  }, [inventory])

  const handleConfirmOpen = useCallback((qtyOpened: number) => {
    const card = openingCard
    if (!card) return

    if (qtyOpened >= card.quantity) {
      if (window.electronAPI) {
        window.electronAPI.db.update(card.id, 'is_opened', 1).catch(console.error)
      }
      setInventory(prev => prev.map(c =>
        c.id === card.id ? { ...c, is_opened: 1 } : c
      ))
    } else {
      const remainingQty = card.quantity - qtyOpened
      const openedRow: InventoryCard = {
        ...card,
        id: uuidv4(),
        quantity: qtyOpened,
        is_opened: 1
      }
      if (window.electronAPI) {
        window.electronAPI.db.update(card.id, 'quantity', remainingQty).catch(console.error)
        window.electronAPI.db.insert(openedRow as unknown as Record<string, unknown>).catch(console.error)
      }
      setInventory(prev => {
        const updated = prev.map(c => c.id === card.id ? { ...c, quantity: remainingQty } : c)
        return [...updated, openedRow]
      })
    }
    setOpeningCard(null)
  }, [openingCard])

  // ─── Toggle sold status ───────────────────────────────────────────
  const handleToggleSold = useCallback(async (card: InventoryCard) => {
    if (card.is_sold) {
      // Un-sell: clear sale info
      if (window.electronAPI) {
        window.electronAPI.db.update(card.id, 'is_sold', 0).catch(console.error)
        window.electronAPI.db.update(card.id, 'sale_price', 0).catch(console.error)
        window.electronAPI.db.update(card.id, 'sale_date', '').catch(console.error)
      }
      setInventory(prev => prev.map(c =>
        c.id === card.id ? { ...c, is_sold: 0, sale_price: 0, sale_date: '' } : c
      ))
      return
    }
    // Marking as sold — always open modal so the user picks date + price.
    // The confirm handler decides whether to split the row based on qty.
    setSellingCard(card)
  }, [])

  const handleConfirmSale = useCallback((qtySold: number, salePrice: number, saleDate: string) => {
    const card = sellingCard
    if (!card) return

    // Edit-mode: card is already sold, update sale_date + sale_price in place.
    // Qty isn't editable in this mode, so no row split.
    if (card.is_sold === 1) {
      if (window.electronAPI) {
        window.electronAPI.db.update(card.id, 'sale_price', salePrice).catch(console.error)
        window.electronAPI.db.update(card.id, 'sale_date', saleDate).catch(console.error)
      }
      setInventory(prev => prev.map(c =>
        c.id === card.id ? { ...c, sale_price: salePrice, sale_date: saleDate } : c
      ))
      setSellingCard(null)
      return
    }

    if (qtySold >= card.quantity) {
      if (window.electronAPI) {
        window.electronAPI.db.update(card.id, 'is_sold', 1).catch(console.error)
        window.electronAPI.db.update(card.id, 'sale_price', salePrice).catch(console.error)
        window.electronAPI.db.update(card.id, 'sale_date', saleDate).catch(console.error)
      }
      setInventory(prev => prev.map(c =>
        c.id === card.id ? { ...c, is_sold: 1, sale_price: salePrice, sale_date: saleDate } : c
      ))
    } else {
      const remainingQty = card.quantity - qtySold
      const soldRow: InventoryCard = {
        ...card,
        id: uuidv4(),
        quantity: qtySold,
        is_sold: 1,
        sale_price: salePrice,
        sale_date: saleDate
      }
      if (window.electronAPI) {
        window.electronAPI.db.update(card.id, 'quantity', remainingQty).catch(console.error)
        window.electronAPI.db.insert(soldRow as unknown as Record<string, unknown>).catch(console.error)
      }
      setInventory(prev => {
        const updated = prev.map(c => c.id === card.id ? { ...c, quantity: remainingQty } : c)
        return [...updated, soldRow]
      })
    }
    setSellingCard(null)
  }, [sellingCard])

  // ─── Refresh prices via JustTCG batch endpoint ───────────────────
  const handleRefreshPrices = useCallback(async () => {
    setIsRefreshing(true)
    try {
      // Legacy sealed items were stored without a variant_id, so they were silently
      // skipped on refresh and price_change stayed at $0 forever. Resolve their
      // variant_id by searching once; subsequent refreshes skip this step.
      const sealedMissingVariant = inventory.filter(
        c => !c.is_sold && c.item_type === 'Sealed' && !c.variant_id && c.name
      )
      if (sealedMissingVariant.length > 0 && window.electronAPI) {
        for (const item of sealedMissingVariant) {
          try {
            const res = await window.electronAPI.justtcg.searchSealed(item.name)
            if (res.error) continue
            const match = (res.data as any[]).find(raw => raw?.id === item.card_id) ?? (res.data as any[])[0]
            if (!match) continue
            const sealedVariant = (match.variants ?? []).find((v: any) => v?.condition === 'Sealed') ?? match.variants?.[0]
            const variantId = sealedVariant?.id
            if (variantId) {
              await window.electronAPI.db.update(item.id, 'variant_id', variantId)
              item.variant_id = variantId
            }
          } catch (err) {
            console.error('Failed to backfill sealed variant_id:', err)
          }
        }
      }

      const toRefresh = inventory.filter(c => !c.is_sold && c.variant_id)
      if (toRefresh.length === 0) return

      const variantIds = toRefresh.map(c => c.variant_id as string)
      const result = await window.electronAPI.justtcg.batchRefresh(variantIds)

      if (result.error) {
        console.error('Price refresh error:', result.error)
        return
      }

      // Build variantId → price map from returned cards
      const priceMap = new Map<string, number>()
      for (const raw of result.data as any[]) {
        for (const v of raw.variants ?? []) {
          if (v.id && v.price != null) priceMap.set(v.id, v.price)
        }
      }

      // Update each card that has a new price
      const now = new Date().toISOString()
      for (const card of toRefresh) {
        const newPrice = priceMap.get(card.variant_id as string)
        if (newPrice != null && newPrice !== card.market_price) {
          if (window.electronAPI) {
            await window.electronAPI.db.update(card.id, 'market_price', newPrice)
            await window.electronAPI.db.update(card.id, 'last_updated', now)
          }
        }
      }

      // Reload inventory to reflect updated prices
      if (window.electronAPI) {
        const rows = await window.electronAPI.db.getAll()
        setInventory(rows as unknown as InventoryCard[])
      }
      localStorage.setItem(LAST_AUTO_REFRESH_KEY, String(Date.now()))
    } catch (err) {
      console.error('Failed to refresh prices:', err)
    } finally {
      setIsRefreshing(false)
    }
  }, [inventory])

  // Auto-refresh prices on app load if it's been > 12h since last refresh.
  // Manual refresh button still works at any time.
  useEffect(() => {
    if (isLoading || inventory.length === 0) return
    const lastRaw = localStorage.getItem(LAST_AUTO_REFRESH_KEY)
    const last = lastRaw ? parseInt(lastRaw, 10) : 0
    if (Date.now() - last < AUTO_REFRESH_INTERVAL_MS) return
    handleRefreshPrices()
    // Intentionally not depending on handleRefreshPrices identity to avoid loops;
    // we only want this to fire once per app session when threshold exceeded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading])

  // ─── Export CSV ───────────────────────────────────────────────────
  const handleExportCsv = useCallback(async () => {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.db.exportCsv()
        if (result.success) {
          console.log('Exported to:', result.path)
        }
      }
    } catch (err) {
      console.error('Failed to export:', err)
    }
  }, [])

  // ─── Export / Import DB ───────────────────────────────────────────
  // The DB file is the canonical sync unit between devices: copy it via
  // USB/AirDrop/LAN to share state without a cloud backend.
  const handleExportDb = useCallback(async () => {
    try {
      if (!window.electronAPI) return
      const result = await window.electronAPI.db.exportDb()
      if (!result.success && result.message && result.message !== 'Cancelled') {
        alert(`Export failed: ${result.message}`)
      }
    } catch (err) {
      console.error('Failed to export database:', err)
    }
  }, [])

  const handleImportDb = useCallback(async () => {
    try {
      if (!window.electronAPI) return
      const result = await window.electronAPI.db.importDb()
      if (result.success) {
        // The DB has been swapped underneath us — re-pull everything.
        const rows = await window.electronAPI.db.getAll()
        setInventory(rows as unknown as InventoryCard[])
      } else if (result.message && result.message !== 'Cancelled') {
        alert(`Import failed: ${result.message}`)
      }
    } catch (err) {
      console.error('Failed to import database:', err)
    }
  }, [])

  // ─── Keyboard shortcuts ───────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        setIsSearchOpen(true)
      }
      if (e.key === 'Escape') {
        setIsSearchOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // ─── Filtered inventory and parent item name (MUST be before early return) ───
  const filteredInventory = useMemo(() => {
    if (activeParentFilter) {
      return inventory.filter(c => c.parent_id === activeParentFilter)
    }
    return inventory
  }, [inventory, activeParentFilter])

  const parentItemName = useMemo(() => {
    if (!activeParentFilter) return null
    const parent = inventory.find(c => c.id === activeParentFilter)
    return parent ? parent.name : 'Unknown Item'
  }, [inventory, activeParentFilter])

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="ambient-bg" />
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center glow-accent animate-glow-pulse">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
          </div>
          <p className="text-sm text-gray-500 font-medium">Loading portfolio...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex overflow-hidden">
      <div className="ambient-bg" />
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
        currentPage={currentPage}
        onPageChange={updateCurrentPage}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          onAddCard={() => setIsSearchOpen(true)}
          onRefreshPrices={handleRefreshPrices}
          onExportCsv={handleExportCsv}
          onExportDb={handleExportDb}
          onImportDb={handleImportDb}
          isRefreshing={isRefreshing}
        />
        {currentPage === 'portfolio' && (
          <>
            <SummaryCards
              inventory={inventory}
              summary={summary}
              liquidationPct={liquidationPct}
              onLiquidationPctChange={updateLiquidationPct}
              includeHeldInPL={includeHeldInPL}
            />
            {activeParentFilter && (
              <div className="mx-6 mt-3 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-accent/8 border border-accent/20 animate-fade-in">
                <div className="flex items-center gap-2 min-w-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-dark flex-shrink-0">
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                  </svg>
                  <span className="text-sm text-surface-700 truncate">
                    Viewing contents of <span className="font-semibold text-surface-900">{parentItemName}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => {
                      const parent = inventory.find(c => c.id === activeParentFilter)
                      if (parent) setRipAnimationParent(parent)
                    }}
                    className="text-xs font-semibold text-accent-dark hover:bg-accent/15 px-2.5 py-1 rounded-md transition-colors"
                  >
                    View as animation
                  </button>
                  <button
                    onClick={() => setActiveParentFilter(null)}
                    className="text-xs font-semibold text-accent-dark hover:bg-accent/15 px-2.5 py-1 rounded-md transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
            <div className="flex-1 min-h-0">
              <DataGrid
                rowData={filteredInventory}
                onCellValueChanged={handleCellValueChanged}
                onDeleteRow={handleDeleteRow}
                onToggleSold={handleToggleSold}
                onToggleOpened={handleToggleOpened}
                onToggleKeep={handleToggleKeep}
                includeHeldInPL={includeHeldInPL}
                onToggleIncludeHeldInPL={toggleIncludeHeldInPL}
                onViewContents={(id) => {
                  const parent = inventory.find(c => c.id === id)
                  if (parent) setRipAnimationParent(parent)
                }}
                onEditPulledFrom={(card) => setEditingPulledFromFor(card)}
                onReorder={handleReorder}
              />
            </div>
          </>
        )}
        {currentPage === 'history' && (
          <HistoryPage
            inventory={inventory}
            onNavigateToPortfolio={() => updateCurrentPage('portfolio')}
            onEditSale={(card) => setSellingCard(card)}
          />
        )}
        {currentPage === 'analytics' && (
          <AnalyticsPage inventory={inventory} />
        )}
        {currentPage === 'market' && (
          <MarketPage
            watchlist={watchlist}
            onAddToWatchlist={handleAddToWatchlist}
            onRemoveFromWatchlist={handleRemoveFromWatchlist}
            onRefreshWatchlist={handleRefreshWatchlist}
            onAddToPortfolioFromCard={handleAddToPortfolioFromCard}
            onAddToPortfolioFromSealed={handleAddToPortfolioFromSealed}
          />
        )}
        {currentPage === 'settings' && (
          <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-2xl mx-auto">
              <h2 className="text-xl font-semibold text-surface-900 mb-1">Settings</h2>
              <p className="text-sm text-surface-500 mb-6">App preferences.</p>

              <div className="rounded-xl border border-surface-200 bg-white">
                <div className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm font-semibold text-surface-900">Dark mode</p>
                    <p className="text-xs text-surface-500 mt-0.5">Use a dark color scheme across the app.</p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={isDark}
                    onClick={toggleDark}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                      isDark ? 'bg-accent' : 'bg-surface-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                        isDark ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onAddCard={handleAddCard}
        sealedItems={inventory.filter(c => c.item_type === 'Sealed' && c.is_opened === 1)}
      />
      <SellModal
        card={sellingCard}
        onClose={() => setSellingCard(null)}
        onConfirm={handleConfirmSale}
      />
      <OpenModal
        card={openingCard}
        onClose={() => setOpeningCard(null)}
        onConfirm={handleConfirmOpen}
      />
      {ripAnimationParent && (
        <PackOpenAnimation
          parentItem={ripAnimationParent}
          cards={inventory.filter(c => c.parent_id === ripAnimationParent.id)}
          onClose={() => setRipAnimationParent(null)}
          onViewAsList={() => {
            setActiveParentFilter(ripAnimationParent.id)
            setRipAnimationParent(null)
          }}
        />
      )}
      {editingPulledFromFor && (
        <PulledFromEditor
          card={editingPulledFromFor}
          openedSealedItems={inventory.filter(c => c.item_type === 'Sealed' && c.is_opened === 1)}
          onClose={() => setEditingPulledFromFor(null)}
          onSave={(parentId) => {
            handleCellValueChanged(editingPulledFromFor.id, 'parent_id', parentId)
            setEditingPulledFromFor(null)
          }}
        />
      )}
    </div>
  )
}
