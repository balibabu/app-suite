export interface Tokens {
  access: string
  refresh: string
}

export interface Me {
  id: string
  username: string
  identity_public_key: string
  wrapped_private_key: string
  storage_used: number
  storage_limit: number
  date_joined: string
  last_login: string | null
}

export interface LoginResponse {
  server_proof: string
  user: Me
  session_id: string
  access: string
  refresh: string
}

export interface RefreshResponse {
  session_id: string
  access: string
  refresh: string
}

export interface WireItem {
  id: string
  content?: string
  meta_ciphertext?: string
  task_list?: string | null
  format_version: number
  item_version: number
  deleted_at: string | null
  created_at: string
  updated_at: string
  size?: number
  stored?: boolean
}

export interface SessionInfo {
  id: string
  device_name: string
  ip_address: string | null
  user_agent: string
  created_at: string
  last_used_at: string
  expires_at: string
  revoked_at: string | null
  current: boolean
}

export interface NotePlain {
  title: string
  body: string
  edited: number
}

export interface TaskPlain {
  title: string
  done: boolean
  notes: string
  due: string | null
}

export interface ListPlain {
  name: string
}

export interface FilePlain {
  name: string
  mime: string
  size: number
  uploaded: number
}

export type SyncState = 'synced' | 'pending' | 'error'

export interface VaultItem<P> {
  id: string
  plain: P
  formatVersion: number
  itemVersion: number
  deletedAt: string | null
  createdAt: string
  updatedAt: string
  sync: SyncState
}

export interface TaskItem extends VaultItem<TaskPlain> {
  taskList: string | null
}

export interface FileItem extends VaultItem<FilePlain> {
  stored: boolean
  serverSize: number
  uploadProgress: number | null
  uploadError: string | null
}

export type CollectionKey = 'notes' | 'lists' | 'tasks' | 'files'
