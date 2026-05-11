import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { InventoryCard } from '../types'

interface PulledFromEditorProps {
  card: InventoryCard
  openedSealedItems: InventoryCard[]
  onClose: () => void
  onSave: (parentId: string | null) => void
}

export default function PulledFromEditor({ card, openedSealedItems, onClose, onSave }: PulledFromEditorProps) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string>(card.parent_id ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const filtered = useMemo(() => {
    if (!query.trim()) return openedSealedItems
    const q = query.toLowerCase()
    return openedSealedItems.filter(
      i => i.name.toLowerCase().includes(q) || (i.set_name?.toLowerCase().includes(q) ?? false)
    )
  }, [openedSealedItems, query])

  const selected = openedSealedItems.find(i => i.id === selectedId) ?? null

  const handleBackdrop = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-4 animate-fade-in"
      onClick={handleBackdrop}
    >
      <div className="glass-card w-full max-w-md flex flex-col shadow-xl-soft animate-scale-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-200">
          <div>
            <h2 className="text-sm font-bold text-surface-900">Pulled From</h2>
            <p className="text-[11px] text-surface-500 mt-0.5 truncate max-w-[20rem]">{card.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-surface-500 hover:text-surface-900 hover:bg-surface-100 transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>

        <div className="px-5 py-3 border-b border-surface-100">
          <input
            ref={inputRef}
            type="text"
            placeholder={openedSealedItems.length === 0 ? 'No opened sealed items in inventory' : 'Search opened sealed items...'}
            value={query}
            disabled={openedSealedItems.length === 0}
            onChange={e => setQuery(e.target.value)}
            className="input-dark py-2 text-sm"
          />
        </div>

        <div className="max-h-72 overflow-y-auto">
          <button
            onClick={() => setSelectedId('')}
            className={`flex items-center gap-2 w-full text-left px-5 py-2.5 text-sm hover:bg-surface-50 transition-colors ${selectedId === '' ? 'bg-accent/5' : ''}`}
          >
            <span className={`w-3.5 h-3.5 rounded-full border-2 ${selectedId === '' ? 'border-accent bg-accent' : 'border-surface-300'}`} />
            <span className="text-surface-700">None (clear)</span>
          </button>
          {filtered.map(item => (
            <button
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className={`flex items-center gap-2 w-full text-left px-5 py-2.5 text-sm hover:bg-surface-50 transition-colors ${selectedId === item.id ? 'bg-accent/5' : ''}`}
            >
              <span className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${selectedId === item.id ? 'border-accent bg-accent' : 'border-surface-300'}`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-surface-900 truncate">{item.name}</div>
                <div className="text-[11px] text-surface-500 truncate">{item.set_name}</div>
              </div>
            </button>
          ))}
          {openedSealedItems.length > 0 && filtered.length === 0 && (
            <div className="px-5 py-4 text-xs text-surface-400 text-center">No matches for "{query}"</div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-surface-200 flex items-center justify-between bg-surface-50">
          <div className="text-[11px] text-surface-500">
            {selected ? `Selected: ${selected.name}` : 'No parent set'}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-ghost text-xs">Cancel</button>
            <button
              onClick={() => onSave(selectedId || null)}
              className="btn-primary text-xs"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
