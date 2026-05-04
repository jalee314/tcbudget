import React, { useState, useCallback, useMemo, useRef } from 'react'
import { AgGridReact } from 'ag-grid-react'
import {
  ColDef,
  CellValueChangedEvent,
  ICellRendererParams,
  ValueFormatterParams
} from 'ag-grid-community'
import { InventoryCard } from '../types'

type GridRow = InventoryCard & {
  __isGroup?: boolean
  __inGroup?: boolean
  __groupKey?: string
  __lotCount?: number
  __expanded?: boolean
  __sortIndex?: number
}

interface DataGridProps {
  rowData: InventoryCard[]
  onCellValueChanged: (id: string, field: string, value: unknown) => void
  onDeleteRow: (id: string) => void
  onToggleSold: (card: InventoryCard) => void
  onToggleOpened: (card: InventoryCard) => void
  onViewContents?: (id: string) => void
}

// ─── Custom Cell Renderers ──────────────────────────────────────────────

function CardNameRenderer(props: ICellRendererParams<GridRow> & { onToggleGroup?: (key: string) => void }) {
  const data = props.data
  if (!data) return null

  if (data.__isGroup) {
    return (
      <button
        onClick={() => props.onToggleGroup?.(data.__groupKey!)}
        className="flex items-center gap-3 overflow-hidden w-full text-left hover:bg-surface-100/50 -mx-4 px-4 py-1 rounded transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-surface-500 transition-transform flex-shrink-0 ${data.__expanded ? 'rotate-90' : ''}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        {data.image_url && (
          <div className="w-8 h-11 rounded overflow-hidden flex-shrink-0 bg-surface-200">
            <img src={data.image_url} alt={data.name} className="w-full h-full object-cover" loading="lazy" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-surface-900 truncate flex items-center gap-2">
            {data.name}
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent/15 text-accent-dark">
              {data.__lotCount} lots
            </span>
          </div>
          <div className="text-[11px] text-surface-500 truncate">{data.set_name} · {data.card_number}</div>
        </div>
      </button>
    )
  }

  return (
    <div className={`flex items-center gap-3 overflow-hidden w-full ${data.__inGroup ? 'pl-6' : ''}`}>
      {data.image_url && (
        <div className="w-8 h-11 rounded overflow-hidden flex-shrink-0 bg-surface-200">
          <img
            src={data.image_url}
            alt={data.name}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-surface-900 truncate">
          {data.__inGroup ? <span className="text-surface-500 text-xs">Lot · </span> : null}
          {data.name}
        </div>
        <div className="text-[11px] text-surface-500 truncate">{data.set_name} · {data.card_number}</div>
      </div>
    </div>
  )
}

function PLRenderer(props: ICellRendererParams<GridRow>) {
  const data = props.data
  if (!data) return null

  const pl = (data.market_price - data.purchase_price) * data.quantity
  const isPositive = pl >= 0

  return (
    <span className={`font-mono text-sm font-medium ${isPositive ? 'text-gain' : 'text-loss'}`}>
      {isPositive ? '+' : ''}{formatCurrency(pl)}
    </span>
  )
}

function ReturnRenderer(props: ICellRendererParams<GridRow>) {
  const data = props.data
  if (!data || data.purchase_price === 0) return <span className="text-surface-400">—</span>

  const ret = ((data.market_price - data.purchase_price) / data.purchase_price) * 100
  const isPositive = ret >= 0

  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold font-mono ${
        isPositive
          ? 'bg-gain-bg text-gain-light'
          : 'bg-loss-bg text-loss-light'
      }`}>
        {isPositive ? '▲' : '▼'} {Math.abs(ret).toFixed(1)}%
      </span>
    </div>
  )
}

function StatusRenderer(props: ICellRendererParams<GridRow>) {
  const data = props.data
  if (!data) return null
  if (data.__isGroup) {
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-surface-100 text-surface-500">Lots</span>
  }
  const isSold = !!data.is_sold
  const isOpened = data.is_opened === 1 && !isSold

  if (isSold) {
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider badge-sold">Sold</span>
  }
  if (isOpened) {
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-amber-100 text-amber-700">Opened</span>
  }
  return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider badge-held">Held</span>
}

function ActionsRenderer(props: ICellRendererParams<GridRow> & {
  onDelete: (id: string) => void
  onToggleSold: (card: InventoryCard) => void
  onToggleOpened: (card: InventoryCard) => void
  onViewContents?: (id: string) => void
}) {
  const data = props.data
  if (!data || data.__isGroup) return null

  const isSold = !!data.is_sold
  const isSealed = data.item_type === 'Sealed'
  const isOpened = data.is_opened === 1

  return (
    <div className="flex items-center gap-1">
      {/* View contents — show for opened sealed items */}
      {isSealed && isOpened && props.onViewContents && (
        <button
          onClick={() => props.onViewContents!(data.id)}
          className="p-1.5 rounded-md text-surface-500 hover:text-accent hover:bg-accent/10 transition-all"
          title="View Pulled Cards"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            <polyline points="3.29 7 12 12 20.71 7"/>
            <line x1="12" y1="22" x2="12" y2="12"/>
          </svg>
        </button>
      )}

      {/* Open/seal toggle — only for sealed items that aren't sold */}
      {isSealed && !isSold && (
        <button
          onClick={() => props.onToggleOpened(data)}
          className={`p-1.5 rounded-md transition-all ${isOpened ? 'text-amber-500 hover:text-amber-700 hover:bg-amber-50' : 'text-surface-500 hover:text-amber-600 hover:bg-amber-50'}`}
          title={isOpened ? 'Mark as Sealed' : 'Mark as Opened'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {isOpened ? (
              <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></>
            ) : (
              <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>
            )}
          </svg>
        </button>
      )}

      {/* Sold toggle */}
      <button
        onClick={() => props.onToggleSold(data)}
        className="p-1.5 rounded-md text-surface-500 hover:text-surface-900 hover:bg-surface-200 transition-all"
        title={isSold ? 'Mark as Held' : 'Mark as Sold'}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {isSold ? (
            <><path d="M3 12h18"/><path d="m8 7-5 5 5 5"/></>
          ) : (
            <><path d="M20 6 9 17l-5-5"/></>
          )}
        </svg>
      </button>

      {/* Delete */}
      <button
        onClick={() => props.onDelete(data.id)}
        className="p-1.5 rounded-md text-surface-500 hover:text-loss hover:bg-loss/10 transition-all"
        title="Delete"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
        </svg>
      </button>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(val)
}

function currencyFormatter(params: ValueFormatterParams): string {
  if (params.value == null || params.value === '') return ''
  return formatCurrency(Number(params.value))
}

// ─── Main Component ─────────────────────────────────────────────────────

export default function DataGrid({ rowData, onCellValueChanged, onDeleteRow, onToggleSold, onToggleOpened, onViewContents }: DataGridProps) {
  const gridRef = useRef<AgGridReact>(null)
  const [filterText, setFilterText] = useState('')
  const [viewFilter, setViewFilter] = useState<'all' | 'cards' | 'sealed'>('all')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const filteredByType = useMemo(() => {
    if (viewFilter === 'cards') return rowData.filter(c => c.item_type === 'Card')
    if (viewFilter === 'sealed') return rowData.filter(c => c.item_type === 'Sealed')
    return rowData
  }, [rowData, viewFilter])

  const rowOrder = useMemo(() => {
    const order = new Map<string, number>()
    filteredByType.forEach((card, index) => {
      order.set(card.id, index)
    })
    return order
  }, [filteredByType])

  // Build grid rows with lot grouping for held items that share a card_id but differ in purchase_price.
  const gridRows = useMemo<GridRow[]>(() => {
    const groupable: InventoryCard[] = []
    const ungrouped: InventoryCard[] = []
    for (const c of filteredByType) {
      if (!c.is_sold && !c.is_opened && c.card_id) groupable.push(c)
      else ungrouped.push(c)
    }

    const buckets = new Map<string, InventoryCard[]>()
    for (const c of groupable) {
      const key = `${c.card_id}|${c.condition || ''}|${c.variant_id || ''}`
      const arr = buckets.get(key) ?? []
      arr.push(c)
      buckets.set(key, arr)
    }

    const out: GridRow[] = []
    for (const [key, lots] of buckets) {
      const sourceIndexes = lots
        .map(lot => rowOrder.get(lot.id) ?? Number.MAX_SAFE_INTEGER)
        .filter(index => index !== Number.MAX_SAFE_INTEGER)
      const sortIndex = sourceIndexes.length > 0 ? Math.min(...sourceIndexes) : Number.MAX_SAFE_INTEGER
      const distinctPrices = new Set(lots.map(l => l.purchase_price))
      if (lots.length >= 2 && distinctPrices.size >= 2) {
        const totalQty = lots.reduce((s, l) => s + l.quantity, 0)
        const totalCost = lots.reduce((s, l) => s + l.purchase_price * l.quantity, 0)
        const avgCost = totalQty > 0 ? totalCost / totalQty : 0
        const sample = lots[0]
        const isExpanded = expandedGroups.has(key)
        const groupRow: GridRow = {
          ...sample,
          id: `__group__${key}`,
          quantity: totalQty,
          purchase_price: avgCost,
          notes: '',
          sale_price: 0,
          sale_date: '',
          is_sold: 0,
          is_opened: 0,
          __isGroup: true,
          __groupKey: key,
          __lotCount: lots.length,
          __expanded: isExpanded,
          __sortIndex: sortIndex
        }
        out.push(groupRow)
        if (isExpanded) {
          for (const lot of lots) {
            out.push({
              ...lot,
              __inGroup: true,
              __groupKey: key,
              __sortIndex: rowOrder.get(lot.id) ?? Number.MAX_SAFE_INTEGER
            })
          }
        }
      } else {
        for (const lot of lots) {
          out.push({
            ...lot,
            __sortIndex: rowOrder.get(lot.id) ?? Number.MAX_SAFE_INTEGER
          })
        }
      }
    }
    for (const u of ungrouped) {
      out.push({
        ...u,
        __sortIndex: rowOrder.get(u.id) ?? Number.MAX_SAFE_INTEGER
      })
    }
    out.sort((a, b) => (a.__sortIndex ?? Number.MAX_SAFE_INTEGER) - (b.__sortIndex ?? Number.MAX_SAFE_INTEGER))
    return out
  }, [filteredByType, expandedGroups, rowOrder])

  const columnDefs = useMemo<ColDef<GridRow>[]>(() => [
    {
      headerName: 'Item',
      field: 'name',
      cellRenderer: CardNameRenderer,
      cellRendererParams: { onToggleGroup: toggleGroup },
      minWidth: 260,
      flex: 2,
      filter: 'agTextColumnFilter',
      pinned: 'left' as const,
      tooltipValueGetter: (params) => params.data?.name ?? ''
    },
    {
      headerName: 'Rarity',
      field: 'rarity',
      width: 140,
      filter: 'agTextColumnFilter',
      cellClass: 'text-surface-500 text-xs'
    },
    {
      headerName: 'Condition',
      field: 'condition',
      width: 120,
      editable: (params) => !params.data?.__isGroup,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: {
        values: ['Raw', 'Raw NM', 'Raw LP', 'Raw MP', 'Raw HP', 'PSA 10', 'PSA 9', 'PSA 8', 'PSA 7', 'CGC 10', 'CGC 9.5', 'CGC 9', 'BGS 10', 'BGS 9.5', 'BGS 9', 'Sealed']
      },
      cellClass: 'text-surface-700 text-xs font-medium'
    },
    {
      headerName: 'Qty',
      field: 'quantity',
      width: 80,
      editable: (params) => !params.data?.__isGroup,
      cellDataType: 'number',
      cellClass: 'text-center font-mono'
    },
    {
      headerName: 'Purchase',
      field: 'purchase_price',
      width: 120,
      editable: (params) => !params.data?.__isGroup,
      cellDataType: 'number',
      valueFormatter: (params) => {
        if (params.data?.__isGroup) return `~${currencyFormatter(params)}`
        return currencyFormatter(params)
      },
      cellClass: (params) => params.data?.__isGroup ? 'font-mono text-surface-500 italic' : 'font-mono text-surface-700'
    },
    {
      headerName: 'Market',
      field: 'market_price',
      width: 120,
      valueFormatter: currencyFormatter,
      cellClass: 'font-mono text-surface-900 font-medium'
    },
    {
      headerName: 'Total Market Price',
      colId: 'total_market_price',
      width: 150,
      valueGetter: (params) => {
        const d = params.data
        if (!d || d.__isGroup || !d.quantity) return null
        return d.market_price * d.quantity
      },
      valueFormatter: (params) => params.value == null ? '—' : currencyFormatter(params),
      cellClass: (params) => params.value == null ? 'text-surface-400 font-mono' : 'font-mono text-surface-900'
    },
    {
      headerName: 'Cost Basis',
      valueGetter: (params) => {
        if (!params.data) return 0
        return params.data.purchase_price * params.data.quantity
      },
      valueFormatter: currencyFormatter,
      width: 120,
      cellClass: 'font-mono text-surface-500'
    },
    {
      headerName: 'Unrealized P&L',
      cellRenderer: PLRenderer,
      width: 140,
      comparator: (valueA, valueB, nodeA, nodeB) => {
        const plA = nodeA.data ? (nodeA.data.market_price - nodeA.data.purchase_price) * nodeA.data.quantity : 0
        const plB = nodeB.data ? (nodeB.data.market_price - nodeB.data.purchase_price) * nodeB.data.quantity : 0
        return plA - plB
      },
      sortable: true
    },
    {
      headerName: 'Return',
      cellRenderer: ReturnRenderer,
      width: 110,
      comparator: (valueA, valueB, nodeA, nodeB) => {
        const retA = nodeA.data && nodeA.data.purchase_price > 0 ? (nodeA.data.market_price - nodeA.data.purchase_price) / nodeA.data.purchase_price : 0
        const retB = nodeB.data && nodeB.data.purchase_price > 0 ? (nodeB.data.market_price - nodeB.data.purchase_price) / nodeB.data.purchase_price : 0
        return retA - retB
      },
      sortable: true
    },
    {
      headerName: 'Status',
      colId: 'status',
      cellRenderer: StatusRenderer,
      width: 100,
      filter: false,
      sortable: true,
      valueGetter: (params) => {
        const d = params.data
        if (!d || d.__isGroup) return ''
        if (d.is_sold) return 'Sold'
        if (d.is_opened) return 'Opened'
        return 'Held'
      }
    },
    {
      headerName: 'Total Sale Price',
      field: 'sale_price',
      width: 140,
      editable: (params) => params.data?.is_sold === 1,
      cellDataType: 'number',
      valueFormatter: (params) => {
        if (!params.data?.is_sold || params.value === 0) return '—'
        return currencyFormatter(params)
      },
      cellClass: (params) => {
        if (!params.data?.is_sold) return 'text-surface-400'
        return 'font-mono text-surface-900'
      }
    },
    {
      headerName: 'Unit Sale Price',
      colId: 'unit_sale_price',
      width: 130,
      valueGetter: (params) => {
        const d = params.data
        if (!d || d.__isGroup || !d.is_sold || !d.quantity) return null
        return d.sale_price / d.quantity
      },
      valueFormatter: (params) => params.value == null ? '—' : currencyFormatter(params),
      cellClass: (params) => params.value == null ? 'text-surface-400 font-mono' : 'font-mono text-surface-900'
    },
    {
      headerName: '% of Market',
      colId: 'sold_vs_market',
      width: 120,
      valueGetter: (params) => {
        const d = params.data
        if (!d || d.__isGroup || !d.is_sold || !d.market_price || !d.quantity) return null
        const unitSalePrice = d.sale_price / d.quantity
        return (unitSalePrice / d.market_price) * 100
      },
      valueFormatter: (params) => params.value == null ? '—' : `${(params.value as number).toFixed(1)}%`,
      cellClass: (params) => {
        if (params.value == null) return 'text-surface-400 font-mono text-xs'
        return (params.value as number) >= 80 ? 'font-mono text-xs text-gain' : 'font-mono text-xs text-loss'
      }
    },
    {
      headerName: 'Date',
      field: 'purchase_date',
      width: 110,
      editable: (params) => !params.data?.__isGroup,
      cellClass: 'text-surface-500 text-xs font-mono'
    },
    {
      headerName: 'Notes',
      field: 'notes',
      minWidth: 140,
      flex: 1,
      editable: (params) => !params.data?.__isGroup,
      cellClass: 'text-surface-500 text-xs'
    },
    {
      headerName: '',
      colId: 'actions',
      valueGetter: (params) => params.data ? `${params.data.is_sold}|${params.data.is_opened}` : '',
      width: 140,
      cellRenderer: ActionsRenderer,
      cellRendererParams: {
        onDelete: onDeleteRow,
        onToggleSold: onToggleSold,
        onToggleOpened: onToggleOpened,
        onViewContents: onViewContents
      },
      pinned: 'right' as const,
      sortable: false,
      filter: false
    }
  ], [onDeleteRow, onToggleSold, onToggleOpened, onViewContents, toggleGroup])

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    suppressMovable: false,
    cellStyle: { lineHeight: 'normal' }
  }), [])

  const handleCellValueChanged = useCallback((event: CellValueChangedEvent<GridRow>) => {
    if (event.data && !event.data.__isGroup && event.colDef.field) {
      onCellValueChanged(event.data.id, event.colDef.field, event.newValue)
    }
  }, [onCellValueChanged])

  const onFilterTextChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterText(e.target.value)
    gridRef.current?.api?.setGridOption('quickFilterText', e.target.value)
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* Grid Filter Bar */}
      <div className="flex items-center gap-3 px-5 py-3">
        <div className="flex gap-1 border border-surface-200 rounded-lg p-0.5 bg-surface-50">
          {(['all', 'cards', 'sealed'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setViewFilter(tab)}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                viewFilter === tab
                  ? 'bg-white text-surface-900 shadow-sm'
                  : 'text-surface-500 hover:text-surface-700'
              }`}
            >
              {tab === 'all' ? 'All' : tab === 'cards' ? 'Cards' : 'Sealed'}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-500" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <input
            type="text"
            placeholder="Filter items..."
            value={filterText}
            onChange={onFilterTextChange}
            className="input-dark !pl-10 py-2 text-sm"
          />
        </div>
        <span className="text-xs text-surface-500 font-mono">
          {filteredByType.length} {filteredByType.length === 1 ? 'item' : 'items'}
        </span>
      </div>

      {/* AG Grid */}
      <div className="flex-1 px-5 pb-4">
        <div className="ag-theme-alpine ag-theme-custom-light w-full h-full rounded-xl overflow-hidden glass-card-subtle">
          <AgGridReact<GridRow>
            ref={gridRef}
            rowData={gridRows}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            onCellValueChanged={handleCellValueChanged}
            pagination={false}
            getRowId={(params) => params.data.id}
            domLayout="normal"
            headerHeight={44}
            rowHeight={52}
            suppressCellFocus={false}
            enableCellTextSelection={true}
            enableBrowserTooltips={true}
            tooltipShowDelay={500}
          />
        </div>
      </div>
    </div>
  )
}
