import { contextBridge, ipcRenderer } from 'electron'

export interface ElectronAPI {
  db: {
    getAll: () => Promise<Record<string, unknown>[]>
    insert: (card: Record<string, unknown>) => Promise<Record<string, unknown>>
    update: (id: string, field: string, value: unknown) => Promise<{ success: boolean }>
    delete: (id: string) => Promise<{ success: boolean }>
    exportCsv: () => Promise<{ success: boolean; path?: string; message?: string }>
    bulkInsert: (cards: Record<string, unknown>[]) => Promise<{ success: boolean; count: number }>
    getCount: () => Promise<number>
  }
}

const api: ElectronAPI = {
  db: {
    getAll: () => ipcRenderer.invoke('db:getAll'),
    insert: (card) => ipcRenderer.invoke('db:insert', card),
    update: (id, field, value) => ipcRenderer.invoke('db:update', id, field, value),
    delete: (id) => ipcRenderer.invoke('db:delete', id),
    exportCsv: () => ipcRenderer.invoke('db:exportCsv'),
    bulkInsert: (cards) => ipcRenderer.invoke('db:bulkInsert', cards),
    getCount: () => ipcRenderer.invoke('db:getCount')
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
