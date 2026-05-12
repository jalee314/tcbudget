import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { SearchCard, SearchCardVariant, SealedProduct, InventoryCard } from '../types'

// ─── JustTCG helpers ────────────────────────────────────────────────────────

const CONDITION_MAP: Record<string, string> = {
  'Raw': 'Near Mint',
  'Raw NM': 'Near Mint',
  'Raw LP': 'Lightly Played',
  'Raw MP': 'Moderately Played',
  'Raw HP': 'Heavily Played',
  'Sealed': 'Sealed',
}

function conditionToJustTCG(condition: string): string {
  return CONDITION_MAP[condition] ?? 'Near Mint'
}

function pickVariant(variants: SearchCardVariant[], condition: string): SearchCardVariant | null {
  if (!variants.length) return null
  const tcgCond = conditionToJustTCG(condition)
  return (
    variants.find(v => v.condition === tcgCond && v.printing === 'Normal') ??
    variants.find(v => v.condition === tcgCond) ??
    variants.find(v => v.condition === 'Near Mint') ??
    variants[0]
  )
}

const PRODUCT_TYPE_MAP: Record<string, SealedProduct['product_type']> = {
  'elite trainer box': 'ETB',
  'etb': 'ETB',
  'booster box': 'Booster Box',
  'booster bundle': 'Booster Bundle',
  'build & battle': 'Build & Battle',
  'build and battle': 'Build & Battle',
  'premium collection': 'Premium Collection',
}

function normalizeProductType(raw: string): SealedProduct['product_type'] {
  return PRODUCT_TYPE_MAP[raw.toLowerCase()] ?? 'Other'
}

// Detect sealed-product results returned by the cards endpoint so we can drop them
// from the Single Cards tab. JustTCG has no native filter for cards-only.
const SEALED_RARITY_PATTERNS = [
  /booster\s*box/i,
  /booster\s*bundle/i,
  /elite\s*trainer\s*box/i,
  /\betb\b/i,
  /build\s*&?\s*battle/i,
  /premium\s*collection/i,
  /collection\s*box/i,
  /tin\b/i,
  /blister/i,
  /pack\b/i,
  /booster\b/i,
  /sealed/i,
]

function isSealedResult(raw: any): boolean {
  const rarity = String(raw?.rarity ?? '')
  if (SEALED_RARITY_PATTERNS.some(rx => rx.test(rarity))) return true
  // No card number is a strong signal that this isn't a single card
  const number = String(raw?.number ?? '').trim()
  if (!number) return true
  // All variants are 'Sealed' condition → sealed product
  const variants = raw?.variants ?? []
  if (variants.length > 0 && variants.every((v: any) => v?.condition === 'Sealed')) return true
  return false
}

function tcgplayerImageUrl(tcgplayerId: string | null | undefined): string {
  if (!tcgplayerId) return ''
  return `https://product-images.tcgplayer.com/fit-in/400x550/${tcgplayerId}.jpg`
}

// TYPE_KEYWORDS maps query words → required name words.
// When a query contains one of these words, results that DON'T contain the
// corresponding name word are penalised so they don't beat the correct product.
const TYPE_KEYWORDS: { query: RegExp; required: string }[] = [
  { query: /\bbundle\b/i, required: 'bundle' },
  { query: /\bbox\b/i,    required: 'box'    },
  { query: /\betb\b|\belite\s*trainer\b/i, required: 'elite trainer' },
  { query: /\btin\b/i,    required: 'tin'    },
]

function rankSealedResults(products: SealedProduct[], query: string): SealedProduct[] {
  const q = query.toLowerCase()
  const qWords = q.split(/\s+/).filter(Boolean)

  return [...products].sort((a, b) => {
    const na = a.name.toLowerCase()
    const nb = b.name.toLowerCase()

    const scoreOne = (name: string) => {
      let s = 0
      // Exact full-name match
      if (name === q) s += 100
      // Name contains the entire query string
      else if (name.includes(q)) s += 50
      // Count individual query words present in the name
      else s += qWords.filter(w => name.includes(w)).length * 10

      // Penalise results that are missing a type keyword the query has
      for (const { query: rx, required } of TYPE_KEYWORDS) {
        if (rx.test(q) && !name.includes(required)) s -= 25
      }
      return s
    }

    return scoreOne(nb) - scoreOne(na)
  })
}

