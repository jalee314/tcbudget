import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { InventoryCard } from '../types'

interface Props {
  parentItem: InventoryCard
  cards: InventoryCard[]
  onClose: () => void
  onViewAsList?: () => void
}

// Phases:
//  enter   — pack scales in from below
//  rip     — only the small top sliver of the pack tears off and flies away
//  extract — cards rise as a stack out of the open pack
//  spread  — cards fan out to their final positions (pack body fades)
//  settled — final state, cards interactive
type Phase = 'enter' | 'rip' | 'extract' | 'spread' | 'settled'

const PHASE_TIMINGS: Record<Exclude<Phase, 'enter'>, number> = {
  rip: 400,
  extract: 850,
  spread: 1350,
  settled: 2200
}

// Stable hash so each card's shine is consistent across renders but
// distinct from its neighbors. Drives duration/delay/angle.
function hashCardId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return Math.abs(h)
}

function shineParamsFor(id: string): { duration: number; delay: number; angle: number } {
  const h = hashCardId(id)
  return {
    // 7 – 10 s loop. With the sweep occupying 45% of the loop, the
    // visible streak takes ~3.2–4.5 s to traverse the card — a slow,
    // deliberate reflection rather than a quick flash.
    duration: 7 + ((h % 30) / 10),
    // Negative delay scatters the start times across the whole cycle so
    // no two cards gleam in sync.
    delay: -((h >> 5) % 100) / 10,
    // Subtle angle variation around the classic ~120° diagonal.
    angle: 108 + ((h >> 11) % 28)
  }
}

function isRare(rarity: string | undefined): boolean {
  if (!rarity) return false
  const r = rarity.toLowerCase()
  return (
    r.includes('rare') ||
    r.includes('holo') ||
    r.includes('ultra') ||
    r.includes('secret') ||
    r.includes('illustration') ||
    r.includes('hyper')
  )
}

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(val)
}

// Stable pseudo-color from the set name so each set's pack feels distinct.
function packAccentFor(setName: string): { hue: number } {
  let h = 0
  for (let i = 0; i < setName.length; i++) h = (h * 31 + setName.charCodeAt(i)) | 0
  return { hue: Math.abs(h) % 360 }
}

// ─── Booster pack image lookup (cached in localStorage) ─────────────────

const PACK_IMAGE_CACHE_KEY = 'booster_pack_images_v1'

function loadCachedPackImages(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PACK_IMAGE_CACHE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveCachedPackImage(setKey: string, url: string): void {
  try {
    const cache = loadCachedPackImages()
    cache[setKey] = url
    localStorage.setItem(PACK_IMAGE_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // ignore quota errors
  }
}

const NON_PACK_KEYWORDS = [
  'box', 'bundle', 'blister', 'elite trainer', 'etb',
  'build & battle', 'build and battle', 'premium collection',
  'case', 'display', 'tin', 'collection box', 'mini tin', 'binder'
]

function isSingleBoosterPack(name: string): boolean {
  const n = name.toLowerCase()
  if (!n.includes('booster') && !n.includes('pack')) return false
  for (const kw of NON_PACK_KEYWORDS) {
    if (n.includes(kw)) return false
  }
  return true
}

function tcgplayerImageUrl(tcgplayerId: string | null | undefined): string {
  if (!tcgplayerId) return ''
  return `https://product-images.tcgplayer.com/fit-in/600x800/${tcgplayerId}.jpg`
}

async function fetchBoosterPackImage(setName: string): Promise<string | null> {
  if (!setName) return null
  // electronAPI may not exist in dev (e.g. browser preview)
  const api = (window as any).electronAPI
  if (!api?.justtcg?.searchSealed) return null

  // Try a few queries — set + booster pack first (most specific), then just set
  const queries = [`${setName} booster pack`, setName]
  const seen = new Set<string>()
  for (const q of queries) {
    try {
      const result = await api.justtcg.searchSealed(q)
      if (result?.error || !result?.data) continue
      const candidates = (result.data as any[]).filter(raw => {
        const name = String(raw?.name ?? '')
        if (seen.has(name)) return false
        seen.add(name)
        return isSingleBoosterPack(name)
      })
      // Prefer one whose set name matches closely
      const lowerSet = setName.toLowerCase()
      const exact = candidates.find(raw => {
        const setN = String(raw?.set_name ?? raw?.set ?? '').toLowerCase()
        return setN === lowerSet
      })
      const partial = candidates.find(raw => {
        const setN = String(raw?.set_name ?? raw?.set ?? '').toLowerCase()
        return setN.includes(lowerSet) || lowerSet.includes(setN)
      })
      const match = exact ?? partial ?? candidates[0]
      if (match?.tcgplayerId) {
        return tcgplayerImageUrl(match.tcgplayerId)
      }
    } catch (err) {
      console.warn('[PackOpenAnimation] booster pack lookup failed:', err)
    }
  }
  return null
}

function preloadImage(url: string): Promise<boolean> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => resolve(true)
    img.onerror = () => resolve(false)
    img.src = url
  })
}

