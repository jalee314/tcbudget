import React, { useState, useEffect, useCallback, useMemo } from 'react'
import Header from './components/Header'
import SummaryCards from './components/SummaryCards'
import DataGrid from './components/DataGrid'
import SearchModal from './components/SearchModal'
import SellModal from './components/SellModal'
import OpenModal from './components/OpenModal'
import PulledFromEditor from './components/PulledFromEditor'
import PackOpenAnimation from './components/PackOpenAnimation'
import { InventoryCard, SearchCard, PortfolioSummary } from './types'
import { v4 as uuidv4 } from 'uuid'

const LIQUIDATION_PCT_KEY = 'liquidation_pct_v1'
const LAST_AUTO_REFRESH_KEY = 'last_auto_refresh_at'
const ROW_ORDER_KEY = 'inventory_row_order_v1'
const INCLUDE_HELD_IN_PL_KEY = 'include_held_in_pl_v1'
const AUTO_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000 // 12 hours

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
    // For single-quantity items skip the modal and mark sold immediately
    if (card.quantity === 1) {
      const saleDate = new Date().toISOString().split('T')[0]
      const salePrice = card.market_price ?? 0
      if (window.electronAPI) {
        window.electronAPI.db.update(card.id, 'is_sold', 1).catch(console.error)
        window.electronAPI.db.update(card.id, 'sale_price', salePrice).catch(console.error)
        window.electronAPI.db.update(card.id, 'sale_date', saleDate).catch(console.error)
      }
      setInventory(prev => prev.map(c =>
        c.id === card.id ? { ...c, is_sold: 1, sale_price: salePrice, sale_date: saleDate } : c
      ))
      return
    }
    // Marking as sold — open modal to collect qty + price
    setSellingCard(card)
  }, [])

  const handleConfirmSale = useCallback((qtySold: number, salePrice: number) => {
    const card = sellingCard
    if (!card) return
    const saleDate = new Date().toISOString().split('T')[0]

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
    <div className="h-screen flex flex-col overflow-hidden">
      <div className="ambient-bg" />
      <Header
        onAddCard={() => setIsSearchOpen(true)}
        onRefreshPrices={handleRefreshPrices}
        onExportCsv={handleExportCsv}
        onExportDb={handleExportDb}
        onImportDb={handleImportDb}
        isRefreshing={isRefreshing}
      />
      <SummaryCards
        summary={summary}
        liquidationPct={liquidationPct}
        onLiquidationPctChange={updateLiquidationPct}
        includeHeldInPL={includeHeldInPL}
      />
      {activeParentFilter && (
        <div className="mx-6 mt-4 flex items-center justify-between animate-fade-in">
          <span className="text-sm text-surface-700">
            Viewing contents of <span className="font-semibold text-surface-900">{parentItemName}</span>
          </span>
          <button
            onClick={() => setActiveParentFilter(null)}
            className="text-xs font-semibold text-accent-dark border border-accent/40 bg-accent/10 hover:bg-accent/20 px-3 py-1.5 rounded-md transition-colors"
          >
            Clear
          </button>
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