function mapSealedProduct(raw: any): SealedProduct {
  const sealedVariant = (raw.variants ?? []).find((v: any) => v.condition === 'Sealed') ?? raw.variants?.[0]
  return {
    id: raw.id ?? String(Math.random()),
    name: raw.name ?? 'Unknown',
    set_name: raw.set_name ?? raw.set ?? '',
    set_id: raw.set ?? raw.set_id ?? '',
    product_type: normalizeProductType(raw.type ?? raw.product_type ?? raw.rarity ?? ''),
    pack_count: raw.pack_count ?? raw.packs ?? 0,
    market_price: sealedVariant?.price ?? raw.price ?? 0,
    image_url: tcgplayerImageUrl(raw.tcgplayerId),
    variant_id: sealedVariant?.id ?? null,
  }
}

function mapJustTCGCard(raw: any): SearchCard {
  const variants: SearchCardVariant[] = (raw.variants ?? []).map((v: any) => ({
    id: v.id,
    condition: v.condition,
    printing: v.printing ?? 'Normal',
    price: v.price ?? 0,
  }))
  const nmVariant = pickVariant(variants, 'Raw NM')
  return {
    id: raw.id,
    name: raw.name,
    set_name: raw.set_name ?? '',
    set_id: raw.set ?? '',
    card_number: raw.number ?? '',
    rarity: raw.rarity ?? '',
    image_url: tcgplayerImageUrl(raw.tcgplayerId),
    image_url_large: tcgplayerImageUrl(raw.tcgplayerId),
    market_price: nmVariant?.price ?? 0,
    variants,
  }
}

interface SearchModalProps {
  isOpen: boolean
  onClose: () => void
  onAddCard: (
    card: SearchCard | any,
    purchasePrice: number,
    quantity: number,
    condition: string,
    itemType?: 'Card' | 'Sealed' | 'Other',
    parentId?: string | null,
    variantId?: string | null,
    purchaseDate?: string
  ) => void
  sealedItems?: InventoryCard[]
}

type SelectedItem =
  | { type: 'card'; data: SearchCard }
  | { type: 'sealed'; data: SealedProduct }
  | null

// ─── Pulled-From Combobox ───────────────────────────────────────────────────

