import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { InventoryCard } from '../types'
import { loadMutePref, saveMutePref, playPackTear, playCardFlip, playRareDing, playBestPullChime, playRevealAll } from '../utils/packSounds'
import { CardImage } from '../utils/cardImage'
import pokemonCardBackUrl from '../assets/pokemon_card_back.jpg'

const REVEAL_MODE_KEY = 'pack_open_reveal_mode_v1'
type RevealMode = 'all' | 'one'
function loadRevealMode(): RevealMode {
  try {
    // Default to "one at a time" — that's the more engaging flow.
    return localStorage.getItem(REVEAL_MODE_KEY) === 'all' ? 'all' : 'one'
  } catch {
    return 'one'
  }
}
function saveRevealMode(mode: RevealMode): void {
  try { localStorage.setItem(REVEAL_MODE_KEY, mode) } catch { /* ignore */ }
}

const RIP_MODE_KEY = 'pack_open_rip_mode_v1'
type RipMode = 'auto' | 'manual'
function loadRipMode(): RipMode {
  try {
    return localStorage.getItem(RIP_MODE_KEY) === 'auto' ? 'auto' : 'manual'
  } catch {
    return 'manual'
  }
}
function saveRipMode(mode: RipMode): void {
  try { localStorage.setItem(RIP_MODE_KEY, mode) } catch { /* ignore */ }
}
// How far the user must pull the lid (diagonally up-left, in px) before
// the rip completes. Combined magnitude of the drag vector.
const RIP_THRESHOLD_PX = 110

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
  // Lid finishes its 850ms tear at ~1250ms; give it a small breathing
  // room then drop the pack body away so the cards appear to be drawn
  // out of the now-empty pack.
  extract: 1300,
  spread: 1700,
  settled: 2500
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

// Anything containing one of these is NOT the booster pack we want to show.
// Includes obvious non-packs (box/bundle/etb) AND look-alikes that often ride
// along with a pack listing — art cards, code cards, sleeves — which would
// otherwise pass a naive "name contains booster" check.
const NON_PACK_KEYWORDS = [
  'box', 'bundle', 'blister', 'elite trainer', 'etb',
  'build & battle', 'build and battle', 'premium collection',
  'case', 'display', 'tin', 'collection box', 'mini tin', 'binder',
  'art card', 'code card', 'promo card', 'sleeve', 'damage counter',
  'coin', 'energy pack', 'theme deck', 'starter deck', 'deck box',
  'playmat', 'pin', 'figure', 'plush', 'token'
]

function isSingleBoosterPack(name: string): boolean {
  const n = name.toLowerCase()
  // Must mention booster (the word "pack" alone is too loose — "art pack",
  // "energy pack" etc. would slip through).
  if (!/\bbooster\b/.test(n)) return false
  for (const kw of NON_PACK_KEYWORDS) {
    if (n.includes(kw)) return false
  }
  return true
}

// Higher score = more likely to be the canonical booster pack for this set.
function scoreBoosterPackCandidate(raw: any, setName: string): number {
  const n = String(raw?.name ?? '').toLowerCase()
  const setN = String(raw?.set_name ?? raw?.set ?? '').toLowerCase()
  const s = setName.toLowerCase()

  let score = 0
  // Strong: name contains the exact "booster pack" phrase
  if (n.includes('booster pack')) score += 100
  else if (/\bbooster\b/.test(n)) score += 40

  // Set match
  if (setN === s) score += 60
  else if (setN.includes(s) || s.includes(setN)) score += 30
  if (n.includes(s)) score += 25

  // Penalty for noise tokens that sometimes leak through (variants, special
  // editions etc.) — we want the plain "Set Booster Pack", not a re-cut.
  if (/\b(jumbo|stamped|reverse|special|preview|prerelease)\b/.test(n)) score -= 15

  return score
}