export default function PackOpenAnimation({ parentItem, cards, onClose, onViewAsList }: Props) {
  const setKey = parentItem.set_id || parentItem.set_name || parentItem.name
  const [phase, setPhase] = useState<Phase>('enter')
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  // Direction of the most recent navigation — drives the slide animation
  // on the hero card / detail panel when cycling via arrow keys.
  const [navDirection, setNavDirection] = useState<'left' | 'right' | null>(null)
  const [navTick, setNavTick] = useState(0) // bumps to force re-mount per navigation
  const navigateTo = (newIndex: number) => {
    if (newIndex < 0 || newIndex >= cards.length) return
    if (newIndex === selectedIndex) return // no-op — already showing this one
    if (selectedIndex !== null) {
      setNavDirection(newIndex > selectedIndex ? 'right' : 'left')
    } else {
      setNavDirection(null)
    }
    setNavTick(t => t + 1)
    setSelectedIndex(newIndex)
  }
  const [packImage, setPackImage] = useState<string | null>(() => {
    if (!setKey) return null
    return loadCachedPackImages()[setKey] ?? null
  })
  const [imageLookupDone, setImageLookupDone] = useState<boolean>(() => {
    if (!setKey) return true
    return !!loadCachedPackImages()[setKey]
  })
  const [showLoadingHint, setShowLoadingHint] = useState(false)

  // Look up the booster pack image for the set (cached in localStorage).
  useEffect(() => {
    if (packImage) return
    if (!setKey || !parentItem.set_name) {
      setImageLookupDone(true)
      return
    }
    let cancelled = false
    ;(async () => {
      const url = await fetchBoosterPackImage(parentItem.set_name)
      if (cancelled) return
      if (url) {
        const ok = await preloadImage(url)
        if (cancelled) return
        if (ok) {
          setPackImage(url)
          saveCachedPackImage(setKey, url)
        }
      }
      setImageLookupDone(true)
    })()
    return () => { cancelled = true }
  }, [setKey, parentItem.set_name, packImage])

  // Show a subtle loading hint if the lookup is taking a moment
  useEffect(() => {
    if (imageLookupDone) return
    const t = setTimeout(() => setShowLoadingHint(true), 700)
    return () => clearTimeout(t)
  }, [imageLookupDone])

  // Start the rip sequence ONLY once we know whether we have an image
  // (lookup finished — either we have the real image, or we're falling
  // back to the procedural pack). Nothing renders before this.
  const animationStarted = imageLookupDone

  useEffect(() => {
    if (!animationStarted) return
    const timers = [
      setTimeout(() => setPhase('rip'), PHASE_TIMINGS.rip),
      setTimeout(() => setPhase('extract'), PHASE_TIMINGS.extract),
      setTimeout(() => setPhase('spread'), PHASE_TIMINGS.spread),
      setTimeout(() => setPhase('settled'), PHASE_TIMINGS.settled)
    ]
    return () => timers.forEach(clearTimeout)
  }, [animationStarted])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedIndex !== null) setSelectedIndex(null)
        else onClose()
        return
      }
      if (selectedIndex !== null) {
        if (e.key === 'ArrowRight') {
          navigateTo(Math.min(cards.length - 1, selectedIndex + 1))
        } else if (e.key === 'ArrowLeft') {
          navigateTo(Math.max(0, selectedIndex - 1))
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, selectedIndex, cards.length])

  const skipToEnd = () => setPhase('settled')

  const useFan = cards.length <= 7
  const accent = useMemo(() => packAccentFor(parentItem.set_name || parentItem.name), [parentItem])

  const fanLayout = useMemo(() => {
    const N = cards.length
    if (N === 0) return []
    const totalSpread = Math.min(N * 14, 84)
    return cards.map((card, i) => {
      const angle = N === 1 ? 0 : (i - (N - 1) / 2) * (totalSpread / (N - 1))
      return { card, angle, index: i }
    })
  }, [cards])

  const isExtractedOrLater = phase === 'extract' || phase === 'spread' || phase === 'settled'
  const isSpreadOrLater = phase === 'spread' || phase === 'settled'
  const cardsClickable = phase === 'settled'

  // ─── Unified layout: every card uses the SAME DOM element across the
  // entry / spread / focus phases so that CSS transitions on `transform`
  // smoothly translate them between positions. ────────────────────────
  type LayoutMode = 'hidden' | 'extracted' | 'spread' | 'focused'
  const layoutMode: LayoutMode =
    phase === 'enter' || phase === 'rip'
      ? 'hidden'
      : phase === 'extract'
        ? 'extracted'
        : selectedIndex !== null
          ? 'focused'
          : 'spread'

  // Manual grid positioning so cards can transition to/from focused mode
  // (CSS Grid layout doesn't transition).
  const gridCols = useMemo(() => {
    const N = cards.length
    if (N <= 12) return 4
    if (N <= 20) return 5
    return 6
  }, [cards.length])
  const gridColWidth = 220
  const gridRowHeight = 308

  const getCardTransform = useCallback((i: number): { transform: string; opacity: number; zIndex: number; transformOrigin: string } => {
    const N = cards.length
    const stackOffset = (i - (N - 1) / 2) * 1.4

    if (layoutMode === 'hidden') {
      return {
        transform: 'translate(0, 0) scale(0.2)',
        opacity: 0,
        zIndex: 10 + i,
        transformOrigin: '50% 95%'
      }
    }

    if (layoutMode === 'extracted') {
      return {
        transform: `translate(${stackOffset}px, -300px) rotate(${stackOffset * 0.6}deg) scale(0.82)`,
        opacity: 1,
        zIndex: 10 + i,
        transformOrigin: '50% 95%'
      }
    }

    if (layoutMode === 'focused' && selectedIndex !== null) {
      if (i === selectedIndex) {
        // Hero — left half of screen, larger
        return {
          transform: 'translate(-26vw, -8vh) scale(1.5)',
          opacity: 1,
          zIndex: 200,
          transformOrigin: '50% 50%'
        }
      }
      // Thumbnail row at the bottom
      const M = N - 1
      const p = i < selectedIndex ? i : i - 1
      const spacing = Math.max(36, Math.min(110, 920 / Math.max(1, M)))
      const xOff = (p - (M - 1) / 2) * spacing
      return {
        transform: `translate(${xOff}px, 36vh) scale(0.42)`,
        opacity: 1,
        zIndex: 10 + (M - Math.abs(p - (M - 1) / 2)),
        transformOrigin: '50% 50%'
      }
    }

    // Spread — fan or grid
    if (useFan) {
      const item = fanLayout[i]
      const angle = item ? item.angle : 0
      return {
        transform: `rotate(${angle}deg) translateY(-20px)`,
        opacity: 1,
        zIndex: 10 + i,
        transformOrigin: '50% 95%'
      }
    }

    // Grid mode — manual positions
    const totalRows = Math.ceil(N / gridCols)
    const col = i % gridCols
    const row = Math.floor(i / gridCols)
    // Center the last row if it has fewer cards
    const isLastRow = row === totalRows - 1
    const lastRowCount = N - (totalRows - 1) * gridCols
    const colsInThisRow = isLastRow ? lastRowCount : gridCols
    const xOff = (col - (colsInThisRow - 1) / 2) * gridColWidth
    const yOff = (row - (totalRows - 1) / 2) * gridRowHeight
    return {
      transform: `translate(${xOff}px, ${yOff}px) scale(0.82)`,
      opacity: 1,
      zIndex: 10 + i,
      transformOrigin: '50% 50%'
    }
  }, [cards.length, layoutMode, selectedIndex, useFan, fanLayout, gridCols])

  const handleCardClick = (index: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!cardsClickable) return
    // No rect needed — the unified card layout handles the physical
    // movement via CSS transforms automatically.
    navigateTo(index)
  }

  // Backdrop click: if a card is focused, just clear the selection (back to
  // the fan / grid). Otherwise close the whole pack overlay.
  const handleBackdropClick = () => {
    if (selectedIndex !== null) {
      setSelectedIndex(null)
      setNavDirection(null)
    } else {
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center pack-open-bg animate-fade-in"
      onClick={handleBackdropClick}
    >
      {/* Top-right close + actions */}
      <div
        className="absolute top-4 right-4 flex items-center gap-2 z-30"
        onClick={(e) => e.stopPropagation()}
      >
        {phase !== 'settled' && (
          <button
            onClick={skipToEnd}
            className="px-3 py-1.5 text-xs font-semibold text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-md transition-colors backdrop-blur-sm"
          >
            Skip
          </button>
        )}
        {phase === 'settled' && onViewAsList && (
          <button
            onClick={onViewAsList}
            className="px-3 py-1.5 text-xs font-semibold text-white/90 hover:text-white bg-white/10 hover:bg-white/20 rounded-md transition-colors backdrop-blur-sm"
          >
            View as list
          </button>
        )}
        <button
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-full text-white/80 hover:text-white bg-white/10 hover:bg-white/20 transition-colors backdrop-blur-sm"
          title="Close (Esc)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Header label */}
      <div
        className="absolute top-6 left-1/2 -translate-x-1/2 text-center pointer-events-none z-20"
        style={{
          opacity: phase === 'settled' ? 1 : 0,
          transform: `translateX(-50%) translateY(${phase === 'settled' ? '0' : '-8px'})`,
          transition: 'opacity 400ms ease-out, transform 400ms ease-out'
        }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">Pulled from</p>
        <p className="text-base font-semibold text-white/90 mt-0.5">{parentItem.name}</p>
        {phase === 'settled' && cards.length > 0 && (
          <p className="text-[11px] text-white/40 mt-1">Click a card to inspect</p>
        )}
      </div>

      {/* Loading hint — shown only while the booster pack image lookup is in flight */}
      {!animationStarted && showLoadingHint && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex items-center gap-2 text-white/50 text-xs">
            <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white/80 animate-spin" />
            <span>Locating pack…</span>
          </div>
        </div>
      )}

      {/* Pack visual — center stage. Not rendered until image lookup completes. */}
      <div className="relative w-full h-full flex items-center justify-center pointer-events-none">
        {animationStarted && (
          <>
            <div
              className={`pack-wrap ${phase === 'enter' ? 'pack-enter' : ''} ${phase === 'rip' ? 'pack-shake' : ''} ${isSpreadOrLater ? 'pack-drop' : ''}`}
              style={{
                ['--pack-hue' as string]: `${accent.hue}deg`
              } as React.CSSProperties}
            >
              {/* glow halo */}
              <div className="pack-glow" />

              {/* Booster pack — body stays put; only the top sliver tears off */}
              <div className="pack-frame">
                {/* Body — bottom ~88% of the pack, stays in place after the rip */}
                <div className="pack-half pack-bottom">
                  {packImage ? (
                    <img src={packImage} alt="" className="pack-art-image" draggable={false} />
                  ) : (
                    <PackArt setName={parentItem.set_name || parentItem.name} />
                  )}
                  {/* dark "opening" inside the pack, visible after the lid tears off */}
                  <div
                    className="pack-opening"
                    style={{
                      opacity: phase === 'rip' || isExtractedOrLater ? 1 : 0,
                      transition: 'opacity 250ms ease-out'
                    }}
                  />
                </div>
                {/* Lid — small top sliver that tears off */}
                <div className={`pack-half pack-top ${phase === 'rip' || isExtractedOrLater ? 'pack-top-rip' : ''}`}>
                  {packImage ? (
                    <img src={packImage} alt="" className="pack-art-image" draggable={false} />
                  ) : (
                    <PackArt setName={parentItem.set_name || parentItem.name} />
                  )}
                </div>
                {/* tear glow line */}
                <div
                  className="pack-rip-line"
                  style={{
                    opacity: phase === 'rip' ? 1 : 0,
                    transition: 'opacity 200ms ease-out'
                  }}
                />
              </div>
            </div>

            {/* Subtle flash at the moment of tearing */}
            <div
              className="pack-flash"
              style={{
                opacity: phase === 'rip' ? 0.8 : 0,
                transition: phase === 'rip' ? 'opacity 200ms ease-out' : 'opacity 500ms ease-out'
              }}
            />
          </>
        )}

        {/* Unified card layout — same DOM elements transition between
            extracted → spread → focused positions for a true "physical
            movement" feel. */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-0 h-0">
            {cards.map((card, i) => {
              const rare = isRare(card.rarity)
              const t = getCardTransform(i)
              const isHero = layoutMode === 'focused' && i === selectedIndex
              const enterDelay = layoutMode === 'extracted' ? 60 + i * 55 : 0
              return (
                <button
                  key={card.id}
                  onClick={(e) => handleCardClick(i, e)}
                  className="pulled-card-unified"
                  style={{
                    position: 'absolute',
                    width: 210,
                    height: 294,
                    marginLeft: -105,
                    marginTop: -147,
                    transformOrigin: t.transformOrigin,
                    transform: t.transform,
                    opacity: t.opacity,
                    zIndex: t.zIndex,
                    transition: `transform 600ms cubic-bezier(0.22, 1, 0.36, 1) ${enterDelay}ms, opacity 400ms ease-out ${enterDelay}ms`,
                    pointerEvents: cardsClickable ? 'auto' : 'none',
                    cursor: cardsClickable ? 'pointer' : 'default',
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    borderRadius: 12
                  }}
                  title={card.name}
                >
                  <PulledCard card={card} rare={rare} interactive={cardsClickable && !isHero} />
                </button>
              )
            })}
          </div>
        </div>

        {/* Empty state */}
        {cards.length === 0 && phase === 'settled' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-white/70">
              <p className="text-lg font-semibold mb-2">No cards linked yet</p>
              <p className="text-sm text-white/50">Open a card and set its "pulled from" to this pack to see it here.</p>
            </div>
          </div>
        )}
      </div>

      {/* Info panel — pops in on the right after the cards have settled
          into the focused layout. */}
      {layoutMode === 'focused' && cards[selectedIndex!] && (
        <InfoPanel
          card={cards[selectedIndex!]}
          index={selectedIndex!}
          total={cards.length}
          navTick={navTick}
          navDirection={navDirection}
          onClose={() => setSelectedIndex(null)}
        />
      )}
    </div>
  )
}

