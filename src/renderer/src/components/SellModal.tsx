import React, { useState, useEffect } from 'react'
import { InventoryCard } from '../types'

interface SellModalProps {
  card: InventoryCard | null
  onClose: () => void
  onConfirm: (qtySold: number, salePrice: number) => void
}

export default function SellModal({ card, onClose, onConfirm }: SellModalProps) {
  const [qty, setQty] = useState('')
  const [price, setPrice] = useState('')
  const [priceMode, setPriceMode] = useState<'unit' | 'total'>('unit')
  const [error, setError] = useState('')

  useEffect(() => {
    if (card) {
      setQty(String(card.quantity))
      setPrice(card.market_price ? String(card.market_price) : '')
      setError('')
    }
  }, [card])

  if (!card) return null

  const maxQty = card.quantity

  const handleSellAll = () => setQty(String(maxQty))

  const handleConfirm = () => {
    const q = parseInt(qty, 10)
    const raw = parseFloat(price)
    if (!Number.isInteger(q) || q < 1 || q > maxQty) {
      setError(`Quantity must be between 1 and ${maxQty}`)
      return
    }
    if (!isFinite(raw) || raw < 0) {
      setError('Enter a valid sale price')
      return
    }
    const totalSalePrice = priceMode === 'total' ? raw : raw * q
    onConfirm(q, totalSalePrice)
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
          <h2 className="text-lg font-semibold text-surface-900">Mark as Sold</h2>
          <p className="text-sm text-surface-500 truncate mt-0.5">{card.name}</p>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-surface-700 uppercase tracking-wider">
                Quantity Sold
              </label>
              {maxQty > 1 && (
                <button
                  type="button"
                  onClick={handleSellAll}
                  className="text-xs font-semibold text-accent hover:underline"
                >
                  Sell all ({maxQty})
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
              disabled={maxQty === 1}
            />
            <p className="text-[11px] text-surface-500 mt-1">
              In possession: {maxQty}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-surface-700 uppercase tracking-wider">
                Sale Price ({priceMode === 'unit' ? 'per unit' : 'total'})
              </label>
              <div className="flex gap-0.5 border border-surface-200 rounded-md p-0.5 bg-surface-50">
                {(['unit', 'total'] as const).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPriceMode(m)}
                    className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded transition-colors ${
                      priceMode === m ? 'bg-white text-surface-900 shadow-sm' : 'text-surface-500 hover:text-surface-700'
                    }`}
                  >
                    {m === 'unit' ? 'Per Unit' : 'Total'}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500 text-sm font-mono pointer-events-none">$</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder={card.market_price ? card.market_price.toFixed(2) : '0.00'}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="input-dark w-full py-2 text-sm font-mono !pl-7"
              />
            </div>
            <p className="text-[11px] text-surface-500 mt-1">
              {priceMode === 'total' && parseFloat(price) > 0 && parseInt(qty, 10) > 0
                ? `≈ $${(parseFloat(price) / parseInt(qty, 10)).toFixed(2)}/unit · `
                : ''}
              Cost basis: ${card.purchase_price.toFixed(2)}/unit
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
            Confirm Sale
          </button>
        </div>
      </div>
    </div>
  )
}
