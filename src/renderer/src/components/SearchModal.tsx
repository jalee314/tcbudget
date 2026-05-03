import React, { useState, useMemo, useCallback } from 'react'
import { MOCK_SEARCH_CARDS } from '../data/mockCards'
import { SearchCard, InventoryCard } from '../types'

interface SearchModalProps {
  isOpen: boolean
  onClose: () => void
  onAddCard: (
    card: SearchCard | any, 
    purchasePrice: number, 
    quantity: number, 
    condition: string,
    itemType?: 'Card' | 'Sealed' | 'Other',
    parentId?: string | null
  ) => void
  sealedItems?: InventoryCard[]
}

export default function SearchModal({ isOpen, onClose, onAddCard, sealedItems = [] }: SearchModalProps) {
  const [activeTab, setActiveTab] = useState<'api' | 'manual'>('api')
  
  // API Search State
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCard, setSelectedCard] = useState<SearchCard | null>(null)
  
  // Manual Entry State
  const [manualName, setManualName] = useState('')
  const [manualSet, setManualSet] = useState('')
  const [manualType, setManualType] = useState<'Card' | 'Sealed' | 'Other'>('Sealed')
  const [manualMarketPrice, setManualMarketPrice] = useState('')

  // Shared Add State
  const [purchasePrice, setPurchasePrice] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [condition, setCondition] = useState('Raw')
  const [parentId, setParentId] = useState('')

  const filteredCards = useMemo(() => {
    if (!searchQuery.trim()) return MOCK_SEARCH_CARDS
    const q = searchQuery.toLowerCase()
    return MOCK_SEARCH_CARDS.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.set_name.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q)
    )
  }, [searchQuery])

  const handleReset = useCallback(() => {
    setSelectedCard(null)
    setPurchasePrice('')
    setQuantity('1')
    setCondition('Raw')
    setSearchQuery('')
    setParentId('')
    setManualName('')
    setManualSet('')
    setManualMarketPrice('')
  }, [])

  const handleClose = useCallback(() => {
    handleReset()
    onClose()
  }, [handleReset, onClose])

  const handleAddApiCard = useCallback(() => {
    if (!selectedCard) return
    const price = parseFloat(purchasePrice) || selectedCard.market_price
    const qty = parseInt(quantity) || 1
    onAddCard(selectedCard, price, qty, condition, 'Card', parentId || null)
    handleClose()
  }, [selectedCard, purchasePrice, quantity, condition, parentId, onAddCard, handleClose])

  const handleAddManualItem = useCallback(() => {
    if (!manualName.trim()) return
    const price = parseFloat(purchasePrice) || 0
    const market = parseFloat(manualMarketPrice) || 0
    const qty = parseInt(quantity) || 1
    
    const customItem = {
      id: 'manual-' + Date.now(),
      name: manualName,
      set_name: manualSet,
      set_id: '',
      card_number: '',
      rarity: '',
      image_url: '',
      market_price: market
    }
    
    onAddCard(customItem, price, qty, condition, manualType, parentId || null)
    handleClose()
  }, [manualName, manualSet, manualMarketPrice, purchasePrice, quantity, condition, manualType, parentId, onAddCard, handleClose])

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) handleClose()
  }, [handleClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-4 animate-fade-in"
      onClick={handleBackdropClick}>
      <div className="glass-card w-full max-w-2xl max-h-[85vh] flex flex-col animate-scale-in"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
          <div>
            <h2 className="text-base font-bold text-surface-900">Add Item to Portfolio</h2>
            <p className="text-xs text-surface-500 mt-0.5">Search for an item or add one manually</p>
          </div>
          <button onClick={handleClose}
            className="p-2 rounded-lg text-surface-500 hover:text-surface-900 hover:bg-surface-100 transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-surface-200 px-6">
          <button onClick={() => { setActiveTab('api'); handleReset(); }} 
            className={`py-3 mr-6 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'api' ? 'border-accent text-surface-900' : 'border-transparent text-surface-500 hover:text-surface-700'}`}>
            Pokémon TCG Database
          </button>
          <button onClick={() => { setActiveTab('manual'); handleReset(); setCondition('Sealed'); }} 
            className={`py-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'manual' ? 'border-accent text-surface-900' : 'border-transparent text-surface-500 hover:text-surface-700'}`}>
            Manual Entry (ETBs, Boxes)
          </button>
        </div>

        {activeTab === 'api' ? (
          <>
            {/* Search Input */}
            {!selectedCard && (
              <div className="px-6 py-3 border-b border-surface-100">
                <div className="relative">
                  <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400" xmlns="http://www.w3.org/2000/svg"
                    width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                  </svg>
                  <input type="text" placeholder="Search by name, set, or item ID..."
                    value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    className="input-dark !pl-10" autoFocus />
                </div>
              </div>
            )}

            {/* Results or Selected Card */}
            <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
              {selectedCard ? (
                <div className="animate-slide-up">
                  <button onClick={() => setSelectedCard(null)}
                    className="flex items-center gap-1 text-xs text-surface-600 hover:text-surface-900 mb-4 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m15 18-6-6 6-6"/>
                    </svg>
                    Back to search
                  </button>
                  <div className="flex gap-6">
                    <div className="w-40 flex-shrink-0">
                      <div className="card-image-container rounded-xl overflow-hidden bg-surface-200 shadow-sm border border-surface-200">
                        <img src={selectedCard.image_url} alt={selectedCard.name} className="w-full" />
                      </div>
                    </div>
                    <div className="flex-1 space-y-4">
                      <div>
                        <h3 className="text-xl font-bold text-surface-900">{selectedCard.name}</h3>
                        <p className="text-sm text-surface-500 mt-1">{selectedCard.set_name} · {selectedCard.card_number}</p>
                        <p className="text-xs text-surface-400 mt-0.5">{selectedCard.rarity}</p>
                      </div>
                      <div className="glass-card-subtle p-3 rounded-lg border border-surface-200 bg-surface-50">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-surface-500">Market Price</span>
                        <p className="text-2xl font-bold font-mono text-surface-900 mt-0.5">
                          ${selectedCard.market_price.toFixed(2)}
                        </p>
                      </div>
                      
                      {/* Purchase Details */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-surface-500 mb-1 block">Purchase Price</label>
                          <input type="number" step="0.01" placeholder={selectedCard.market_price.toFixed(2)}
                            value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)}
                            className="input-dark py-2 text-sm font-mono" />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-surface-500 mb-1 block">Quantity</label>
                          <input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)}
                            className="input-dark py-2 text-sm font-mono" />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-surface-500 mb-1 block">Condition</label>
                          <select value={condition} onChange={e => setCondition(e.target.value)}
                            className="input-dark py-2 text-sm">
                            <option value="Raw">Raw</option>
                            <option value="Raw NM">Raw NM</option>
                            <option value="Raw LP">Raw LP</option>
                            <option value="PSA 10">PSA 10</option>
                            <option value="PSA 9">PSA 9</option>
                            <option value="Sealed">Sealed</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-surface-500 mb-1 block">Pulled From (Optional)</label>
                          <select value={parentId} onChange={e => setParentId(e.target.value)} className="input-dark py-2 text-sm">
                            <option value="">-- None --</option>
                            {sealedItems.map(item => (
                              <option key={item.id} value={item.id}>{item.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {filteredCards.length === 0 ? (
                    <div className="text-center py-12 text-surface-500">
                      <p className="text-sm">No items found matching "{searchQuery}"</p>
                    </div>
                  ) : (
                    filteredCards.map(card => (
                      <button key={card.id} onClick={() => setSelectedCard(card)}
                        className="flex items-center gap-3 p-3 rounded-lg text-left w-full hover:bg-surface-50 border border-transparent hover:border-surface-200 transition-all duration-200 group">
                        <div className="w-10 h-14 rounded-md overflow-hidden flex-shrink-0 bg-surface-200">
                          <img src={card.image_url} alt={card.name} className="w-full h-full object-cover transition-transform group-hover:scale-110" loading="lazy" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-surface-900 group-hover:text-black truncate">{card.name}</div>
                          <div className="text-[11px] text-surface-500 truncate">{card.set_name} · {card.card_number} · {card.rarity}</div>
                        </div>
                        <div className="text-sm font-mono font-medium text-surface-900">${card.market_price.toFixed(2)}</div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="space-y-4 max-w-md mx-auto">
              <div>
                <label className="text-xs font-semibold text-surface-700 mb-1.5 block">Item Name</label>
                <input type="text" value={manualName} onChange={e => setManualName(e.target.value)} placeholder="e.g. Twilight Masquerade Booster Box" className="input-dark py-2.5" />
              </div>
              <div>
                <label className="text-xs font-semibold text-surface-700 mb-1.5 block">Set Name (Optional)</label>
                <input type="text" value={manualSet} onChange={e => setManualSet(e.target.value)} placeholder="e.g. Twilight Masquerade" className="input-dark py-2.5" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-surface-700 mb-1.5 block">Item Type</label>
                  <select value={manualType} onChange={e => setManualType(e.target.value as any)} className="input-dark py-2.5">
                    <option value="Sealed">Sealed Product</option>
                    <option value="Card">Single Card</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-surface-700 mb-1.5 block">Market Value ($)</label>
                  <input type="number" step="0.01" value={manualMarketPrice} onChange={e => setManualMarketPrice(e.target.value)} placeholder="0.00" className="input-dark py-2.5 font-mono" />
                </div>
              </div>
              <div className="pt-4 border-t border-surface-200 grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-surface-700 mb-1.5 block">Purchase Price ($)</label>
                  <input type="number" step="0.01" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} placeholder="0.00" className="input-dark py-2.5 font-mono" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-surface-700 mb-1.5 block">Quantity</label>
                  <input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} className="input-dark py-2.5 font-mono" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-surface-700 mb-1.5 block">Condition</label>
                  <select value={condition} onChange={e => setCondition(e.target.value)} className="input-dark py-2.5">
                    <option value="Sealed">Sealed</option>
                    <option value="Raw">Raw</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-surface-700 mb-1.5 block">Pulled From</label>
                  <select value={parentId} onChange={e => setParentId(e.target.value)} className="input-dark py-2.5">
                    <option value="">-- None --</option>
                    {sealedItems.map(item => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        {((activeTab === 'api' && selectedCard) || activeTab === 'manual') && (
          <div className="px-6 py-4 border-t border-surface-200 flex items-center justify-end gap-3 bg-surface-50">
            <button onClick={handleClose} className="btn-ghost text-sm">Cancel</button>
            <button 
              onClick={activeTab === 'api' ? handleAddApiCard : handleAddManualItem} 
              disabled={activeTab === 'manual' && !manualName.trim()}
              className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14"/><path d="M5 12h14"/>
              </svg>
              Add to Portfolio
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