function tcgplayerImageUrl(tcgplayerId: string | null | undefined): string {
  if (!tcgplayerId) return ''
  return `https://product-images.tcgplayer.com/fit-in/600x800/${tcgplayerId}.jpg`
}

async function fetchBoosterPackImage(setName: string): Promise<string | null> {
  if (!setName) return null
  const api = (window as any).electronAPI
  if (!api?.justtcg?.searchSealed) return null

  // Aggregate candidates from a specific query and a broad fallback,
  // de-duplicated by tcgplayerId, then pick the highest-scoring single pack.
  const queries = [`${setName} booster pack`, setName]
  const candidates: any[] = []
  const seenIds = new Set<string>()

  for (const q of queries) {
    try {
      const result = await api.justtcg.searchSealed(q)
      if (result?.error || !result?.data) continue
      for (const raw of result.data as any[]) {
        const id = String(raw?.tcgplayerId ?? raw?.id ?? '')
        if (!id || seenIds.has(id)) continue
        if (!isSingleBoosterPack(String(raw?.name ?? ''))) continue
        seenIds.add(id)
        candidates.push(raw)
      }
    } catch (err) {
      console.warn('[PackOpenAnimation] booster pack lookup failed:', err)
    }
  }

  if (candidates.length === 0) return null

  let best: any = null
  let bestScore = -Infinity
  for (const raw of candidates) {
    const score = scoreBoosterPackCandidate(raw, setName)
    if (score > bestScore) {
      bestScore = score
      best = raw
    }
  }

  return best?.tcgplayerId ? tcgplayerImageUrl(best.tcgplayerId) : null
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
  const [muted, setMuted] = useState<boolean>(() => loadMutePref())
  const toggleMute = useCallback(() => {
    setMuted(m => {
      const next = !m
      saveMutePref(next)
      return next
    })
  }, [])
  const [revealMode, setRevealMode] = useState<RevealMode>(() => loadRevealMode())
  const toggleRevealMode = useCallback(() => {
    setRevealMode(m => {
      const next = m === 'one' ? 'all' : 'one'
      saveRevealMode(next)
      return next
    })
  }, [])
  const [ripMode, setRipMode] = useState<RipMode>(() => loadRipMode())
  const toggleRipMode = useCallback(() => {
    setRipMode(m => {
      const next = m === 'auto' ? 'manual' : 'auto'
      saveRipMode(next)
      return next
    })
  }, [])
  // Manual-rip drag state. Tear is anchored at the top-right corner and the
  // user drags up-left. dragX/dragY are negative when going up/left; we
  // clamp positive (downward / rightward) drags to 0 so the lid only peels
  // one way. isFlying flips on once threshold is met — the lid then
  // animates offscreen via inline style and the rest of the phase sequence
  // fires.
  const [dragX, setDragX] = useState(0)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [isFlying, setIsFlying] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  // In reveal-one mode, tracks which cards have been flipped face-up.
  // (In reveal-all mode this set is ignored — every card is treated as flipped.)
  const [flippedCardIds, setFlippedCardIds] = useState<Set<string>>(new Set())

  // ─── Pull summary stats (cost, pull value, net) ──────────────────────────
  const pullSummary = useMemo(() => {
    const pullValue = cards.reduce((s, c) => s + c.market_price * c.quantity, 0)
    const cost = parentItem.purchase_price * parentItem.quantity
    const net = pullValue - cost
    const pct = cost > 0 ? (net / cost) * 100 : null
    return { cost, pullValue, net, pct, packs: parentItem.quantity }
  }, [cards, parentItem.purchase_price, parentItem.quantity])

  // ─── Best pull — the single most valuable card in the pull ──────────────
  const bestPullId = useMemo(() => {
    if (cards.length === 0) return null
    let best = cards[0]
    for (const c of cards) {
      if (c.market_price > best.market_price) best = c
    }
    // Only celebrate "best pull" if there's a meaningful winner — multiple
    // cards tied at the same low value shouldn't get a glow.
    return best.market_price > 0 ? best.id : null
  }, [cards])
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

  // Recolor the native window title bar so the min/maximize/close buttons
  // sit on a dark background that matches the pack overlay. Restored to
  // the app's default light scheme on unmount.
  // NOTE: requires an Electron restart for the preload IPC to register
  // the first time — hot reload only updates the renderer.
  useEffect(() => {
    const api = (window as any).electronAPI
    if (!api?.window?.setTitleBarOverlay) {
      console.warn('[PackOpenAnimation] electronAPI.window.setTitleBarOverlay not available — restart the Electron dev process so the new preload script loads.')
      return
    }
    api.window
      .setTitleBarOverlay({ color: '#0b1322', symbolColor: '#E5E7EB' })
      .catch((err: unknown) => console.warn('[PackOpenAnimation] failed to recolor title bar:', err))
    return () => {
      api.window
        .setTitleBarOverlay({ color: '#F3F4F6', symbolColor: '#111827' })
        .catch(() => { /* ignore on unmount */ })
    }
  }, [])

  // Start the rip sequence ONLY once we know whether we have an image
  // (lookup finished — either we have the real image, or we're falling
  // back to the procedural pack). Nothing renders before this.
  const animationStarted = imageLookupDone

  // Fires the rip → extract → spread → settled chain. Used by the auto-rip
  // timer below AND by the manual-rip drag handler when the user pulls the
  // lid past the threshold. Captures the moment-of-rip as t=0 so timings
  // chain identically regardless of how the rip was triggered.
  const startPostRipSequence = useCallback(() => {
    setPhase(p => (p === 'enter' ? 'rip' : p))
    const ripToExtract = PHASE_TIMINGS.extract - PHASE_TIMINGS.rip
    const ripToSpread = PHASE_TIMINGS.spread - PHASE_TIMINGS.rip
    const ripToSettled = PHASE_TIMINGS.settled - PHASE_TIMINGS.rip
    setTimeout(() => setPhase('extract'), ripToExtract)
    setTimeout(() => setPhase('spread'), ripToSpread)
    setTimeout(() => setPhase('settled'), ripToSettled)
  }, [])

  useEffect(() => {
    if (!animationStarted) return
    if (ripMode === 'manual') return // wait for the user to pull the lid
    const ripTimer = setTimeout(startPostRipSequence, PHASE_TIMINGS.rip)
    return () => clearTimeout(ripTimer)
  }, [animationStarted, ripMode, startPostRipSequence])

  // ─── Manual rip — drag the lid's top-right corner up-left ────────────────
  const onLidMouseDown = useCallback((e: React.MouseEvent) => {
    if (ripMode !== 'manual') return
    if (phase !== 'enter' || isFlying) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    // Subtract current drag so re-grabbing a partially-pulled lid is smooth.
    dragStartRef.current = { x: e.clientX - dragX, y: e.clientY - dragY }
  }, [ripMode, phase, isFlying, dragX, dragY])

  useEffect(() => {
    if (!isDragging) return
    const onMove = (e: MouseEvent) => {
      // Clamp to the up-left quadrant — the rip only propagates one way.
      setDragX(Math.min(0, e.clientX - dragStartRef.current.x))
      setDragY(Math.min(0, e.clientY - dragStartRef.current.y))
    }
    const onUp = () => {
      setIsDragging(false)
      // Read latest values via state setters — closure is stale otherwise.
      let x = 0
      let y = 0
      setDragX(curr => { x = curr; return curr })
      setDragY(curr => { y = curr; return curr })
      // Defer threshold check to next tick so we have the latest x,y.
      queueMicrotask(() => {
        const mag = Math.hypot(x, y)
        if (mag >= RIP_THRESHOLD_PX && y <= -30) {
          setIsFlying(true)
          startPostRipSequence()
        } else {
          // Snap back smoothly.
          setDragX(0)
          setDragY(0)
        }
      })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isDragging, startPostRipSequence])

  // Drag progress (0 → 1) used to fade in the tear-line glow and shadow as
  // the user approaches the threshold.
  const ripProgress = ripMode === 'manual'
    ? Math.min(1, Math.hypot(dragX, dragY) / RIP_THRESHOLD_PX)
    : 0

  // Lid transform during manual drag. The pack lid is anchored at its
  // bottom-left (the tear hinge), so rotation peels the right corner up;
  // a fraction of the cursor's translation is also applied so the corner
  // visibly tracks the mouse. The rotation magnitude is capped so a wild
  // mouse fling doesn't spin the lid endlessly before the rip completes.
  const dragMag = Math.hypot(dragX, dragY)
  // CCW rotation when pulling up-left. Negative in CSS = counter-clockwise.
  const dragRotation = -Math.min(48, dragMag * 0.45)
  // Translate at ~40% of cursor delta — the lid feels heavy / resistant.
  const lidTranslateX = dragX * 0.4
  const lidTranslateY = dragY * 0.55

  // ─── Sound effects ────────────────────────────────────────────────────
  // Each phase transition fires its corresponding SFX. Refs guard against
  // re-firing if the effect re-runs from unrelated state changes.
  const tearedRef = useRef(false)
  const dealtRef = useRef(false)
  const dingedRef = useRef(false)
  useEffect(() => {
    if (phase === 'rip' && !tearedRef.current) {
      tearedRef.current = true
      playPackTear(muted)
    }
    if (phase === 'spread' && !dealtRef.current && revealMode === 'all') {
      // Reveal-all: one consolidated whoosh+chime instead of stacking
      // per-card flips, rare ding, and best-pull chime.
      dealtRef.current = true
      playRevealAll(muted)
    }
    if (phase === 'settled' && !dingedRef.current) {
      // No-op marker — kept so we don't fire reveal sounds twice if the
      // effect re-runs.
      dingedRef.current = true
    }
  }, [phase, muted, cards, revealMode, bestPullId])

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

  const skipToEnd = () => {
    // In manual mode, the lid is driven by inline style, not the CSS keyframe.
    // Mark it flying so it animates offscreen alongside the jump to settled.
    if (ripMode === 'manual' && !isFlying) setIsFlying(true)
    setIsDragging(false)
    setPhase('settled')
  }

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

  // In reveal-one mode the first click flips the card; subsequent clicks
  // (once it's face-up) open the focused view. In reveal-all mode every
  // click goes straight to focus.
  const handleCardClick = (index: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!cardsClickable) return
    const card = cards[index]
    if (revealMode === 'one' && !flippedCardIds.has(card.id)) {
      setFlippedCardIds(prev => {
        const next = new Set(prev)
        next.add(card.id)
        return next
      })
      playCardFlip(muted)
      // Best pull gets its own bell — feels earned. Other cards stay
      // quiet apart from the flip whoosh.
      if (card.id === bestPullId) playBestPullChime(muted, 0.15)
      return
    }
    navigateTo(index)
  }

  const allFlipped = revealMode === 'all' || cards.every(c => flippedCardIds.has(c.id))
  const showSummary =
    phase === 'settled' && selectedIndex === null && cards.length > 0 && allFlipped

  // "Open All" — flip every remaining face-down card at once with the
  // consolidated reveal whoosh.
  const handleOpenAll = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (revealMode !== 'one') return
    if (allFlipped) return
    setFlippedCardIds(new Set(cards.map(c => c.id)))
    playRevealAll(muted)
  }

  // Backdrop click: if a card is focused, just clear the selection (back to
  // the fan / grid). Otherwise do nothing — closing requires the X button.
  const handleBackdropClick = () => {
    if (selectedIndex !== null) {
      setSelectedIndex(null)
      setNavDirection(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center pack-open-bg animate-fade-in"
      onClick={handleBackdropClick}
    >
      {/* Top-right close + actions. Pushed below the 40px Electron title-bar
          overlay so they don't sit under the native min/maximize/close
          window controls on Windows. */}
      <div
        className="absolute right-4 flex items-center gap-2 z-30"
        style={{ top: 52 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Rip mode toggle — auto plays the rip animation; manual lets you
            drag the lid up with your cursor to tear it open. */}
        <button
          onClick={toggleRipMode}
          className="w-9 h-9 flex items-center justify-center rounded-full text-white/80 hover:text-white bg-white/10 hover:bg-white/20 transition-colors backdrop-blur-sm"
          title={ripMode === 'auto' ? 'Rip: auto (click to switch to manual drag)' : 'Rip: drag with cursor (click to switch to auto)'}
        >
          {ripMode === 'manual' ? (
            // Hand-pointer icon — signals "you grab it"
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 11V6a2 2 0 1 0-4 0v5"/>
              <path d="M14 10V4a2 2 0 1 0-4 0v6"/>
              <path d="M10 10.5V6a2 2 0 1 0-4 0v8"/>
              <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
            </svg>
          ) : (
            // Zap / auto icon
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          )}
        </button>
        {/* Reveal mode toggle */}
        <button
          onClick={toggleRevealMode}
          className="w-9 h-9 flex items-center justify-center rounded-full text-white/80 hover:text-white bg-white/10 hover:bg-white/20 transition-colors backdrop-blur-sm"
          title={revealMode === 'one' ? 'Reveal: one at a time (click to switch to all-at-once)' : 'Reveal: all at once (click to switch to one-by-one)'}
        >
          {revealMode === 'one' ? (
            // Eye icon
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          ) : (
            // Stack-of-cards icon
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="14" height="18" rx="2"/>
              <path d="M7 7h14v14"/>
            </svg>
          )}
        </button>
        {/* Mute toggle */}
        <button
          onClick={toggleMute}
          className="w-9 h-9 flex items-center justify-center rounded-full text-white/80 hover:text-white bg-white/10 hover:bg-white/20 transition-colors backdrop-blur-sm"
          title={muted ? 'Sound off (click to unmute)' : 'Sound on (click to mute)'}
        >
          {muted ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <line x1="22" y1="9" x2="16" y2="15"/>
              <line x1="16" y1="9" x2="22" y2="15"/>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
          )}
        </button>
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

      {/* Header label — also offset below the title bar overlay. */}
      <div
        className="absolute left-1/2 -translate-x-1/2 text-center pointer-events-none z-20"
        style={{
          top: 56,
          opacity: phase === 'settled' ? 1 : 0,
          transform: `translateX(-50%) translateY(${phase === 'settled' ? '0' : '-8px'})`,
          transition: 'opacity 400ms ease-out, transform 400ms ease-out'
        }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">Pulled from</p>
        <p className="text-base font-semibold text-white/90 mt-0.5">{parentItem.name}</p>
        {phase === 'settled' && cards.length > 0 && (
          <p className="text-[11px] text-white/40 mt-1">
            {revealMode === 'one' && !allFlipped
              ? `Click a card to reveal · ${flippedCardIds.size}/${cards.length} flipped`
              : 'Click a card to inspect'}
          </p>
        )}
      </div>

      {/* Manual rip hint — only shown while the user can still tear the pack. */}
      {animationStarted && ripMode === 'manual' && phase === 'enter' && !isFlying && (
        <div
          className="absolute left-1/2 -translate-x-1/2 pointer-events-none z-20 select-none"
          style={{
            bottom: 80,
            opacity: isDragging ? 0.35 : 1,
            transition: 'opacity 200ms ease-out'
          }}
        >
          <div className="flex flex-col items-center gap-1 text-white/60">
            {/* Diagonal up-left arrow */}
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-bounce">
              <path d="M19 19 5 5" />
              <path d="M14 5H5v9" />
            </svg>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">
              Pull corner up &amp; left to tear
            </p>
          </div>
        </div>
      )}

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
              className={`pack-wrap ${phase === 'enter' ? 'pack-enter' : ''} ${phase === 'rip' ? 'pack-shake' : ''} ${isExtractedOrLater ? 'pack-drop' : ''}`}
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
                {/* Lid — torn corner that rips off the upper-right of the pack.
                    Auto mode: the CSS @keyframes animation handles the tear.
                    Manual mode: an inline transform tracks the user's cursor
                    drag (translate + rotate around the bottom-left hinge),
                    then animates offscreen when the threshold is met. */}
                <div
                  className={`pack-half pack-top ${ripMode === 'auto' && (phase === 'rip' || isExtractedOrLater) ? 'pack-top-rip' : ''}`}
                  onMouseDown={onLidMouseDown}
                  style={ripMode === 'manual' ? {
                    transform: isFlying
                      ? 'translate(-90%, -280%) rotate(-86deg)'
                      : `translate(${lidTranslateX}px, ${lidTranslateY}px) rotate(${dragRotation}deg)`,
                    opacity: isFlying ? 0 : 1,
                    transition: isDragging
                      ? 'none'
                      : isFlying
                        ? 'transform 750ms cubic-bezier(0.5, 0, 0.55, 1), opacity 500ms ease-out 250ms'
                        : 'transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                    cursor: phase === 'enter' && !isFlying
                      ? (isDragging ? 'grabbing' : 'grab')
                      : undefined,
                    pointerEvents: phase === 'enter' && !isFlying ? 'auto' : 'none',
                    // Drop shadow strengthens as the lid lifts away from the pack body.
                    filter: ripProgress > 0
                      ? `drop-shadow(${-2 - ripProgress * 6}px ${4 + ripProgress * 8}px ${6 + ripProgress * 14}px rgba(0,0,0,${0.25 + ripProgress * 0.35}))`
                      : undefined
                  } : undefined}
                >
                  {packImage ? (
                    <img src={packImage} alt="" className="pack-art-image" draggable={false} />
                  ) : (
                    <PackArt setName={parentItem.set_name || parentItem.name} />
                  )}
                  {/* Right-corner grip indicator — only shown in manual mode
                      while the lid is intact. Tells the user where to grab. */}
                  {ripMode === 'manual' && phase === 'enter' && !isFlying && !isDragging && (
                    <div className="pack-grip-hint" aria-hidden>
                      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 7 7 17" />
                        <path d="M17 17V7H7" />
                      </svg>
                    </div>
                  )}
                </div>
                {/* tear glow line. Phase rip lights it up in auto mode; in
                    manual mode it fades in proportionally as the user pulls. */}
                <div
                  className="pack-rip-line"
                  style={{
                    opacity: ripMode === 'manual'
                      ? (isFlying ? 1 : ripProgress)
                      : (phase === 'rip' ? 1 : 0),
                    transition: ripMode === 'manual' && !isDragging
                      ? 'opacity 250ms ease-out'
                      : 'opacity 200ms ease-out'
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
              const isFlipped = revealMode === 'all' || flippedCardIds.has(card.id)
              const isBestPull = card.id === bestPullId && isFlipped
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
                  title={isFlipped ? card.name : 'Click to reveal'}
                >
                  <PulledCard
                    card={card}
                    rare={rare}
                    interactive={cardsClickable && !isHero}
                    flipped={isFlipped}
                    bestPull={isBestPull}
                  />
                </button>
              )
            })}
          </div>
        </div>

        {/* Empty state — no cards linked. Still show the financial outcome
            (the pack cost is a realized loss when nothing was pulled). */}
        {cards.length === 0 && phase === 'settled' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-6">
            <div className="text-center text-white/70">
              <p className="text-2xl font-bold mb-1.5">No cards pulled</p>
              <p className="text-sm text-white/40">Nothing was linked to this pack.</p>
            </div>
            <div className="pointer-events-auto">
              <PullSummaryBanner
                cost={pullSummary.cost}
                pullValue={pullSummary.pullValue}
                net={pullSummary.net}
                pct={pullSummary.pct}
                packs={pullSummary.packs}
              />
            </div>
          </div>
        )}
      </div>

      {/* "Open all" — flips every remaining face-down card at once.
          Visible only in reveal-one mode while flips remain. */}
      {phase === 'settled' &&
        revealMode === 'one' &&
        !allFlipped &&
        selectedIndex === null &&
        cards.length > 0 && (
          <div
            className="absolute left-1/2 -translate-x-1/2 z-30"
            style={{ bottom: 32 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleOpenAll}
              className="open-all-btn"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
              Open all
            </button>
          </div>
        )}

      {/* Pull summary banner — the climax. Cost vs pull value, with the
          net P/L in green or red. Hidden in focused mode (info panel
          covers that side) and in reveal-one mode until every card is
          flipped face-up. */}
      {showSummary && (
        <PullSummaryBanner
          cost={pullSummary.cost}
          pullValue={pullSummary.pullValue}
          net={pullSummary.net}
          pct={pullSummary.pct}
          packs={pullSummary.packs}
        />
      )}

      {/* Info panel — pops in on the right after the cards have settled
          into the focused layout. */}
      {layoutMode === 'focused' && cards[selectedIndex!] && (
        <InfoPanel
          card={cards[selectedIndex!]}
          flipped={revealMode === 'all' || flippedCardIds.has(cards[selectedIndex!].id)}
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

// ─── Pull summary banner — the climax: cost vs pull value ────────────────

function PullSummaryBanner({
  cost,
  pullValue,
  net,
  pct,
  packs
}: {
  cost: number
  pullValue: number
  net: number
  pct: number | null
  packs: number
}) {
  const positive = net >= 0
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 z-30 pointer-events-none"
      style={{ bottom: 28 }}
    >
      <div className="pull-summary-banner pointer-events-auto" onClick={(e) => e.stopPropagation()}>
        <div className="pull-summary-row">
          <div className="pull-summary-stat">
            <div className="pull-summary-label">Cost{packs > 1 ? ` · ${packs} packs` : ''}</div>
            <div className="pull-summary-value">{formatCurrency(cost)}</div>
          </div>
          <div className="pull-summary-arrow">→</div>
          <div className="pull-summary-stat">
            <div className="pull-summary-label">Pull value</div>
            <div className="pull-summary-value">{formatCurrency(pullValue)}</div>
          </div>
          <div className={`pull-summary-net ${positive ? 'is-positive' : 'is-negative'}`}>
            <div className="pull-summary-label">Net</div>
            <div className="pull-summary-net-value">
              {positive ? '+' : ''}{formatCurrency(net)}
              {pct !== null && (
                <span className="pull-summary-pct">
                  {' '}({positive ? '+' : ''}{pct.toFixed(1)}%)
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Info panel (right side, appears after cards finish moving) ──────────

function InfoPanel({
  card,
  flipped,
  index,
  total,
  navTick,
  navDirection,
  onClose
}: {
  card: InventoryCard
  flipped: boolean
  index: number
  total: number
  navTick: number
  navDirection: 'left' | 'right' | null
  onClose: () => void
}) {
  const [visible, setVisible] = useState(false)
  // Buffer the displayed card / index / flipped state so the panel keeps
  // showing the PREVIOUS card while it fades out, then swaps to the new
  // card only once the cards have finished sliding.
  const [displayCard, setDisplayCard] = useState(card)
  const [displayIndex, setDisplayIndex] = useState(index)
  const [displayFlipped, setDisplayFlipped] = useState(flipped)

  useEffect(() => {
    setVisible(false)
    const t = setTimeout(() => {
      setDisplayCard(card)
      setDisplayIndex(index)
      setDisplayFlipped(flipped)
      setVisible(true)
    }, 540)
    return () => clearTimeout(t)
    // navTick is the canonical "user navigated" signal — runs once per nav
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navTick])

  // If the user flips the currently-displayed card (no nav), update right
  // away so the placeholder swaps for the real details immediately.
  useEffect(() => {
    if (displayCard.id === card.id) setDisplayFlipped(flipped)
  }, [flipped, card.id, displayCard.id])

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
        {!displayFlipped ? (
          <div className="text-center py-12">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
              Card {shownIndex + 1} / {total}
            </span>
            <div className="mt-6 flex flex-col items-center gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/40">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                <path d="M21 3v5h-5"/>
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                <path d="M8 16H3v5"/>
              </svg>
              <p className="text-2xl font-semibold text-white/80">Flip to reveal</p>
              <p className="text-sm text-white/40">Click the card to turn it over</p>
            </div>
            <div className="mt-8 flex items-center justify-center gap-3">
              <button
                onClick={(e) => { e.stopPropagation(); onClose() }}
                className="px-3 py-1.5 text-xs font-semibold text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-md transition-colors"
              >
                Back to fan
              </button>
              <span className="text-[11px] text-white/30">← → keys · Esc to close</span>
            </div>
          </div>
        ) : (
        <>
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
          <div className="text-3xl font-semibold text-white mt-1 tabular-nums">{formatCurrency(shown.market_price)}</div>
          {shown.quantity > 1 && (
            <div className="text-xs text-white/50 mt-1 tabular-nums">
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
              <span className={`text-2xl font-semibold tabular-nums ${gl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {gl >= 0 ? '+' : ''}{formatCurrency(gl)}
              </span>
              {glPct !== null && (
                <span className={`text-sm tabular-nums ${gl >= 0 ? 'text-emerald-300/80' : 'text-rose-300/80'}`}>
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
        </>
        )}
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

function PulledCard({
  card,
  rare,
  interactive,
  flipped = true,
  bestPull = false
}: {
  card: InventoryCard
  rare: boolean
  interactive: boolean
  flipped?: boolean
  bestPull?: boolean
}) {
  // 3D flip container — rotates around the Y axis between face-down and
  // face-up. Both sides occupy the same space; backface-visibility hides
  // the side currently facing away from the viewer.
  return (
    <div
      data-card-visual
      className={`pulled-card-flip ${flipped ? 'is-flipped' : ''}`}
      style={{ width: '100%', height: '100%' }}
    >
      <div className="pulled-card-flip-inner">
        {/* BACK */}
        <div className="pulled-card-flip-face pulled-card-flip-back">
          <CardBack />
        </div>
        {/* FRONT */}
        <div
          className={`pulled-card-flip-face pulled-card-flip-front relative rounded-lg overflow-hidden shadow-2xl bg-surface-800 ring-1 ring-white/10 ${rare ? 'pulled-card-rare' : ''} ${interactive ? 'pulled-card-interactive' : ''} ${bestPull ? 'pulled-card-best' : ''}`}
        >
          <CardImage
            src={card.image_url}
            setId={card.set_id}
            name={card.name}
            alt={card.name}
            className="w-full h-full object-cover"
          />
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
          {bestPull && <div className="pulled-card-best-glow pointer-events-none" />}
        </div>
      </div>
    </div>
  )
}

// Official Pokémon TCG card back, bundled with the app at
// src/renderer/src/assets/pokemon_card_back.png.
function CardBack() {
  return (
    <div className="card-back">
      <img
        src={pokemonCardBackUrl}
        alt=""
        className="card-back-img"
        draggable={false}
      />
    </div>
  )
}

function DetailStat({ label, value, subtle }: { label: string; value: string; subtle?: boolean }) {
  return (
    <div className={`rounded-lg p-3 bg-white/5 border border-white/10 ${subtle ? 'opacity-70' : ''}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-white/50">{label}</div>
      <div className="text-base font-semibold text-white mt-1 tabular-nums">{value}</div>
    </div>
  )
}
