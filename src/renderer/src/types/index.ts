export interface InventoryCard {
  id: string
  card_id: string
  name: string
  set_name: string
  set_id: string
  card_number: string
  rarity: string
  image_url: string
  purchase_price: number
  purchase_date: string
  quantity: number
  condition: string
  market_price: number
  last_updated: string
  is_sold: number
  sale_price: number
  sale_date: string
  notes: string
  item_type?: 'Card' | 'Sealed' | 'Other'
  parent_id?: string | null
  is_opened?: number
  variant_id?: string | null
  price_change_baseline?: number | null
  is_kept?: number
}

export interface SearchCardVariant {
  id: string
  condition: string
  printing: string
  price: number
}

export interface SearchCard {
  id: string
  name: string
  set_name: string
  set_id: string
  card_number: string
  rarity: string
  image_url: string
  image_url_large: string
  market_price: number
  types?: string[]
  supertype?: string
  variants?: SearchCardVariant[]
}

export interface SealedProduct {
  id: string
  name: string
  set_name: string
  set_id: string
  product_type: 'ETB' | 'Booster Box' | 'Booster Bundle' | 'Build & Battle' | 'Premium Collection' | 'Other'
  pack_count: number
  market_price: number
  image_url: string
  variant_id?: string | null
}

export interface PortfolioSummary {
  totalCards: number
  totalQuantity: number
  totalCostBasis: number
  totalMarketValue: number
  unrealizedPL: number
  unrealizedPLPercent: number
  realizedGains: number
  // Unit quantities (not row counts) of bought-only items (parent_id unset)
  // backing the cost basis figure — a qty-2 bundle counts as 2.
  boughtHeldCount: number
  boughtOpenedCount: number
  boughtSoldCount: number
  soldVsMarketPercent: number | null
  heldCount: number
  soldCount: number
  openedCount: number
  openedCost: number
  keptCount: number
  keptValue: number
}
