import { contextBridge, ipcRenderer } from 'electron'

export interface ElectronAPI {
  db: {
    getAll: () => Promise<Record<string, unknown>[]>
    insert: (card: Record<string, unknown>) => Promise<Record<string, unknown>>
    update: (id: string, field: string, value: unknown) => Promise<{ success: boolean }>
    delete: (id: string) => Promise<{ success: boolean }>
    exportCsv: () => Promise<{ success: boolean; path?: string; message?: string }>
    exportDb: () => Promise<{ success: boolean; path?: string; message?: string }>
    importDb: () => Promise<{ success: boolean; backupPath?: string; message?: string }>
    bulkInsert: (cards: Record<string, unknown>[]) => Promise<{ success: boolean; count: number }>
    getCount: () => Promise<number>
  }
  justtcg: {
    search: (query: string) => Promise<{ data: unknown[]; usage?: unknown; error?: string }>
    searchSealed: (query: string) => Promise<{ data: unknown[]; error?: string }>
    getBySetNumber: (set: string, number: string) => Promise<{ data: unknown[]; usage?: unknown; error?: string }>
    batchRefresh: (variantIds: string[]) => Promise<{ data: unknown[]; error?: string }>
  }
  window: {
    setTitleBarOverlay: (opts: { color?: string; symbolColor?: string }) => Promise<{ success: boolean }>
  }
}

const api: ElectronAPI = {
  db: {
    getAll: () => ipcRenderer.invoke('db:getAll'),
    insert: (card) => ipcRenderer.invoke('db:insert', card),
    update: (id, field, value) => ipcRenderer.invoke('db:update', id, field, value),
    delete: (id) => ipcRenderer.invoke('db:delete', id),
    exportCsv: () => ipcRenderer.invoke('db:exportCsv'),
    exportDb: () => ipcRenderer.invoke('db:exportDb'),
    importDb: () => ipcRenderer.invoke('db:importDb'),
    bulkInsert: (cards) => ipcRenderer.invoke('db:bulkInsert', cards),
    getCount: () => ipcRenderer.invoke('db:getCount')
  },
  justtcg: {
    search: (query) => ipcRenderer.invoke('justtcg:search', query),
    searchSealed: (query) => ipcRenderer.invoke('justtcg:searchSealed', query),
    getBySetNumber: (set, number) => ipcRenderer.invoke('justtcg:getBySetNumber', set, number),
    batchRefresh: (variantIds) => ipcRenderer.invoke('justtcg:batchRefresh', variantIds)
  },
  window: {
    setTitleBarOverlay: (opts) => ipcRenderer.invoke('window:setTitleBarOverlay', opts)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electronAPI = api
}
