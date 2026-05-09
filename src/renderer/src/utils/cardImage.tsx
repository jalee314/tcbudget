import { useEffect, useState } from 'react'
import cardBackImage from '../assets/pokemon_card_back.jpg'

// Some variant cards (e.g. Master Ball pattern Stunfisk) have their own
// JustTCG entry with a tcgplayerId that doesn't have a matching image on
// TCGplayer's CDN. The base printing of the same card lives in the same
// set under the same name (different card number), so we look it up by
// set + name and use its image instead.
const baseCardImageCache = new Map<string, Promise<string | null>>()

function tcgplayerImageUrlForId(tcgplayerId: string | null | undefined): string | null {
  if (!tcgplayerId) return null
  return `https://product-images.tcgplayer.com/fit-in/400x550/${tcgplayerId}.jpg`
}

function probeImage(url: string): Promise<boolean> {
  return new Promise(resolve => {
    const img = new window.Image()
    img.onload = () => resolve(true)
    img.onerror = () => resolve(false)
    img.src = url
  })
}

function parseCardNumber(num: string | null | undefined): number {
  if (!num) return Number.MAX_SAFE_INTEGER
  const m = String(num).match(/\d+/)
  return m ? parseInt(m[0], 10) : Number.MAX_SAFE_INTEGER
}

async function fetchBaseCardImage(setId: string, name: string, excludeUrl: string): Promise<string | null> {
  if (!setId || !name) return null
  // Strip parenthetical suffixes like "(Master Ball pattern)" so the search
  // hits the base printing, not the same variant entry.
  const cleanName = name.replace(/\s*\([^)]*\)\s*/g, ' ').trim()
  const key = `${setId.toLowerCase()}|${cleanName.toLowerCase()}|${excludeUrl}`
  let pending = baseCardImageCache.get(key)
  if (!pending) {
    pending = (async () => {
      const api = (window as any).electronAPI
      if (!api?.justtcg?.search) return null
      try {
        const result = await api.justtcg.search(cleanName)
        if (result?.error || !result?.data) return null
        const setLower = setId.toLowerCase()
        // Same-set matches, sorted by card number ascending — base printings
        // generally have the lowest numbers; alt-arts / illustration rares /
        // pattern variants get appended at the end of the set.
        const sameSet = (result.data as any[])
          .filter(raw => String(raw?.set ?? raw?.set_id ?? '').toLowerCase() === setLower)
          .sort((a, b) => parseCardNumber(a?.number) - parseCardNumber(b?.number))
        for (const raw of sameSet) {
          const url = tcgplayerImageUrlForId(raw?.tcgplayerId)
          if (!url || url === excludeUrl) continue
          if (await probeImage(url)) return url
        }
        return null
      } catch {
        return null
      }
    })()
    baseCardImageCache.set(key, pending)
  }
  return await pending
}

interface CardImageProps {
  src: string | null | undefined
  setId: string | null | undefined
  name: string | null | undefined
  alt: string
  className?: string
  draggable?: boolean
}

export function CardImage({ src, setId, name, alt, className, draggable }: CardImageProps) {
  const [currentSrc, setCurrentSrc] = useState(src || cardBackImage)
  const [triedFallback, setTriedFallback] = useState(false)

  useEffect(() => {
    setCurrentSrc(src || cardBackImage)
    setTriedFallback(false)
  }, [src])

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      draggable={draggable}
      loading="lazy"
      onError={async () => {
        if (currentSrc === cardBackImage) return
        if (!triedFallback && setId && name) {
          setTriedFallback(true)
          const fallback = await fetchBaseCardImage(setId, name, currentSrc)
          if (fallback) {
            setCurrentSrc(fallback)
            return
          }
        }
        setCurrentSrc(cardBackImage)
      }}
    />
  )
}
