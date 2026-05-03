import React, { useState, useEffect, useCallback, useMemo } from 'react'
import Header from './components/Header'
import SummaryCards from './components/SummaryCards'
import DataGrid from './components/DataGrid'
import SearchModal from './components/SearchModal'
import { InventoryCard, SearchCard, PortfolioSummary } from './types'
import { SEED_INVENTORY } from './data/mockCards'
import { v4 as uuidv4 } from 'uuid'

export default function App() {
  const [inventory, setInventory] = useState<InventoryCard[]>([])
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [activeParentFilter, setActiveParentFilter] = useState<string | null>(null)

  // ─── Load data on mount ────────────────────────────────────────────
  useEffect(() => {
    async function loadData() {
      try {
        if (window.electronAPI) {
          const count = await window.electronAPI.db.getCount()
          if (count === 0) {
            await window.electronAPI.db.bulkInsert(SEED_INVENTORY as Record<string, unknown>[])
          }
          const rows = await window.electronAPI.db.getAll()
          setInventory(rows as unknown as InventoryCard[])
        } else {
          // Fallback for dev without Electron
          setInventory(SEED_INVENTORY as InventoryCard[])
        }
      } catch (err) {
        console.error('Failed to load data:', err)
        setInventory(SEED_INVENTORY as InventoryCard[])
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [])

  // ─── Portfolio summary ─────────────────────────────────────────────
  const summary = useMemo<PortfolioSummary>(() => {
    const held = inventory.filter(c => !c.is_sold)
    const sold = inventory.filter(c => c.is_sold === 1)

    const totalCostBasis = held.reduce((sum, c) => sum + c.purchase_price * c.quantity, 0)
    const totalMarketValue = held.reduce((sum, c) => sum + c.market_price * c.quantity, 0)
    const unrealizedPL = totalMarketValue - totalCostBasis
    const unrealizedPLPercent = totalCostBasis > 0 ? (unrealizedPL / totalCostBasis) * 100 : 0
    const realizedGains = sold.reduce((sum, c) => sum + (c.sale_price - c.purchase_price) * c.quantity, 0)
    const totalQuantity = held.reduce((sum, c) => sum + c.quantity, 0)

    return {
      totalCards: held.length,
      totalQuantity,
      totalCostBasis,
      totalMarketValue,
      unrealizedPL,
      unrealizedPLPercent,
      realizedGains,
      heldCount: held.length,
      soldCount: sold.length
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
    parentId: string | null = null
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
      parent_id: parentId
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

  // ─── Toggle sold status ───────────────────────────────────────────
  const handleToggleSold = useCallback(async (card: InventoryCard) => {
    const newStatus = card.is_sold ? 0 : 1
    try {
      if (window.electronAPI) {
        await window.electronAPI.db.update(card.id, 'is_sold', newStatus)
        if (newStatus === 0) {
          await window.electronAPI.db.update(card.id, 'sale_price', 0)
          await window.electronAPI.db.update(card.id, 'sale_date', '')
        }
      }
      setInventory(prev => prev.map(c =>
        c.id === card.id
          ? { ...c, is_sold: newStatus, sale_price: newStatus ? c.sale_price : 0, sale_date: newStatus ? c.sale_date : '' }
          : c
      ))
    } catch (err) {
      console.error('Failed to toggle sold:', err)
    }
  }, [])

  // ─── Refresh prices (mock) ────────────────────────────────────────
  const handleRefreshPrices = useCallback(async () => {
    setIsRefreshing(true)
    // Simulate API call delay
    await new Promise(r => setTimeout(r, 1500))
    // In real implementation, this would call the pokemontcg.io API
    setIsRefreshing(false)
  }, [])

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
              Viewing contents of: <span className="font-bold text-accent">{parentItemName}</span>
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
          onViewContents={setActiveParentFilter}
        />
      </div>
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onAddCard={handleAddCard}
        sealedItems={inventory.filter(c => c.item_type === 'Sealed')}
      />
    </div>
  )
}
