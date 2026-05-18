import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { SearchCard, SearchCardVariant, SealedProduct } from '../types'

export interface WatchlistItem {
  id: string                  // unique key (card_id + variant_id for cards, sealed_id for sealed)
  type: 'card' | 'sealed'
  card_id: string
  variant_id: string | null
  name: string
  set_name: string
  set_id: string
  card_number: string
  rarity: string
  image_url: string
  baseline_price: number
  baseline_added_at: string
  last_price: number
  last_updated: string
  pack_count?: number
}

interface MarketPageProps {
  watchlist: WatchlistItem[]
  onAddToWatchlist: (item: WatchlistItem) => void
  onRemoveFromWatchlist: (id: string) => void
  onRefreshWatchlist: () => Promise<void>
  onAddToPortfolioFromCard: (
    card: SearchCard,
    variantId: string | null,
    condition: string
  ) => void
  onAddToPortfolioFromSealed: (product: SealedProduct) => void
}

// ─── JustTCG result helpers (mirrors SearchModal) ───────────────────────────

function tcgplayerImageUrl(tcgplayerId: string | null | undefined): string {
  if (!tcgplayerId) return ''
  return `https://product-images.tcgplayer.com/fit-in/400x550/${tcgplayerId}.jpg`
}

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
  const number = String(raw?.number ?? '').trim()
  if (!number) return true
  const variants = raw?.variants ?? []
  if (variants.length > 0 && variants.every((v: any) => v?.condition === 'Sealed')) return true
  return false
}

function pickNMVariant(variants: SearchCardVariant[]): SearchCardVariant | null {
  if (!variants.length) return null
  return (
    variants.find(v => v.condition === 'Near Mint' && v.printing === 'Normal') ??
    variants.find(v => v.condition === 'Near Mint') ??
    variants[0]
  )
}

