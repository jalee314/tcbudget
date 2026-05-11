import React, { useState, useEffect } from 'react'
import { InventoryCard } from '../types'

interface OpenModalProps {
  card: InventoryCard | null
  onClose: () => void
  onConfirm: (qtyOpened: number) => void
}

export default function OpenModal({ card, onClose, onConfirm }: OpenModalProps) {
  const [qty, setQty] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (card) {
      setQty(String(card.quantity))
      setError('')
    }
  }, [card])

  if (!card) return null

  const maxQty = card.quantity

  const handleOpenAll = () => setQty(String(maxQty))

  const handleConfirm = () => {
    const q = parseInt(qty, 10)
    if (!Number.isInteger(q) || q < 1 || q > maxQty) {
      setError(`Quantity must be between 1 and ${maxQty}`)
      return
    }
    onConfirm(q)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConfirm()
    if (e.key === 'Escape') onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 modal-backdrop flex items-center justify-center animate-fade-in"
      onClick={onClose}
    >
      <div
        className="glass-card w-full max-w-md mx-4 p-6 rounded-2xl shadow-xl-soft animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-surface-900">Mark as Opened</h2>
          <p className="text-sm text-surface-500 truncate mt-0.5">{card.name}</p>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-surface-700 uppercase tracking-wider">
                Quantity Opened
              </label>
              {maxQty > 1 && (
                <button
                  type="button"
                  onClick={handleOpenAll}
                  className="text-xs font-semibold text-accent hover:underline"
                >
                  Open all ({maxQty})
                </button>
              )}
            </div>
            <input
              type="text"
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              autoFocus
              className="input-dark w-full font-mono py-2 text-sm"
            />
            <p className="text-[11px] text-surface-500 mt-1">
              Currently sealed: {maxQty}
            </p>
          </div>

          {error && (
            <p className="text-xs text-loss font-medium">{error}</p>
          )}
        </div>

        <div className="flex gap-2 mt-6 justify-end">
          <button onClick={onClose} className="btn-ghost text-sm">
            Cancel
          </button>
          <button onClick={handleConfirm} className="btn-primary text-sm">
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