function PulledFromCombobox({
  sealedItems,
  value,
  onChange
}: {
  sealedItems: InventoryCard[]
  value: string
  onChange: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = sealedItems.find(i => i.id === value) ?? null

  const filtered = useMemo(() => {
    if (!query.trim()) return sealedItems
    const q = query.toLowerCase()
    return sealedItems.filter(
      i => i.name.toLowerCase().includes(q) || (i.set_name?.toLowerCase().includes(q) ?? false)
    )
  }, [sealedItems, query])

  const handleSelect = useCallback((id: string) => {
    onChange(id)
    setOpen(false)
    setQuery('')
  }, [onChange])

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
    setQuery('')
  }, [onChange])

  return (
    <div ref={containerRef} className="relative">
      <div
        className="input-dark flex items-center gap-2 cursor-text min-h-[38px]"
        onClick={() => { if (!selected) setOpen(true) }}
      >
        {selected ? (
          <>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-surface-900 truncate">{selected.name}</div>
              <div className="text-[11px] text-surface-500 truncate">{selected.set_name}</div>
            </div>
            <button onClick={handleClear} className="text-surface-400 hover:text-surface-700 flex-shrink-0 text-lg leading-none">×</button>
          </>
        ) : (
          <input
            type="text"
            placeholder={sealedItems.length === 0 ? 'No opened sealed items in inventory' : 'Search opened sealed items...'}
            value={query}
            disabled={sealedItems.length === 0}
            onChange={e => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            className="bg-transparent flex-1 outline-none text-sm min-w-0 disabled:cursor-not-allowed"
          />
        )}
      </div>

      {open && sealedItems.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-20 border border-surface-200 rounded-lg shadow-lg max-h-44 overflow-y-auto mt-1"
          style={{ background: 'var(--color-surface-bg, white)' }}>
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-xs text-surface-400 text-center">No matches for "{query}"</div>
          ) : (
            filtered.map(item => (
              <button
                key={item.id}
                onClick={() => handleSelect(item.id)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-surface-50 flex items-center gap-2 transition-colors ${value === item.id ? 'bg-accent/5' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-surface-900 truncate">{item.name}</div>
                  <div className="text-[11px] text-surface-400 truncate">{item.set_name}</div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function SearchModal({ isOpen, onClose, onAddCard, sealedItems = [] }: SearchModalProps) {
  const [activeTab, setActiveTab] = useState<'cards' | 'sealed' | 'manual'>('sealed')

  // Per-tab search queries
  const [cardQuery, setCardQuery] = useState('')
  const [sealedQuery, setSealedQuery] = useState('')
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(null)

  // Manual entry state
  const [manualName, setManualName] = useState('')
  const [manualSet, setManualSet] = useState('')
  const [manualType, setManualType] = useState<'Card' | 'Sealed' | 'Other'>('Sealed')
  const [manualMarketPrice, setManualMarketPrice] = useState('')

  // Shared form state
  const [purchasePrice, setPurchasePrice] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [condition, setCondition] = useState('Raw')
  const [parentId, setParentId] = useState('')
  const [isGifted, setIsGifted] = useState(false)
  const [purchaseDate, setPurchaseDate] = useState<string>(() => new Date().toISOString().slice(0, 10))

  // ─── Card search via JustTCG (debounced) ───────────────────────────────────
  const [cardResults, setCardResults] = useState<SearchCard[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  useEffect(() => {
    if (!cardQuery.trim()) {
      setCardResults([])
      setSearchError(null)
      return
    }
    setIsSearching(true)
    setSearchError(null)
    const timer = setTimeout(async () => {
      try {
        const res = await window.electronAPI.justtcg.search(cardQuery)
        if (res.error) {
          setSearchError(res.error)
          setCardResults([])
        } else {
          const cardsOnly = (res.data as any[]).filter(raw => !isSealedResult(raw))
          const mapped = cardsOnly.map(mapJustTCGCard)
          
          // Check if query matches any set names in results
          const queryLower = cardQuery.toLowerCase().trim()
          const matchingSetNames = new Set<string>()
          
          for (const card of mapped) {
            if (card.set_name.toLowerCase().includes(queryLower)) {
              matchingSetNames.add(card.set_name)
            }
          }
          
          // If set names were matched, filter results to only show cards from those sets
          if (matchingSetNames.size > 0) {
            const filteredBySet = mapped.filter(card => matchingSetNames.has(card.set_name))
            setCardResults(filteredBySet)
          } else {
            setCardResults(mapped)
          }
        }
      } catch (err: any) {
        setSearchError(err?.message ?? 'Search failed')
        setCardResults([])
      } finally {
        setIsSearching(false)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [cardQuery])

  // ─── Sealed product results via JustTCG API (debounced) ───────────────────
  const [sealedResults, setSealedResults] = useState<SealedProduct[]>([])
  const [isSealedSearching, setIsSealedSearching] = useState(false)
  const [sealedError, setSealedError] = useState<string | null>(null)

  useEffect(() => {
    if (!sealedQuery.trim()) {
      setSealedResults([])
      setSealedError(null)
      setIsSealedSearching(false)
      return
    }

    setIsSealedSearching(true)
    setSealedError(null)
    const timer = setTimeout(async () => {
      try {
        const res = await window.electronAPI.justtcg.searchSealed(sealedQuery)
        if (res.error) {
          setSealedError(res.error)
          setSealedResults([])
        } else {
          const mapped = (res.data as any[]).map(mapSealedProduct)
          setSealedResults(rankSealedResults(mapped, sealedQuery))
        }
      } catch (err: any) {
        setSealedError(err?.message ?? 'Search failed')
        setSealedResults([])
      } finally {
        setIsSealedSearching(false)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [sealedQuery])

  const handleReset = useCallback(() => {
    setSelectedItem(null)
    setPurchasePrice('')
    setQuantity('1')
    setCondition('Raw')
    setCardQuery('')
    setSealedQuery('')
    setParentId('')
    setManualName('')
    setManualSet('')
    setManualMarketPrice('')
    setIsGifted(false)
    setPurchaseDate(new Date().toISOString().slice(0, 10))
  }, [])

  const handleClose = useCallback(() => {
    handleReset()
    onClose()
  }, [handleReset, onClose])

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) handleClose()
  }, [handleClose])

  const handleSelectCard = useCallback((card: SearchCard) => {
    setSelectedItem({ type: 'card', data: card })
  }, [])

  const handleSelectSealed = useCallback((product: SealedProduct) => {
    setSelectedItem({ type: 'sealed', data: product })
    setCondition('Sealed')
  }, [])

  const activeVariant = useMemo(() => {
    if (selectedItem?.type !== 'card') return null
    const variants = selectedItem.data.variants
    if (!variants?.length) return null
    return pickVariant(variants, condition)
  }, [selectedItem, condition])

  const displayedMarketPrice = useMemo(() => {
    if (selectedItem?.type === 'card') return activeVariant?.price ?? selectedItem.data.market_price
    if (selectedItem?.type === 'sealed') return selectedItem.data.market_price
    return 0
  }, [selectedItem, activeVariant])

  const handleAdd = useCallback(() => {
    if (!selectedItem) return
    if (selectedItem.type === 'card') {
      const price = isGifted ? 0 : (parseFloat(purchasePrice) || displayedMarketPrice)
      onAddCard(selectedItem.data, price, parseInt(quantity) || 1, condition, 'Card', parentId || null, activeVariant?.id ?? null, purchaseDate || undefined)
    } else {
      const p = selectedItem.data
      const price = isGifted ? 0 : (parseFloat(purchasePrice) || p.market_price)
      const sealedAsCard = {
        id: p.id, name: p.name, set_name: p.set_name, set_id: p.set_id,
        card_number: '', rarity: p.product_type, image_url: p.image_url, market_price: p.market_price
      }
      onAddCard(sealedAsCard, price, parseInt(quantity) || 1, 'Sealed', 'Sealed', null, p.variant_id ?? null, purchaseDate || undefined)
    }
    handleClose()
  }, [selectedItem, purchasePrice, quantity, condition, parentId, activeVariant, displayedMarketPrice, isGifted, purchaseDate, onAddCard, handleClose])

  const handleAddManual = useCallback(() => {
    if (!manualName.trim()) return
    const price = isGifted ? 0 : (parseFloat(purchasePrice) || 0)
    const market = parseFloat(manualMarketPrice) || 0
    const qty = parseInt(quantity) || 1
    const customItem = {
      id: 'manual-' + Date.now(), name: manualName, set_name: manualSet,
      set_id: '', card_number: '', rarity: '', image_url: '', market_price: market
    }
    onAddCard(customItem, price, qty, manualType === 'Sealed' ? 'Sealed' : condition, manualType, parentId || null, null, purchaseDate || undefined)
    handleClose()
  }, [manualName, manualSet, manualMarketPrice, purchasePrice, quantity, condition, manualType, parentId, isGifted, purchaseDate, onAddCard, handleClose])

  if (!isOpen) return null

  // ─── Shared detail form (shown when an item is selected on cards/sealed tabs) ──
  const DetailForm = selectedItem ? (
    <div className="animate-slide-up pb-16">
      <button onClick={() => setSelectedItem(null)} className="flex items-center gap-1 text-xs text-surface-600 hover:text-surface-900 mb-4 transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6"/>
        </svg>
        Back to {activeTab === 'cards' ? 'card search' : 'sealed products'}
      </button>
      <div className="flex gap-6">
        <div className="w-40 flex-shrink-0">
          {selectedItem.type === 'card' ? (
            <div className="rounded-xl overflow-hidden bg-surface-200 shadow-sm">
              <img src={selectedItem.data.image_url} alt={selectedItem.data.name} className="w-full" />
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden bg-surface-200 shadow-sm">
              {selectedItem.data.image_url ? (
                <img src={selectedItem.data.image_url} alt={selectedItem.data.name} className="w-full" />
              ) : (
                <div className="aspect-[3/4] flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-surface-400">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                  </svg>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex-1 space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {(selectedItem.type !== 'sealed' || selectedItem.data.product_type !== 'Other') && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider ${selectedItem.type === 'sealed' ? 'bg-blue-100 text-blue-700' : 'bg-surface-100 text-surface-600'}`}>
                  {selectedItem.type === 'sealed' ? selectedItem.data.product_type : 'Card'}
                </span>
              )}
            </div>
            <h3 className="text-xl font-bold text-surface-900">{selectedItem.data.name}</h3>
            <p className="text-sm text-surface-500 mt-1">{selectedItem.data.set_name}</p>
            {selectedItem.type === 'card' && <p className="text-xs text-surface-400 mt-0.5">{selectedItem.data.card_number} · {selectedItem.data.rarity}</p>}
            {selectedItem.type === 'sealed' && <p className="text-xs text-surface-400 mt-0.5">{selectedItem.data.pack_count} packs</p>}
          </div>
          <div className="glass-card-subtle p-3 rounded-lg border border-surface-200 bg-surface-50">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-surface-500">
              Market Price
              {activeVariant && <span className="ml-1 font-normal normal-case text-surface-400">· {activeVariant.condition} {activeVariant.printing !== 'Normal' ? activeVariant.printing : ''}</span>}
            </span>
            <p className="text-2xl font-semibold text-surface-900 mt-0.5 tabular-nums">${displayedMarketPrice.toFixed(2)}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-surface-500">Purchase Price</label>
                <label className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-surface-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isGifted}
                    onChange={(e) => setIsGifted(e.target.checked)}
                    className="accent-accent w-3 h-3"
                  />
                  Gifted
                </label>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500 text-sm font-mono pointer-events-none">$</span>
                <input type="text" inputMode="decimal" placeholder={displayedMarketPrice.toFixed(2)} value={isGifted ? '0' : purchasePrice} onChange={e => setPurchasePrice(e.target.value)} disabled={isGifted} className="input-dark py-2 text-sm font-mono !pl-7 disabled:opacity-60" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-surface-500 mb-1 block">Quantity</label>
              <input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} className="input-dark py-2 text-sm font-mono" />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-surface-500 mb-1 block">
                Purchase Date <span className="text-surface-400 font-normal normal-case">(optional)</span>
              </label>
              <input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} className="input-dark py-2 text-sm font-mono" />
            </div>
            {selectedItem.type === 'card' && (
              <>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-surface-500 mb-1 block">Condition</label>
                  <select value={condition} onChange={e => setCondition(e.target.value)} className="input-dark py-2 text-sm">
                    <option value="Raw">Raw</option>
                    <option value="Raw NM">Raw NM</option>
                    <option value="Raw LP">Raw LP</option>
                    <option value="PSA 10">PSA 10</option>
                    <option value="PSA 9">PSA 9</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-surface-500 mb-1 block">
                    Pulled From <span className="text-surface-400 font-normal normal-case">(optional, opened sealed only)</span>
                  </label>
                  <PulledFromCombobox sealedItems={sealedItems} value={parentId} onChange={setParentId} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  ) : null

  return (
    <div
      className="fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-4 animate-fade-in"
      onClick={handleBackdropClick}
    >
      <div
        className="glass-card w-full max-w-2xl h-[85vh] flex flex-col shadow-xl-soft animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
          <div>
            <h2 className="text-base font-bold text-surface-900">Add Item to Portfolio</h2>
            <p className="text-xs text-surface-500 mt-0.5">Search cards & sealed products, or add manually</p>
          </div>
          <button onClick={handleClose} className="p-2 rounded-lg text-surface-500 hover:text-surface-900 hover:bg-surface-100 transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-surface-200 px-6">
          {(['sealed', 'cards', 'manual'] as const).map((tab, i) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); handleReset() }}
              className={`py-3 ${i < 2 ? 'mr-6' : ''} text-sm font-semibold border-b-2 transition-colors ${activeTab === tab ? 'border-accent text-surface-900' : 'border-transparent text-surface-500 hover:text-surface-700'}`}
            >
              {tab === 'sealed' ? 'Sealed Products' : tab === 'cards' ? 'Single Cards' : 'Manual Entry'}
            </button>
          ))}
        </div>

        {/* ─── SEALED TAB ──────────────────────────────────────────────────── */}
        {activeTab === 'sealed' && (
          <>
            {!selectedItem && (
              <div className="px-6 py-3 border-b border-surface-100">
                <div className="relative">
                  <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                  </svg>
                  <input type="text" placeholder="Search ETBs, booster boxes, bundles..." value={sealedQuery} onChange={e => setSealedQuery(e.target.value)} className="input-dark !pl-10" autoFocus />
                </div>
                {sealedQuery.trim() && (
                  <p className="text-[11px] text-surface-400 mt-1.5 px-1">
                    {isSealedSearching ? 'Searching…' : `${sealedResults.length} result${sealedResults.length !== 1 ? 's' : ''}`}
                    {sealedError && <span className="text-red-400 ml-1">— {sealedError}</span>}
                  </p>
                )}
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
              {selectedItem ? DetailForm : (
                <div className="space-y-1">
                  {isSealedSearching ? (
                    <div className="text-center py-12 text-surface-400">
                      <p className="text-sm">Searching…</p>
                    </div>
                  ) : !sealedQuery.trim() ? (
                    <div className="flex flex-col items-center justify-center py-12 text-surface-400">
                      <svg className="mb-3 opacity-40" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                      </svg>
                      <p className="text-sm">Type a product name to search</p>
                    </div>
                  ) : sealedResults.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-surface-500">
                      <p className="text-sm">No results for "{sealedQuery}"</p>
                    </div>
                  ) : (
                    <>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-surface-400 px-2 py-1.5">
                        {sealedResults.length} product{sealedResults.length !== 1 ? 's' : ''}
                      </div>
                      {sealedResults.map((product: SealedProduct) => (
                        <button key={product.id} onClick={() => handleSelectSealed(product)}
                          className="flex items-center gap-3 p-3 rounded-lg text-left w-full hover:bg-surface-50 border border-transparent hover:border-surface-200 transition-all duration-200 group"
                        >
                          <div className="w-10 h-14 rounded-md overflow-hidden flex-shrink-0 bg-surface-100 flex items-center justify-center">
                            {product.image_url ? (
                              <img src={product.image_url} alt={product.name} className="w-full h-full object-contain p-1" loading="lazy" />
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-surface-400">
                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                              </svg>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              {product.product_type !== 'Other' && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold flex-shrink-0">{product.product_type}</span>
                              )}
                            </div>
                            <div className="text-sm font-medium text-surface-900 group-hover:text-black truncate">{product.name}</div>
                            <div className="text-[11px] text-surface-500 truncate">{product.set_name} · {product.pack_count} packs</div>
                          </div>
                          <div className="text-sm font-medium text-surface-900 tabular-nums">${product.market_price.toFixed(2)}</div>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* ─── CARDS TAB ───────────────────────────────────────────────────── */}
        {activeTab === 'cards' && (
          <>
            {!selectedItem && (
              <div className="px-6 py-3 border-b border-surface-100">
                <div className="relative">
                  <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                  </svg>
                  <input type="text" placeholder="Search by card name, e.g. Charizard ex..." value={cardQuery} onChange={e => setCardQuery(e.target.value)} className="input-dark !pl-10" autoFocus />
                </div>
                {cardQuery && (
                  <p className="text-[11px] text-surface-400 mt-1.5 px-1">
                    {isSearching ? 'Searching…' : `${cardResults.length} result${cardResults.length !== 1 ? 's' : ''}`}
                    {searchError && <span className="text-red-400 ml-1">— {searchError}</span>}
                  </p>
                )}
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
              {selectedItem ? DetailForm : (
                <div className="space-y-1">
                  {!cardQuery.trim() ? (
                    <div className="flex flex-col items-center justify-center py-12 text-surface-400">
                      <svg className="mb-3 opacity-40" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                      </svg>
                      <p className="text-sm">Type a card name to search</p>
                    </div>
                  ) : cardResults.length === 0 && !isSearching ? (
                    <div className="text-center py-12 text-surface-500">
                      <p className="text-sm">No cards found for "{cardQuery}"</p>
                    </div>
                  ) : (
                    <>
                      {cardResults.length > 0 && (
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-surface-400 px-2 py-1.5">
                          {cardResults.length} card{cardResults.length !== 1 ? 's' : ''}
                        </div>
                      )}
                      {cardResults.map((card: SearchCard) => (
                        <button key={card.id} onClick={() => handleSelectCard(card)}
                          className="flex items-center gap-3 p-3 rounded-lg text-left w-full hover:bg-surface-50 border border-transparent hover:border-surface-200 transition-all duration-200 group"
                        >
                          <div className="w-10 h-14 rounded-md overflow-hidden flex-shrink-0 bg-surface-200">
                            <img src={card.image_url} alt={card.name} className="w-full h-full object-contain" loading="lazy" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-surface-900 group-hover:text-black truncate">{card.name}</div>
                            <div className="text-[11px] text-surface-500 truncate">{card.set_name} · {card.card_number} · {card.rarity}</div>
                          </div>
                          <div className="text-sm font-medium text-surface-900 tabular-nums">${card.market_price.toFixed(2)}</div>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* ─── MANUAL ENTRY TAB ────────────────────────────────────────────── */}
        {activeTab === 'manual' && (
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="space-y-4 max-w-md mx-auto">
              <div>
                <label className="text-xs font-semibold text-surface-700 mb-1.5 block">Item Name</label>
                <input type="text" value={manualName} onChange={e => setManualName(e.target.value)} placeholder="e.g. Twilight Masquerade Booster Box" className="input-dark py-2.5" autoFocus />
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
                  <label className="text-xs font-semibold text-surface-700 mb-1.5 block">Market Value</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500 text-sm font-mono pointer-events-none">$</span>
                    <input type="text" inputMode="decimal" value={manualMarketPrice} onChange={e => setManualMarketPrice(e.target.value)} placeholder="0.00" className="input-dark py-2.5 font-mono !pl-7" />
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t border-surface-200 grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-surface-700">Purchase Price</label>
                    <label className="flex items-center gap-1 text-[11px] font-semibold text-surface-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isGifted}
                        onChange={(e) => setIsGifted(e.target.checked)}
                        className="accent-accent w-3 h-3"
                      />
                      Gifted
                    </label>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500 text-sm font-mono pointer-events-none">$</span>
                    <input type="text" inputMode="decimal" value={isGifted ? '0' : purchasePrice} onChange={e => setPurchasePrice(e.target.value)} disabled={isGifted} placeholder="0.00" className="input-dark py-2.5 font-mono !pl-7 disabled:opacity-60" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-surface-700 mb-1.5 block">Quantity</label>
                  <input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} className="input-dark py-2.5 font-mono" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-surface-700 mb-1.5 block">
                    Purchase Date <span className="text-surface-400 font-normal">(optional)</span>
                  </label>
                  <input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} className="input-dark py-2.5 font-mono" />
                </div>
                {manualType !== 'Sealed' && (
                  <div>
                    <label className="text-xs font-semibold text-surface-700 mb-1.5 block">Condition</label>
                    <select value={condition} onChange={e => setCondition(e.target.value)} className="input-dark py-2.5">
                      <option value="Raw">Raw</option>
                      <option value="Raw NM">Raw NM</option>
                      <option value="Raw LP">Raw LP</option>
                      <option value="PSA 10">PSA 10</option>
                      <option value="PSA 9">PSA 9</option>
                    </select>
                  </div>
                )}
                {manualType === 'Card' && (
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-surface-700 mb-1.5 block">
                      Pulled From <span className="text-surface-400 font-normal">(optional, opened sealed only)</span>
                    </label>
                    <PulledFromCombobox sealedItems={sealedItems} value={parentId} onChange={setParentId} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        {(selectedItem || activeTab === 'manual') && (
          <div className="px-6 py-4 border-t border-surface-200 flex items-center justify-end gap-3 bg-surface-50">
            <button onClick={handleClose} className="btn-ghost text-sm">Cancel</button>
            <button
              onClick={activeTab === 'manual' ? handleAddManual : handleAdd}
              disabled={activeTab === 'manual' && !manualName.trim()}
              className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
