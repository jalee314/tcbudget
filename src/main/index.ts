import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import { existsSync, writeFileSync, copyFileSync, unlinkSync } from 'fs'
import { JustTCG } from 'justtcg-js'
import { TTLCache } from './cache'

// ─── JustTCG Client ─────────────────────────────────────────────────────────
let jtcg: JustTCG | null = null

// ─── API Caches ─────────────────────────────────────────────────────────────
const cardSearchCache = new TTLCache<unknown>()
const sealedSearchCache = new TTLCache<unknown>()
const setNumberCache = new TTLCache<unknown>()
const batchRefreshCache = new TTLCache<unknown>()

const SEARCH_TTL_MS = 30 * 60 * 1000 // 30 min
const SET_NUMBER_TTL_MS = 24 * 60 * 60 * 1000 // 24 h
const BATCH_TTL_MS = 5 * 60 * 1000 // 5 min

function batchCacheKey(variantIds: string[]): string {
  return Array.from(new Set(variantIds)).sort().join('|')
}

function initJustTCG(): void {
  const apiKey = process.env.JUSTTCG_API_KEY
  if (!apiKey) {
    console.warn('[JustTCG] JUSTTCG_API_KEY not set — price features disabled')
    return
  }
  jtcg = new JustTCG({ apiKey })
  console.log('[JustTCG] Client initialized')
}

// ─── Database Setup ─────────────────────────────────────────────────────────
let db: Database.Database

