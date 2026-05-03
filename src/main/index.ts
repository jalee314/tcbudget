import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import { writeFileSync } from 'fs'

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
      parent_id TEXT
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
      INSERT INTO inventory (id, card_id, name, set_name, set_id, card_number, rarity, image_url, purchase_price, purchase_date, quantity, condition, market_price, last_updated, is_sold, sale_price, sale_date, notes, item_type, parent_id)
      VALUES (@id, @card_id, @name, @set_name, @set_id, @card_number, @rarity, @image_url, @purchase_price, @purchase_date, @quantity, @condition, @market_price, @last_updated, @is_sold, @sale_price, @sale_date, @notes, @item_type, @parent_id)
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
      parent_id: card.parent_id || null
    })

    return { id, ...card }
  })

  // Update a card field
  ipcMain.handle('db:update', (_event, id: string, field: string, value: unknown) => {
    // Whitelist allowed fields to prevent SQL injection
    const allowedFields = [
      'purchase_price', 'purchase_date', 'quantity', 'condition',
      'market_price', 'is_sold', 'sale_price', 'sale_date', 'notes',
      'name', 'set_name', 'last_updated', 'item_type', 'parent_id'
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

  // Bulk insert (for seeding mock data)
  ipcMain.handle('db:bulkInsert', (_event, cards: Record<string, unknown>[]) => {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO inventory (id, card_id, name, set_name, set_id, card_number, rarity, image_url, purchase_price, purchase_date, quantity, condition, market_price, last_updated, is_sold, sale_price, sale_date, notes, item_type, parent_id)
      VALUES (@id, @card_id, @name, @set_name, @set_id, @card_number, @rarity, @image_url, @purchase_price, @purchase_date, @quantity, @condition, @market_price, @last_updated, @is_sold, @sale_price, @sale_date, @notes, @item_type, @parent_id)
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
          parent_id: card.parent_id || null
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
}

// ─── Window Creation ────────────────────────────────────────────────────────
function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#F3F4F6',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#F3F4F6',
      symbolColor: '#111827',
      height: 40
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
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

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  initDatabase()
  setupIPC()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (db) db.close()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