function mapJustTCGCard(raw: any): SearchCard {
  const variants: SearchCardVariant[] = (raw.variants ?? []).map((v: any) => ({
    id: v.id,
    condition: v.condition,
    printing: v.printing ?? 'Normal',
    price: v.price ?? 0,
  }))
  const nmVariant = pickNMVariant(variants)
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

function formatUSD(v: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(v)
}

function formatPct(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
}

// Curated seeds for the featured carousel — high-profile names that
// reliably return a healthy spread of cards from the JustTCG search API.
const FEATURED_SEEDS = [
  'Charizard ex',
  'Pikachu',
  'Mewtwo',
  'Lugia',
  'Umbreon',
  'Rayquaza',
  'Mew',
  'Gengar',
  'Eevee',
  'Greninja',
  'Gardevoir',
  'Lucario'
]

function pickRandomSeed(exclude?: string): string {
  let next = FEATURED_SEEDS[Math.floor(Math.random() * FEATURED_SEEDS.length)]
  let guard = 0
  while (next === exclude && guard++ < 6) {
    next = FEATURED_SEEDS[Math.floor(Math.random() * FEATURED_SEEDS.length)]
  }
  return next
}

// ─── 3D Featured Carousel ───────────────────────────────────────────────────

interface FeaturedCarouselProps {
  watchlistIds: Set<string>
  onWatchCard: (card: SearchCard) => void
  onAddToPortfolioFromCard: MarketPageProps['onAddToPortfolioFromCard']
}

function FeaturedCarousel({ watchlistIds, onWatchCard, onAddToPortfolioFromCard }: FeaturedCarouselProps) {
  const [cards, setCards] = useState<SearchCard[]>([])
  const [loading, setLoading] = useState(true)
  const [seed, setSeed] = useState<string>(() => pickRandomSeed())
  const [center, setCenter] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setCards([])
    window.electronAPI.justtcg.search(seed).then(res => {
      if (cancelled) return
      if (res.error) {
        setCards([])
      } else {
        const filtered = (res.data as any[])
          .filter(raw => !isSealedResult(raw))
          .filter(raw => raw.tcgplayerId)
          .slice(0, 9)
          .map(mapJustTCGCard)
        setCards(filtered)
        setCenter(filtered.length > 0 ? Math.floor(filtered.length / 2) : 0)
      }
      setLoading(false)
    }).catch(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [seed])

  const prev = useCallback(() => setCenter(i => Math.max(0, i - 1)), [])
  const next = useCallback(() => setCenter(i => Math.min(cards.length - 1, i + 1)), [cards.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prev, next])

  const centerCard = cards[center] ?? null
  const centerNM = centerCard ? pickNMVariant(centerCard.variants ?? []) : null
  const centerWatchId = centerCard ? `card:${centerCard.id}:${centerNM?.id ?? 'nm'}` : ''
  const isWatched = centerWatchId ? watchlistIds.has(centerWatchId) : false

  return (
    <div className="px-6 pt-4 pb-2 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-surface-900">Featured Cards</h2>
          <p className="text-[11px] text-surface-500 mt-0.5 truncate">
            Discover popular cards · <span className="font-medium text-surface-700">"{seed}"</span>
          </p>
        </div>
        <button
          onClick={() => setSeed(s => pickRandomSeed(s))}
          className="btn-ghost text-xs flex items-center gap-1.5"
          title="Shuffle featured cards"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 3h5v5" />
            <path d="M4 20 21 3" />
            <path d="M21 16v5h-5" />
            <path d="m15 15 6 6" />
            <path d="M4 4l5 5" />
          </svg>
          Shuffle
        </button>
      </div>

      <div className="carousel-3d">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-surface-400 text-sm">
            Loading featured cards…
          </div>
        ) : cards.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-surface-400 text-sm">
            Couldn't load featured cards. Try shuffling.
          </div>
        ) : (
          <>
            <button onClick={prev} disabled={center === 0} className="carousel-3d-arrow left" aria-label="Previous card">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button onClick={next} disabled={center === cards.length - 1} className="carousel-3d-arrow right" aria-label="Next card">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            <div className="carousel-3d-reflection" />
            <div className="carousel-3d-stage">
              {cards.map((card, i) => {
                const offset = i - center
                const abs = Math.abs(offset)
                if (abs > 4) return null
                const translateX = offset * 145
                const rotateY = -offset * 38
                const translateZ = -abs * 80
                const scale = Math.max(0.55, 1 - abs * 0.1)
                const opacity = abs > 3 ? 0 : 1 - abs * 0.22
                return (
                  <div
                    key={card.id}
                    onClick={() => setCenter(i)}
                    className={`carousel-3d-card ${i === center ? 'is-center' : ''}`}
                    style={{
                      transform: `translate3d(${translateX}px, 0, ${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
                      opacity,
                      zIndex: 100 - abs
                    }}
                  >
                    {card.image_url ? (
                      <img src={card.image_url} alt={card.name} loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-surface-400 text-xs">
                        No image
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {centerCard && (
        <div className="mt-2 flex items-center justify-between gap-3 px-1">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-surface-900 truncate">{centerCard.name}</div>
            <div className="text-[11px] text-surface-500 truncate">
              {centerCard.set_name}
              {centerCard.card_number ? ` · ${centerCard.card_number}` : ''}
              {centerCard.rarity ? ` · ${centerCard.rarity}` : ''}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="text-sm font-semibold text-surface-900 tabular-nums">{formatUSD(centerCard.market_price)}</div>
            <button
              onClick={() => onWatchCard(centerCard)}
              disabled={isWatched}
              className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-md transition-colors ${
                isWatched ? 'bg-brand-100 text-brand-700 cursor-default' : 'bg-surface-100 text-surface-700 hover:bg-surface-200'
              }`}
              title={isWatched ? 'On your watchlist' : 'Add to watchlist'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill={isWatched ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
              {isWatched ? 'Watching' : 'Watch'}
            </button>
            <button
              onClick={() => onAddToPortfolioFromCard(centerCard, centerNM?.id ?? null, 'Raw')}
              className="btn-primary !py-1.5 !px-2.5 text-[11px] flex items-center gap-1.5"
              title="Add to portfolio"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14" /><path d="M5 12h14" />
              </svg>
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Watchlist View ─────────────────────────────────────────────────────────

interface WatchlistViewProps {
  items: WatchlistItem[]
  onRemove: (id: string) => void
  onRefresh: () => Promise<void>
}

function WatchlistView({ items, onRemove, onRefresh }: WatchlistViewProps) {
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setIsRefreshing(false)
    }
  }, [onRefresh])

  const totals = useMemo(() => {
    const baseline = items.reduce((s, i) => s + i.baseline_price, 0)
    const current = items.reduce((s, i) => s + i.last_price, 0)
    const swing = current - baseline
    const swingPct = baseline > 0 ? (swing / baseline) * 100 : 0
    return { baseline, current, swing, swingPct }
  }, [items])

  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
        <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-surface-500">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-surface-900">Your watchlist is empty</h2>
        <p className="text-sm text-surface-500 mt-1 max-w-md">
          Switch to <span className="font-semibold text-surface-700">Browse Market</span> to find cards or sealed products and add them to your watchlist.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 animate-fade-in">
      {/* Summary strip */}
      <div className="glass-card-subtle p-4 mb-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-6 min-w-0 flex-wrap">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">Items</div>
            <div className="text-lg font-bold text-surface-900 tabular-nums">{items.length}</div>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">Total Market</div>
            <div className="text-lg font-bold text-surface-900 tabular-nums">{formatUSD(totals.current)}</div>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">Since Added</div>
            <div className={`text-lg font-bold tabular-nums ${totals.swing >= 0 ? 'text-gain' : 'text-loss'}`}>
              {totals.swing >= 0 ? '+' : ''}{formatUSD(totals.swing)} · {formatPct(totals.swingPct)}
            </div>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="btn-ghost flex items-center gap-2 text-xs disabled:opacity-50"
          title="Refresh watchlist prices"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isRefreshing ? 'animate-spin' : ''}>
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M16 16h5v5" />
          </svg>
          {isRefreshing ? 'Syncing…' : 'Refresh Prices'}
        </button>
      </div>

      {/* List */}
      <div className="glass-card overflow-hidden">
        <div className="grid grid-cols-[60px_1fr_120px_140px_40px] gap-3 px-4 py-2.5 border-b border-surface-200 bg-surface-50 text-[10px] font-semibold uppercase tracking-wider text-surface-500">
          <div></div>
          <div>Name</div>
          <div className="text-right">Market Price</div>
          <div className="text-right">Since Added</div>
          <div></div>
        </div>
        <ul className="divide-y divide-surface-100">
          {items.map(item => {
            const swing = item.last_price - item.baseline_price
            const swingPct = item.baseline_price > 0 ? (swing / item.baseline_price) * 100 : 0
            const isGain = swing >= 0
            return (
              <li key={item.id} className="grid grid-cols-[60px_1fr_120px_140px_40px] gap-3 px-4 py-3 items-center hover:bg-surface-50 transition-colors">
                <div className="w-12 h-16 rounded-md overflow-hidden bg-surface-100 flex items-center justify-center">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-full h-full object-contain" loading="lazy" />
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-surface-400">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    </svg>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0 ${
                      item.type === 'sealed' ? 'bg-blue-100 text-blue-700' : 'bg-surface-100 text-surface-600'
                    }`}>
                      {item.type === 'sealed' ? (item.rarity || 'Sealed') : 'Card'}
                    </span>
                  </div>
                  <div className="text-sm font-medium text-surface-900 truncate">{item.name}</div>
                  <div className="text-[11px] text-surface-500 truncate">
                    {item.set_name}
                    {item.type === 'card' && item.card_number && ` · ${item.card_number}`}
                  </div>
                </div>
                <div className="text-right tabular-nums">
                  <div className="text-sm font-semibold text-surface-900">{formatUSD(item.last_price)}</div>
                  <div className="text-[10px] text-surface-400">added @ {formatUSD(item.baseline_price)}</div>
                </div>
                <div className="text-right tabular-nums">
                  <div className={`text-sm font-semibold ${isGain ? 'text-gain' : 'text-loss'}`}>
                    {isGain ? '+' : ''}{formatUSD(swing)}
                  </div>
                  <div className={`text-[11px] ${isGain ? 'text-gain' : 'text-loss'} opacity-80`}>{formatPct(swingPct)}</div>
                </div>
                <button
                  onClick={() => onRemove(item.id)}
                  className="w-8 h-8 rounded-md flex items-center justify-center text-surface-400 hover:text-loss hover:bg-loss/10 transition-colors"
                  title="Remove from watchlist"
                  aria-label="Remove from watchlist"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                  </svg>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

// ─── Browse View ────────────────────────────────────────────────────────────

interface BrowseViewProps {
  watchlistIds: Set<string>
  onAddToWatchlist: (item: WatchlistItem) => void
  onAddToPortfolioFromCard: MarketPageProps['onAddToPortfolioFromCard']
  onAddToPortfolioFromSealed: MarketPageProps['onAddToPortfolioFromSealed']
}

function BrowseView({ watchlistIds, onAddToWatchlist, onAddToPortfolioFromCard, onAddToPortfolioFromSealed }: BrowseViewProps) {
  const [mode, setMode] = useState<'cards' | 'sealed'>('cards')
  const [query, setQuery] = useState('')
  const [cardResults, setCardResults] = useState<SearchCard[]>([])
  const [sealedResults, setSealedResults] = useState<SealedProduct[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!query.trim()) {
      setCardResults([])
      setSealedResults([])
      setError(null)
      return
    }
    setIsSearching(true)
    setError(null)
    const timer = setTimeout(async () => {
      try {
        if (mode === 'cards') {
          const res = await window.electronAPI.justtcg.search(query)
          if (res.error) {
            setError(res.error)
            setCardResults([])
          } else {
            const cardsOnly = (res.data as any[]).filter(raw => !isSealedResult(raw))
            setCardResults(cardsOnly.map(mapJustTCGCard))
          }
        } else {
          const res = await window.electronAPI.justtcg.searchSealed(query)
          if (res.error) {
            setError(res.error)
            setSealedResults([])
          } else {
            setSealedResults((res.data as any[]).map(mapSealedProduct))
          }
        }
      } catch (err: any) {
        setError(err?.message ?? 'Search failed')
        setCardResults([])
        setSealedResults([])
      } finally {
        setIsSearching(false)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [query, mode])

  const handleWatchCard = useCallback((card: SearchCard) => {
    const nm = pickNMVariant(card.variants ?? [])
    const id = `card:${card.id}:${nm?.id ?? 'nm'}`
    const now = new Date().toISOString()
    const price = nm?.price ?? card.market_price
    onAddToWatchlist({
      id,
      type: 'card',
      card_id: card.id,
      variant_id: nm?.id ?? null,
      name: card.name,
      set_name: card.set_name,
      set_id: card.set_id,
      card_number: card.card_number,
      rarity: card.rarity,
      image_url: card.image_url,
      baseline_price: price,
      baseline_added_at: now,
      last_price: price,
      last_updated: now,
    })
  }, [onAddToWatchlist])

  const handleWatchSealed = useCallback((product: SealedProduct) => {
    const id = `sealed:${product.id}`
    const now = new Date().toISOString()
    onAddToWatchlist({
      id,
      type: 'sealed',
      card_id: product.id,
      variant_id: product.variant_id ?? null,
      name: product.name,
      set_name: product.set_name,
      set_id: product.set_id,
      card_number: '',
      rarity: product.product_type,
      image_url: product.image_url,
      baseline_price: product.market_price,
      baseline_added_at: now,
      last_price: product.market_price,
      last_updated: now,
      pack_count: product.pack_count,
    })
  }, [onAddToWatchlist])

  return (
    <div className="flex-1 flex flex-col min-h-0 animate-fade-in">
      {/* Search controls */}
      <div className="px-6 py-3 border-b border-surface-100">
        <div className="flex items-center gap-3 mb-2">
          <div className="inline-flex bg-surface-100 rounded-lg p-0.5">
            {(['cards', 'sealed'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setQuery(''); setCardResults([]); setSealedResults([]) }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  mode === m
                    ? 'bg-white text-surface-900 shadow-sm-soft'
                    : 'text-surface-500 hover:text-surface-700'
                }`}
              >
                {m === 'cards' ? 'Single Cards' : 'Sealed Products'}
              </button>
            ))}
          </div>
        </div>
        <div className="relative">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            placeholder={mode === 'cards' ? 'Search cards, e.g. Charizard ex…' : 'Search ETBs, booster boxes, bundles…'}
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="input-dark !pl-10"
          />
        </div>
        {query.trim() && (
          <p className="text-[11px] text-surface-400 mt-1.5 px-1">
            {isSearching
              ? 'Searching…'
              : `${mode === 'cards' ? cardResults.length : sealedResults.length} result${(mode === 'cards' ? cardResults.length : sealedResults.length) !== 1 ? 's' : ''}`}
            {error && <span className="text-loss ml-1">— {error}</span>}
          </p>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {!query.trim() ? (
          mode === 'cards' ? (
            <FeaturedCarousel
              watchlistIds={watchlistIds}
              onWatchCard={handleWatchCard}
              onAddToPortfolioFromCard={onAddToPortfolioFromCard}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-surface-400 px-6">
              <svg className="mb-3 opacity-40" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <p className="text-sm">Type to search sealed products</p>
              <p className="text-[11px] mt-1">ETBs, booster boxes, bundles, premium collections</p>
            </div>
          )
        ) : mode === 'cards' ? (
          <div className="px-6 py-3"><div className="space-y-1">{/* search results below */}</div></div>
        ) : (
          <div className="px-6 py-3">{/* search results below */}</div>
        )}
        {query.trim() && mode === 'cards' ? (
          <div className="space-y-1">
            {cardResults.map(card => {
              const nm = pickNMVariant(card.variants ?? [])
              const watchId = `card:${card.id}:${nm?.id ?? 'nm'}`
              const isWatched = watchlistIds.has(watchId)
              return (
                <div key={card.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-surface-50 border border-transparent hover:border-surface-200 transition-all duration-200 group">
                  <div className="w-10 h-14 rounded-md overflow-hidden flex-shrink-0 bg-surface-200">
                    {card.image_url && <img src={card.image_url} alt={card.name} className="w-full h-full object-contain" loading="lazy" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-surface-900 truncate">{card.name}</div>
                    <div className="text-[11px] text-surface-500 truncate">{card.set_name} · {card.card_number} · {card.rarity}</div>
                  </div>
                  <div className="text-sm font-medium text-surface-900 tabular-nums w-20 text-right">{formatUSD(card.market_price)}</div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => handleWatchCard(card)}
                      disabled={isWatched}
                      className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-md transition-colors ${
                        isWatched
                          ? 'bg-brand-100 text-brand-700 cursor-default'
                          : 'bg-surface-100 text-surface-700 hover:bg-surface-200'
                      }`}
                      title={isWatched ? 'On your watchlist' : 'Add to watchlist'}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill={isWatched ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                      </svg>
                      {isWatched ? 'Watching' : 'Watch'}
                    </button>
                    <button
                      onClick={() => onAddToPortfolioFromCard(card, nm?.id ?? null, 'Raw')}
                      className="btn-primary !py-1.5 !px-2.5 text-[11px] flex items-center gap-1.5"
                      title="Add to portfolio"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 5v14" /><path d="M5 12h14" />
                      </svg>
                      Add
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="space-y-1">
            {sealedResults.map(product => {
              const watchId = `sealed:${product.id}`
              const isWatched = watchlistIds.has(watchId)
              return (
                <div key={product.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-surface-50 border border-transparent hover:border-surface-200 transition-all duration-200 group">
                  <div className="w-10 h-14 rounded-md overflow-hidden flex-shrink-0 bg-surface-100 flex items-center justify-center">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} className="w-full h-full object-contain p-1" loading="lazy" />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-surface-400">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {product.product_type !== 'Other' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold flex-shrink-0">{product.product_type}</span>
                      )}
                    </div>
                    <div className="text-sm font-medium text-surface-900 truncate">{product.name}</div>
                    <div className="text-[11px] text-surface-500 truncate">{product.set_name}{product.pack_count ? ` · ${product.pack_count} packs` : ''}</div>
                  </div>
                  <div className="text-sm font-medium text-surface-900 tabular-nums w-20 text-right">{formatUSD(product.market_price)}</div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => handleWatchSealed(product)}
                      disabled={isWatched}
                      className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-md transition-colors ${
                        isWatched
                          ? 'bg-brand-100 text-brand-700 cursor-default'
                          : 'bg-surface-100 text-surface-700 hover:bg-surface-200'
                      }`}
                      title={isWatched ? 'On your watchlist' : 'Add to watchlist'}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill={isWatched ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                      </svg>
                      {isWatched ? 'Watching' : 'Watch'}
                    </button>
                    <button
                      onClick={() => onAddToPortfolioFromSealed(product)}
                      className="btn-primary !py-1.5 !px-2.5 text-[11px] flex items-center gap-1.5"
                      title="Add to portfolio"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 5v14" /><path d="M5 12h14" />
                      </svg>
                      Add
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main MarketPage ────────────────────────────────────────────────────────

export default function MarketPage({
  watchlist,
  onAddToWatchlist,
  onRemoveFromWatchlist,
  onRefreshWatchlist,
  onAddToPortfolioFromCard,
  onAddToPortfolioFromSealed
}: MarketPageProps) {
  const [tab, setTab] = useState<'watchlist' | 'browse'>('watchlist')
  const watchlistIds = useMemo(() => new Set(watchlist.map(w => w.id)), [watchlist])

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Tab bar */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2 border-b border-surface-200">
        <div className="flex items-center gap-1">
          {(['watchlist', 'browse'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                tab === t
                  ? 'bg-brand-100 text-brand-800'
                  : 'text-surface-500 hover:bg-surface-50 hover:text-surface-700'
              }`}
            >
              {t === 'watchlist' ? `Watchlist (${watchlist.length})` : 'Browse Market'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'watchlist' ? (
        <WatchlistView
          items={watchlist}
          onRemove={onRemoveFromWatchlist}
          onRefresh={onRefreshWatchlist}
        />
      ) : (
        <BrowseView
          watchlistIds={watchlistIds}
          onAddToWatchlist={onAddToWatchlist}
          onAddToPortfolioFromCard={onAddToPortfolioFromCard}
          onAddToPortfolioFromSealed={onAddToPortfolioFromSealed}
        />
      )}
    </div>
  )
}