function initDatabase(): void {
  const dbPath = join(app.getPath('userData'), 'tcbudget.db')
  db = new Database(dbPath)

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY,
      card_id TEXT,
      name TEXT NOT NULL,
      set_name TEXT,
      set_id TEXT,
      card_number TEXT,
      rarity TEXT,
      image_url TEXT,
      purchase_price REAL DEFAULT 0,
      purchase_date TEXT,
      quantity INTEGER DEFAULT 1,
      condition TEXT DEFAULT 'Raw',
      market_price REAL DEFAULT 0,
      last_updated TEXT,
      is_sold INTEGER DEFAULT 0,
      sale_price REAL DEFAULT 0,
      sale_date TEXT,
      notes TEXT DEFAULT '',
      item_type TEXT DEFAULT 'Card',
      parent_id TEXT,
      is_opened INTEGER DEFAULT 0,
      variant_id TEXT
    )
  `)

  try {
    db.exec(`ALTER TABLE inventory ADD COLUMN item_type TEXT DEFAULT 'Card'`)
  } catch (err) {
    // Column might already exist
  }

  try {
    db.exec(`ALTER TABLE inventory ADD COLUMN parent_id TEXT`)
  } catch (err) {
    // Column might already exist
  }

  try {
    db.exec(`ALTER TABLE inventory ADD COLUMN is_opened INTEGER DEFAULT 0`)
  } catch (err) {
    // Column might already exist
  }

  try {
    db.exec(`ALTER TABLE inventory ADD COLUMN variant_id TEXT`)
  } catch (err) {
    // Column might already exist
  }

  try {
    db.exec(`ALTER TABLE inventory ADD COLUMN price_change_baseline REAL`)
  } catch (err) {
    // Column might already exist
  }

  try {
    db.exec(`ALTER TABLE inventory ADD COLUMN is_kept INTEGER DEFAULT 0`)
  } catch (err) {
    // Column might already exist
  }
}

// ─── IPC Handlers ───────────────────────────────────────────────────────────
function setupIPC(): void {
  // Get all inventory items
  ipcMain.handle('db:getAll', () => {
    const stmt = db.prepare('SELECT * FROM inventory ORDER BY rowid DESC')
    return stmt.all()
  })

  // Insert a new card or item
  ipcMain.handle('db:insert', (_event, card: Record<string, unknown>) => {
    const id = card.id || uuidv4()
    const stmt = db.prepare(`
      INSERT INTO inventory (id, card_id, name, set_name, set_id, card_number, rarity, image_url, purchase_price, purchase_date, quantity, condition, market_price, last_updated, is_sold, sale_price, sale_date, notes, item_type, parent_id, is_opened, variant_id, price_change_baseline, is_kept)
      VALUES (@id, @card_id, @name, @set_name, @set_id, @card_number, @rarity, @image_url, @purchase_price, @purchase_date, @quantity, @condition, @market_price, @last_updated, @is_sold, @sale_price, @sale_date, @notes, @item_type, @parent_id, @is_opened, @variant_id, @price_change_baseline, @is_kept)
    `)

    const now = new Date().toISOString()
    stmt.run({
      id,
      card_id: card.card_id || '',
      name: card.name || '',
      set_name: card.set_name || '',
      set_id: card.set_id || '',
      card_number: card.card_number || '',
      rarity: card.rarity || '',
      image_url: card.image_url || '',
      purchase_price: card.purchase_price || 0,
      purchase_date: card.purchase_date || now.split('T')[0],
      quantity: card.quantity || 1,
      condition: card.condition || 'Raw',
      market_price: card.market_price || 0,
      last_updated: now,
      is_sold: card.is_sold || 0,
      sale_price: card.sale_price || 0,
      sale_date: card.sale_date || '',
      notes: card.notes || '',
      item_type: card.item_type || 'Card',
      parent_id: card.parent_id || null,
      is_opened: card.is_opened || 0,
      variant_id: card.variant_id || null,
      price_change_baseline: card.price_change_baseline ?? card.market_price ?? 0,
      is_kept: card.is_kept || 0
    })

    return { id, ...card }
  })

  // Update a card field
  ipcMain.handle('db:update', (_event, id: string, field: string, value: unknown) => {
    // Whitelist allowed fields to prevent SQL injection
    const allowedFields = [
      'purchase_price', 'purchase_date', 'quantity', 'condition',
      'market_price', 'is_sold', 'sale_price', 'sale_date', 'notes',
      'name', 'set_name', 'last_updated', 'item_type', 'parent_id', 'is_opened', 'variant_id',
      'price_change_baseline', 'is_kept'
    ]

    if (!allowedFields.includes(field)) {
      throw new Error(`Field "${field}" is not allowed to be updated`)
    }

    const stmt = db.prepare(`UPDATE inventory SET ${field} = ?, last_updated = ? WHERE id = ?`)
    const now = new Date().toISOString()
    stmt.run(value, now, id)
    return { success: true }
  })

  // Delete a card
  ipcMain.handle('db:delete', (_event, id: string) => {
    const stmt = db.prepare('DELETE FROM inventory WHERE id = ?')
    stmt.run(id)
    return { success: true }
  })

  // Export to CSV
  ipcMain.handle('db:exportCsv', () => {
    const rows = db.prepare('SELECT * FROM inventory').all() as Record<string, unknown>[]
    if (rows.length === 0) return { success: false, message: 'No data to export' }

    const headers = Object.keys(rows[0])
    const csvContent = [
      headers.join(','),
      ...rows.map(row =>
        headers.map(h => {
          const val = row[h]
          const str = val === null || val === undefined ? '' : String(val)
          return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str
        }).join(',')
      )
    ].join('\n')

    const filePath = join(app.getPath('documents'), `tcbudget-export-${Date.now()}.csv`)
    writeFileSync(filePath, csvContent, 'utf-8')
    shell.showItemInFolder(filePath)
    return { success: true, path: filePath }
  })

  // Export DB file — copies the live SQLite DB to a user-chosen path.
  // Use this to back up or move data to another device.
  ipcMain.handle('db:exportDb', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, message: 'Window not found' }

    const today = new Date().toISOString().split('T')[0]
    const result = await dialog.showSaveDialog(win, {
      title: 'Export Database',
      defaultPath: `tcbudget-${today}.db`,
      filters: [{ name: 'TCBudget Database', extensions: ['db'] }]
    })

    if (result.canceled || !result.filePath) {
      return { success: false, message: 'Cancelled' }
    }

    try {
      // Flush WAL into the main file so the copy is a complete, standalone DB.
      db.pragma('wal_checkpoint(TRUNCATE)')
      const dbPath = join(app.getPath('userData'), 'tcbudget.db')
      copyFileSync(dbPath, result.filePath)
      shell.showItemInFolder(result.filePath)
      return { success: true, path: result.filePath }
    } catch (err: any) {
      console.error('[db:exportDb]', err?.message)
      return { success: false, message: err?.message ?? 'Export failed' }
    }
  })

  // Import DB file — replaces the current database with a chosen .db file.
  // Backs up the current DB first so the action is recoverable.
  ipcMain.handle('db:importDb', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, message: 'Window not found' }

    const open = await dialog.showOpenDialog(win, {
      title: 'Import Database',
      properties: ['openFile'],
      filters: [{ name: 'TCBudget Database', extensions: ['db'] }]
    })

    if (open.canceled || open.filePaths.length === 0) {
      return { success: false, message: 'Cancelled' }
    }

    const sourcePath = open.filePaths[0]
    const dbPath = join(app.getPath('userData'), 'tcbudget.db')

    if (sourcePath === dbPath) {
      return { success: false, message: 'Cannot import the active database file' }
    }

    // Validate the source is a TCBudget DB before touching anything.
    try {
      const testDb = new Database(sourcePath, { readonly: true, fileMustExist: true })
      try {
        testDb.prepare('SELECT id FROM inventory LIMIT 1').get()
      } finally {
        testDb.close()
      }
    } catch (err: any) {
      return { success: false, message: `Not a valid TCBudget database: ${err?.message ?? 'unknown error'}` }
    }

    const confirm = await dialog.showMessageBox(win, {
      type: 'warning',
      title: 'Replace current data?',
      message: 'Importing will replace your current collection with the selected database.',
      detail: 'Your current data will be backed up automatically before being replaced.',
      buttons: ['Cancel', 'Replace'],
      defaultId: 0,
      cancelId: 0
    })

    if (confirm.response !== 1) {
      return { success: false, message: 'Cancelled' }
    }

    const backupPath = join(app.getPath('userData'), `tcbudget-backup-${Date.now()}.db`)

    try {
      // Snapshot current DB before swapping it out.
      db.pragma('wal_checkpoint(TRUNCATE)')
      copyFileSync(dbPath, backupPath)
      db.close()

      // Remove leftover WAL/SHM that belong to the old DB before copying the new one in.
      const walPath = dbPath + '-wal'
      const shmPath = dbPath + '-shm'
      if (existsSync(walPath)) unlinkSync(walPath)
      if (existsSync(shmPath)) unlinkSync(shmPath)

      copyFileSync(sourcePath, dbPath)

      db = new Database(dbPath)
      db.pragma('journal_mode = WAL')

      return { success: true, backupPath }
    } catch (err: any) {
      console.error('[db:importDb]', err?.message)
      // Try to recover by reopening whatever DB file is currently in place.
      try {
        db = new Database(dbPath)
        db.pragma('journal_mode = WAL')
      } catch (reopenErr) {
        console.error('[db:importDb] reopen failed', reopenErr)
      }
      return { success: false, message: err?.message ?? 'Import failed' }
    }
  })

  // Bulk insert (for seeding mock data)
  ipcMain.handle('db:bulkInsert', (_event, cards: Record<string, unknown>[]) => {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO inventory (id, card_id, name, set_name, set_id, card_number, rarity, image_url, purchase_price, purchase_date, quantity, condition, market_price, last_updated, is_sold, sale_price, sale_date, notes, item_type, parent_id, is_opened, variant_id, price_change_baseline, is_kept)
      VALUES (@id, @card_id, @name, @set_name, @set_id, @card_number, @rarity, @image_url, @purchase_price, @purchase_date, @quantity, @condition, @market_price, @last_updated, @is_sold, @sale_price, @sale_date, @notes, @item_type, @parent_id, @is_opened, @variant_id, @price_change_baseline, @is_kept)
    `)

    const insertMany = db.transaction((items: Record<string, unknown>[]) => {
      const now = new Date().toISOString()
      for (const card of items) {
        stmt.run({
          id: card.id || uuidv4(),
          card_id: card.card_id || '',
          name: card.name || '',
          set_name: card.set_name || '',
          set_id: card.set_id || '',
          card_number: card.card_number || '',
          rarity: card.rarity || '',
          image_url: card.image_url || '',
          purchase_price: card.purchase_price || 0,
          purchase_date: card.purchase_date || now.split('T')[0],
          quantity: card.quantity || 1,
          condition: card.condition || 'Raw',
          market_price: card.market_price || 0,
          last_updated: now,
          is_sold: card.is_sold || 0,
          sale_price: card.sale_price || 0,
          sale_date: card.sale_date || '',
          notes: card.notes || '',
          item_type: card.item_type || 'Card',
          parent_id: card.parent_id || null,
          is_opened: card.is_opened || 0,
          variant_id: card.variant_id || null,
          price_change_baseline: card.price_change_baseline ?? card.market_price ?? 0,
          is_kept: card.is_kept || 0
        })
      }
    })

    insertMany(cards)
    return { success: true, count: cards.length }
  })

  // Get count
  ipcMain.handle('db:getCount', () => {
    const row = db.prepare('SELECT COUNT(*) as count FROM inventory').get() as { count: number }
    return row.count
  })

  // ─── Window title-bar overlay color ─────────────────────────────────────
  // Lets the renderer recolor the native title bar so the overlay's
  // min/maximize/close controls don't clash with whatever is on screen
  // (e.g. the dark pack-opening overlay).
  ipcMain.handle('window:setTitleBarOverlay', (event, opts: { color?: string; symbolColor?: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || process.platform !== 'win32') return { success: false }
    try {
      win.setTitleBarOverlay({
        color: opts.color ?? '#F3F4F6',
        symbolColor: opts.symbolColor ?? '#111827',
        height: 40
      })
      return { success: true }
    } catch (err: any) {
      console.error('[window:setTitleBarOverlay]', err?.message)
      return { success: false }
    }
  })

  // ─── JustTCG IPC ────────────────────────────────────────────────────────

  // Search cards by name query — returns Card[] from JustTCG
  ipcMain.handle('justtcg:search', async (_event, query: string) => {
    if (!jtcg) return { error: 'API key not configured', data: [] }

    const normalized = query.trim().toLowerCase().replace(/\s+/g, ' ')

    const cached = cardSearchCache.get(normalized)
    if (cached) {
      console.log(`[Cache HIT] Card search: "${normalized}"`)
      return cached
    }

    try {
      const result = await jtcg.v1.cards.search(query, { game: 'Pokemon', limit: 20 })
      const response = { data: result.data ?? [], usage: result.usage }
      cardSearchCache.set(normalized, response, SEARCH_TTL_MS)
      console.log(`[Cache MISS] Card search: "${normalized}" — cached for 30min`)
      return response
    } catch (err: any) {
      console.error('[JustTCG] search error:', err?.message)
      return { error: err?.message ?? 'Search failed', data: [] }
    }
  })

  // Look up a single card by set + number (used when adding from sealed product opening)
  ipcMain.handle('justtcg:getBySetNumber', async (_event, set: string, number: string) => {
    if (!jtcg) return { error: 'API key not configured', data: [] }

    const cacheKey = `${set.toLowerCase()}:${number.toLowerCase()}`

    const cached = setNumberCache.get(cacheKey)
    if (cached) {
      console.log(`[Cache HIT] Set/number lookup: ${cacheKey}`)
      return cached
    }

    try {
      const result = await jtcg.v1.cards.get({ game: 'Pokemon', set, number })
      const response = { data: result.data ?? [], usage: result.usage }
      setNumberCache.set(cacheKey, response, SET_NUMBER_TTL_MS)
      console.log(`[Cache MISS] Set/number lookup: ${cacheKey} — cached for 24h`)
      return response
    } catch (err: any) {
      console.error('[JustTCG] getBySetNumber error:', err?.message)
      return { error: err?.message ?? 'Lookup failed', data: [] }
    }
  })

  // Search sealed products — sealed items are cards with condition 'Sealed' in JustTCG
  ipcMain.handle('justtcg:searchSealed', async (_event, query: string) => {
    if (!jtcg) return { error: 'API key not configured', data: [] }

    const normalized = query.trim().toLowerCase().replace(/\s+/g, ' ')

    if (!normalized) {
      console.log('[Skip] Sealed search: empty query')
      return { data: [] }
    }

    const cached = sealedSearchCache.get(normalized)
    if (cached) {
      console.log(`[Cache HIT] Sealed search: "${normalized}"`)
      return cached
    }

    try {
      const result = await jtcg.v1.cards.search(query, {
        game: 'Pokemon',
        limit: 20,
        condition: ['Sealed'],
      })
      const response = { data: result.data ?? [] }
      sealedSearchCache.set(normalized, response, SEARCH_TTL_MS)
      console.log(`[Cache MISS] Sealed search: "${normalized}" — cached for 30min`)
      return response
    } catch (err: any) {
      console.error('[JustTCG] searchSealed error:', err?.message)
      return { error: err?.message ?? 'Search failed', data: [] }
    }
  })

  // Batch price refresh — accepts array of variantIds, returns updated Card[]
  ipcMain.handle('justtcg:batchRefresh', async (_event, variantIds: string[]) => {
    if (!jtcg || variantIds.length === 0) return { data: [] }

    const cacheKey = batchCacheKey(variantIds)

    const cached = batchRefreshCache.get(cacheKey)
    if (cached) {
      console.log(`[Cache HIT] Batch refresh: ${variantIds.length} variants`)
      return cached
    }

    try {
      // Batch in chunks of 100 (Pro/Starter limit)
      const chunks: string[][] = []
      for (let i = 0; i < variantIds.length; i += 100) {
        chunks.push(variantIds.slice(i, i + 100))
      }
      const allCards: unknown[] = []
      for (const chunk of chunks) {
        const items = chunk.map(id => ({ variantId: id }))
        const result = await jtcg.v1.cards.getByBatch(items)
        allCards.push(...(result.data ?? []))
      }
      const response = { data: allCards }
      batchRefreshCache.set(cacheKey, response, BATCH_TTL_MS)
      console.log(`[Cache MISS] Batch refresh: ${variantIds.length} variants — cached for 5min`)
      return response
    } catch (err: any) {
      console.error('[JustTCG] batchRefresh error:', err?.message)
      return { error: err?.message ?? 'Batch refresh failed', data: [] }
    }
  })
}