// ─── Info panel (right side, appears after cards finish moving) ──────────

function InfoPanel({
  card,
  index,
  total,
  navTick,
  navDirection,
  onClose
}: {
  card: InventoryCard
  index: number
  total: number
  navTick: number
  navDirection: 'left' | 'right' | null
  onClose: () => void
}) {
  const [visible, setVisible] = useState(false)
  // Buffer the displayed card / index so the panel keeps showing the
  // PREVIOUS card while it fades out, then swaps to the new card only
  // once the cards have finished sliding. Without this, the user would
  // briefly see the new card's text flash before the cards arrive.
  const [displayCard, setDisplayCard] = useState(card)
  const [displayIndex, setDisplayIndex] = useState(index)

  useEffect(() => {
    setVisible(false)
    const t = setTimeout(() => {
      setDisplayCard(card)
      setDisplayIndex(index)
      setVisible(true)
    }, 540)
    return () => clearTimeout(t)
    // navTick is the canonical "user navigated" signal — runs once per nav
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navTick])

  const shown = displayCard
  const shownIndex = displayIndex
  const rare = isRare(shown.rarity)
  const totalCost = shown.purchase_price * shown.quantity
  const totalMarket = shown.market_price * shown.quantity
  const gl = totalMarket - totalCost
  const glPct = totalCost > 0 ? (gl / totalCost) * 100 : null

  // Slight horizontal offset matches the navigation direction so the info
  // appears to drift in from the side the user just pressed.
  const slideFrom =
    navDirection === 'right' ? 24 : navDirection === 'left' ? -24 : 0

  return (
    <div
      className="absolute top-0 right-0 bottom-0 z-30 flex items-center justify-center p-6 md:p-10 pointer-events-none"
      style={{ width: '50%' }}
    >
      <div
        className={`text-white max-w-md w-full pointer-events-auto info-panel-reveal ${visible ? 'is-visible' : ''}`}
        key={`info-${shown.id}-${navTick}`}
        style={{
          ['--info-slide-from' as string]: `${slideFrom}px`
        } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-white/50 uppercase tracking-wider font-semibold">{shown.set_name}</p>
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
            {shownIndex + 1} / {total}
          </span>
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-white leading-tight">{shown.name}</h2>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          {shown.card_number && (
            <span className="text-[11px] px-2 py-0.5 rounded bg-white/10 text-white/80 font-mono">#{shown.card_number}</span>
          )}
          {shown.rarity && (
            <span className={`text-[11px] px-2 py-0.5 rounded font-semibold ${rare ? 'bg-yellow-500/20 text-yellow-200' : 'bg-white/10 text-white/80'}`}>
              {shown.rarity}
            </span>
          )}
          {shown.condition && (
            <span className="text-[11px] px-2 py-0.5 rounded bg-white/10 text-white/80">{shown.condition}</span>
          )}
          {shown.quantity > 1 && (
            <span className="text-[11px] px-2 py-0.5 rounded bg-white/10 text-white/80">×{shown.quantity}</span>
          )}
          {shown.is_sold ? (
            <span className="text-[11px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 font-semibold">Sold</span>
          ) : null}
        </div>

        <div className="mt-5 rounded-xl p-4 bg-white/5 border border-white/10">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Market Price</div>
          <div className="text-3xl font-bold font-mono text-white mt-1">{formatCurrency(shown.market_price)}</div>
          {shown.quantity > 1 && (
            <div className="text-xs text-white/50 mt-1 font-mono">
              Total value · {formatCurrency(totalMarket)}
            </div>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <DetailStat label="Unit Cost" value={formatCurrency(shown.purchase_price)} />
          <DetailStat label="Cost Basis" value={formatCurrency(totalCost)} subtle={shown.quantity === 1} />
        </div>

        {!shown.is_sold && (
          <div className="mt-3 rounded-xl p-4 bg-white/5 border border-white/10">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Unrealized G/L</div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className={`text-2xl font-bold font-mono ${gl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {gl >= 0 ? '+' : ''}{formatCurrency(gl)}
              </span>
              {glPct !== null && (
                <span className={`text-sm font-mono ${gl >= 0 ? 'text-emerald-300/80' : 'text-rose-300/80'}`}>
                  {gl >= 0 ? '+' : ''}{glPct.toFixed(2)}%
                </span>
              )}
            </div>
          </div>
        )}

        {(shown.purchase_date || shown.notes) && (
          <div className="mt-3 space-y-1">
            {shown.purchase_date && (
              <p className="text-[11px] text-white/40">Purchased {shown.purchase_date}</p>
            )}
            {shown.notes && (
              <p className="text-xs text-white/60 italic">"{shown.notes}"</p>
            )}
          </div>
        )}

        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); onClose() }}
            className="px-3 py-1.5 text-xs font-semibold text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-md transition-colors"
          >
            Back to fan
          </button>
          <span className="text-[11px] text-white/30">← → keys · Esc to close</span>
        </div>
      </div>
    </div>
  )
}

// ─── Procedural booster pack art ──────────────────────────────────────────

function PackArt({ setName }: { setName: string }) {
  return (
    <div className="pack-art">
      {/* metallic foil top */}
      <div className="pack-foil" />
      {/* shimmer overlay */}
      <div className="pack-foil-shimmer" />
      {/* body */}
      <div className="pack-body">
        <div className="pack-pokemon-mark">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20" />
            <circle cx="12" cy="12" r="3" fill="currentColor" />
          </svg>
        </div>
        <p className="pack-pokemon-text">POKÉMON</p>
        <div className="pack-divider" />
        <p className="pack-set-name-text" title={setName}>{setName}</p>
        <div className="pack-divider" />
        <p className="pack-booster-text">BOOSTER PACK</p>
        {/* faint sparkle accent */}
        <div className="pack-sparkle pack-sparkle-1" />
        <div className="pack-sparkle pack-sparkle-2" />
      </div>
    </div>
  )
}

// ─── Pulled card thumbnail ────────────────────────────────────────────────

function PulledCard({ card, rare, interactive }: { card: InventoryCard; rare: boolean; interactive: boolean }) {
  return (
    <div
      data-card-visual
      className={`relative w-full h-full rounded-lg overflow-hidden shadow-2xl bg-surface-800 ring-1 ring-white/10 ${rare ? 'pulled-card-rare' : ''} ${interactive ? 'pulled-card-interactive' : ''}`}
      style={{ aspectRatio: '5 / 7' }}
    >
      {card.image_url ? (
        <img
          src={card.image_url}
          alt={card.name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-white/30 text-xs px-2 text-center">
          {card.name}
        </div>
      )}
      {rare && (
        <div
          className="pulled-card-shine pointer-events-none"
          style={(() => {
            const p = shineParamsFor(card.id)
            return {
              ['--shine-duration' as string]: `${p.duration}s`,
              ['--shine-delay' as string]: `${p.delay}s`,
              ['--shine-angle' as string]: `${p.angle}deg`
            } as React.CSSProperties
          })()}
        />
      )}
      <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/85 via-black/50 to-transparent">
        <p className="text-[10px] font-semibold text-white truncate leading-tight">{card.name}</p>
        <p className="text-[10px] text-white/70 font-mono leading-tight">{formatCurrency(card.market_price)}</p>
      </div>
    </div>
  )
}

function DetailStat({ label, value, subtle }: { label: string; value: string; subtle?: boolean }) {
  return (
    <div className={`rounded-lg p-3 bg-white/5 border border-white/10 ${subtle ? 'opacity-70' : ''}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-white/50">{label}</div>
      <div className="text-base font-bold font-mono text-white mt-1">{value}</div>
    </div>
  )
}
