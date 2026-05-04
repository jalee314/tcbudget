import React, { useState, useEffect, useCallback, useMemo } from 'react'
import Header from './components/Header'
import SummaryCards from './components/SummaryCards'
import DataGrid from './components/DataGrid'
import SearchModal from './components/SearchModal'
import SellModal from './components/SellModal'
import { InventoryCard, SearchCard, PortfolioSummary } from './types'
import { v4 as uuidv4 } from 'uuid'

export default function App() {
  const [inventory, setInventory] = useState<InventoryCard[]>([])
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [activeParentFilter, setActiveParentFilter] = useState<string | null>(null)
  const [sellingCard, setSellingCard] = useState<InventoryCard | null>(null)

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
          const rows = await window.electronAPI.db.getAll()
          setInventory(rows as unknown as InventoryCard[])
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
      opened.reduce((sum, c) => sum + c.purchase_price * c.quantity, 0)
    // Opened sealed items have no resale value as sealed product — treated as $0 market value
    const totalMarketValue = held.reduce((sum, c) => sum + c.market_price * c.quantity, 0)
    const unrealizedPL = totalMarketValue - totalCostBasis
    const unrealizedPLPercent = totalCostBasis > 0 ? (unrealizedPL / totalCostBasis) * 100 : 0
    const realizedGains = sold.reduce((sum, c) => sum + (c.sale_price - c.purchase_price) * c.quantity, 0)
    const soldRevenue = sold.reduce((sum, c) => sum + c.sale_price * c.quantity, 0)
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
      openedCost
    }
  }, [inventory])

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
    variantId: string | null = null
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
      purchase_date: now.split('T')[0],
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
      variant_id: variantId
    }

    try {
      if (window.electronAPI) {
        await window.electronAPI.db.insert(newCard as unknown as Record<string, unknown>)
      }
      setInventory(prev => [newCard, ...prev])
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
    const newStatus = card.is_opened ? 0 : 1
    try {
      if (window.electronAPI) {
        await window.electronAPI.db.update(card.id, 'is_opened', newStatus)
      }
      setInventory(prev => prev.map(c =>
        c.id === card.id ? { ...c, is_opened: newStatus } : c
      ))
    } catch (err) {
      console.error('Failed to toggle opened:', err)
    }
  }, [])

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
        return [soldRow, ...updated]
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
    } catch (err) {
      console.error('Failed to refresh prices:', err)
    } finally {
      setIsRefreshing(false)
    }
  }, [inventory])

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
        isRefreshing={isRefreshing}
      />
      <SummaryCards summary={summary} />
      {activeParentFilter && (
        <div className="mx-6 mt-6 px-4 py-3 bg-surface-100 border border-surface-200 rounded-lg flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="text-xl">📦</span>
            <span className="text-sm text-surface-900 font-medium">
              Viewing contents of: <span className="font-bold text-surface-900">{parentItemName}</span>
            </span>
          </div>
          <button 
            onClick={() => setActiveParentFilter(null)}
            className="text-xs font-semibold text-surface-500 hover:text-surface-900 px-3 py-1.5 rounded-md hover:bg-surface-200 transition-colors"
          >
            Clear Filter
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
          onViewContents={setActiveParentFilter}
        />
      </div>
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onAddCard={handleAddCard}
        sealedItems={inventory.filter(c => c.item_type === 'Sealed')}
      />
      <SellModal
        card={sellingCard}
        onClose={() => setSellingCard(null)}
        onConfirm={handleConfirmSale}
      />
    </div>
  )
}
