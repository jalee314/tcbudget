// Generic in-memory TTL cache.
// Entries auto-expire on access; expired entries are also swept opportunistically.

type Entry<V> = { value: V; expiresAt: number }

export class TTLCache<V> {
  private cache = new Map<string, Entry<V>>()
  private hits = 0
  private misses = 0

  get(key: string): V | undefined {
    const entry = this.cache.get(key)
    if (!entry) {
      this.misses++
      return undefined
    }
    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(key)
      this.misses++
      return undefined
    }
    this.hits++
    return entry.value
  }

  set(key: string, value: V, ttlMs: number): void {
    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs })
  }

  has(key: string): boolean {
    const entry = this.cache.get(key)
    if (!entry) return false
    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(key)
      return false
    }
    return true
  }

  clear(): void {
    this.cache.clear()
    this.hits = 0
    this.misses = 0
  }

  stats(): { size: number; hits: number; misses: number } {
    return { size: this.cache.size, hits: this.hits, misses: this.misses }
  }
}