// ─── Window Creation ────────────────────────────────────────────────────────
function getWindowsIconPath(): string | undefined {
  if (process.platform !== 'win32') return undefined

  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'icon.ico')
    : join(app.getAppPath(), 'build', 'icon.ico')

  return existsSync(iconPath) ? iconPath : undefined
}

function getMacIconPath(): string | undefined {
  if (process.platform !== 'darwin') return undefined

  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'icon.icns')
    : join(app.getAppPath(), 'build', 'icon.png')

  return existsSync(iconPath) ? iconPath : undefined
}

function createWindow(): void {
  const windowsIconPath = getWindowsIconPath()
  const isMac = process.platform === 'darwin'
  const isWindows = process.platform === 'win32'

  let mainWindow: BrowserWindow
  try {
    mainWindow = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 1024,
      minHeight: 700,
      show: false,
      backgroundColor: '#F3F4F6',
      titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
      ...(isWindows && {
        titleBarOverlay: {
          color: '#F3F4F6',
          symbolColor: '#111827',
          height: 40
        }
      }),
      ...(isMac && {
        trafficLightPosition: { x: 16, y: 14 }
      }),
      icon: windowsIconPath,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })
  } catch (err: any) {
    console.error('[Main] Failed to create custom window, falling back:', err?.message ?? err)
    mainWindow = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 1024,
      minHeight: 700,
      show: false,
      backgroundColor: '#F3F4F6',
      icon: windowsIconPath,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Safety net: if ready-to-show never fires (renderer crash), force-show after 5s
  // so the user at least sees an error instead of an invisible app.
  const showTimeout = setTimeout(() => {
    if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      console.warn('[Main] ready-to-show did not fire within 5 s — force-showing window')
      mainWindow.show()
    }
  }, 5000)

  mainWindow.on('ready-to-show', () => clearTimeout(showTimeout))

  // Log renderer-side crashes so we can debug invisible-window issues.
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('[Main] Renderer process gone:', details.reason, details.exitCode)
  })
  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('[Main] Failed to load renderer:', code, desc)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Load the renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ─── App Lifecycle ──────────────────────────────────────────────────────────
app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.tcbudget')

  const macIconPath = getMacIconPath()
  if (macIconPath && process.platform === 'darwin') {
    try {
      app.dock?.setIcon(macIconPath)
    } catch (err: any) {
      console.error('[Main] Failed to set dock icon:', err?.message ?? err)
    }
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  initDatabase()
  initJustTCG()
  setupIPC()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Close the database only when the app is actually quitting,
// NOT on window-all-closed — on macOS the app stays alive in the dock
// and reopening it would hit a closed DB, causing a silent crash.
app.on('before-quit', () => {
  if (db) {
    try { db.close() } catch { /* already closed */ }
  }
})
