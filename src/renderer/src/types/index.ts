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
}

export interface PortfolioSummary {
  totalCards: number
  totalQuantity: number
  totalCostBasis: number
  totalMarketValue: number
  unrealizedPL: number
  unrealizedPLPercent: number
  realizedGains: number
  heldCount: number
  soldCount: number
}
