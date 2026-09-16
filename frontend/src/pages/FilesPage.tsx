import { useMemo, useRef, useState } from 'react'
import {
  ChevronRight,
  CornerLeftUp,
  Download,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileText,
  FileVideo,
  File,
  FolderPlus,
  Folder,
  HardDrive,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useVault } from '../stores/vault'
import { useAuth } from '../stores/auth'
import { toast } from '../stores/toast'
import { EmptyState, formatBytes, formatDate, Modal, Spinner } from '../components/ui'
import type { FileItem, FolderItem } from '../lib/types'

function FileIcon({ mime, className = 'h-7 w-7' }: { mime: string; className?: string }) {
  if (mime.startsWith('image/')) return <FileImage className={className} />
  if (mime.startsWith('video/')) return <FileVideo className={className} />
  if (mime.startsWith('audio/')) return <FileAudio className={className} />
  if (mime.includes('pdf') || mime.startsWith('text/')) return <FileText className={className} />
  if (mime.includes('zip') || mime.includes('compressed')) return <FileArchive className={className} />
  if (mime.includes('json') || mime.includes('javascript')) return <FileCode className={className} />
  return <File className={className} />
}

function iconStyle(mime: string): string {
  if (mime.startsWith('image/')) return 'border-pink-500/20 bg-pink-500/10 text-pink-400'
  if (mime.startsWith('video/')) return 'border-rose-500/20 bg-rose-500/10 text-rose-400'
  if (mime.startsWith('audio/')) return 'border-orange-500/20 bg-orange-500/10 text-orange-400'
  if (mime.includes('pdf') || mime.startsWith('text/')) return 'border-indigo-500/20 bg-indigo-500/10 text-indigo-400'
  if (mime.includes('zip') || mime.includes('compressed')) return 'border-amber-500/20 bg-amber-500/10 text-amber-400'
  return 'border-blue-500/20 bg-blue-500/10 text-blue-400'
}

export default function FilesPage() {
  const files = useVault((state) => state.files)
  const folders = useVault((state) => state.fileFolders)
  const ready = useVault((state) => state.ready)
  const uploadFile = useVault((state) => state.uploadFile)
  const retryUpload = useVault((state) => state.retryUpload)
  const uploadAbort = useVault((state) => state.uploadAbort)
  const user = useAuth((state) => state.user)
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [currentFolder, setCurrentFolder] = useState<string | null>(null)
  const [folderModalOpen, setFolderModalOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [moveTarget, setMoveTarget] = useState<FileItem | null>(null)
  const [confirmTrash, setConfirmTrash] = useState<{ kind: 'file' | 'folder'; id: string; name: string } | null>(null)

  const activeFiles = useMemo(
    () =>
      Object.values(files)
        .filter((file) => !file.deletedAt && file.folder === currentFolder)
        .sort((a, b) => b.plain.uploaded - a.plain.uploaded),
    [files, currentFolder],
  )

  const activeFolders = useMemo(
    () =>
      Object.values(folders)
        .filter((folder) => !folder.deletedAt && folder.parent === currentFolder)
        .sort((a, b) => a.plain.name.localeCompare(b.plain.name)),
    [folders, currentFolder],
  )

  const breadcrumbs = useMemo(() => {
    const crumbs: { id: string; name: string }[] = []
    let current = currentFolder ? folders[currentFolder] : undefined
    while (current) {
      crumbs.unshift({ id: current.id, name: current.plain.name })
      current = current.parent ? folders[current.parent] : undefined
    }
    return crumbs
  }, [currentFolder, folders])

  const countFolderItems = (folderId: string) =>
    Object.values(folders).filter((folder) => !folder.deletedAt && folder.parent === folderId).length +
    Object.values(files).filter((file) => !file.deletedAt && file.folder === folderId).length

  const used = user?.storage_used ?? 0
  const limit = user?.storage_limit ?? 1
  const pct = Math.min(100, (used / limit) * 100)

  const startUpload = async (list: FileList | File[]) => {
    for (const file of Array.from(list)) {
      try {
        await uploadFile(file, currentFolder)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'upload failed')
      }
    }
  }

  if (!ready) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Spinner className="h-6 w-6 text-blue-400" />
      </div>
    )
  }

  return (
    <section className="animate-fadeIn">
      <div className="glass mb-4 flex flex-col gap-3 p-4 shadow-xl sm:flex-row sm:items-center">
        <div className="flex w-full items-center gap-2.5 sm:w-auto sm:flex-1">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/15 text-blue-400">
            <HardDrive className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex justify-between text-[11px] text-zinc-400">
              <span>encrypted storage</span>
              <span className="font-mono">
                {formatBytes(used)} / {formatBytes(limit)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-400 transition-[width]"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>
        <button
          className="btn-warn shrink-0"
          onClick={() => {
            setNewFolderName('')
            setFolderModalOpen(true)
          }}
        >
          <FolderPlus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">New Folder</span>
        </button>
        <button className="btn-primary shrink-0" onClick={() => inputRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" />
          upload
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files) void startUpload(event.target.files)
            event.target.value = ''
          }}
        />
      </div>

      <div className="glass overflow-y-auto border-white/10 bg-zinc-900/30 p-4 sm:p-6">
        <div className="scrollbar-none mb-4 flex items-center gap-1.5 overflow-x-auto text-xs">
          <button
            onClick={() => setCurrentFolder(null)}
            className={`shrink-0 cursor-pointer rounded-lg px-2 py-1 transition hover:text-blue-400 ${
              currentFolder === null ? 'font-semibold text-white' : 'text-zinc-400'
            }`}
          >
            <Folder className="mr-1 inline h-3 w-3" />
            root
          </button>
          {breadcrumbs.map((crumb, index) => (
            <span key={crumb.id} className="flex shrink-0 items-center gap-1">
              <ChevronRight className="h-3 w-3 text-zinc-600" />
              <button
                onClick={() => setCurrentFolder(crumb.id)}
                className={`max-w-[120px] truncate cursor-pointer rounded px-2 py-1 transition hover:text-blue-400 ${
                  index === breadcrumbs.length - 1 ? 'font-semibold text-white' : 'text-zinc-400'
                }`}
              >
                {crumb.name}
              </button>
            </span>
          ))}
          {currentFolder ? (
            <button
              onClick={() => setCurrentFolder(folders[currentFolder]?.parent ?? null)}
              title="go to parent folder"
              className="ml-auto shrink-0 cursor-pointer rounded-lg border border-white/10 bg-white/5 p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
            >
              <CornerLeftUp className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <div
          onDragOver={(event) => {
            event.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragOver(false)
            if (event.dataTransfer.files.length > 0) void startUpload(event.dataTransfer.files)
          }}
          className={`mb-5 rounded-2xl border-2 border-dashed p-6 text-center text-sm transition ${
            dragOver
              ? 'border-indigo-400/60 bg-indigo-500/10 text-indigo-200'
              : 'border-white/10 text-zinc-500'
          }`}
        >
          drop files here — they are encrypted in your browser before upload
        </div>

        {activeFolders.length === 0 && activeFiles.length === 0 ? (
          <EmptyState
            icon={<HardDrive className="h-8 w-8" />}
            title="nothing here yet"
            hint="upload a file or create a folder — the server only stores ciphertext"
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-4">
            {activeFolders.map((folder) => (
              <FolderCard
                key={folder.id}
                folder={folder}
                count={countFolderItems(folder.id)}
                onOpen={() => setCurrentFolder(folder.id)}
                onTrash={() =>
                  setConfirmTrash({ kind: 'folder', id: folder.id, name: folder.plain.name })
                }
              />
            ))}
            {activeFiles.map((file) => (
              <FileCard
                key={file.id}
                file={file}
                busy={busyIds.has(file.id)}
                onBusyChange={(busy) =>
                  setBusyIds((prev) => {
                    const next = new Set(prev)
                    if (busy) next.add(file.id)
                    else next.delete(file.id)
                    return next
                  })
                }
                onRetry={retryUpload}
                onAbort={uploadAbort}
                onMove={() => setMoveTarget(file)}
                onTrash={() => setConfirmTrash({ kind: 'file', id: file.id, name: file.plain.name })}
              />
            ))}
          </div>
        )}
      </div>

      {folderModalOpen ? (
        <Modal
          title="Create new folder"
          subtitle="nested inside current directory"
          icon={
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-400">
              <FolderPlus className="h-5 w-5" />
            </div>
          }
          onClose={() => setFolderModalOpen(false)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault()
              useVault.getState().createFileFolder(currentFolder, newFolderName.trim() || 'New Folder')
              setFolderModalOpen(false)
            }}
          >
            <input
              autoFocus
              className="input mb-4"
              placeholder="folder name (e.g. documents, photos)"
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
            />
            <div className="flex items-center justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setFolderModalOpen(false)}>
                cancel
              </button>
              <button type="submit" className="btn bg-amber-400 text-black shadow-lg shadow-amber-400/20 hover:bg-amber-300">
                create folder
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {moveTarget ? (
        <MoveFileModal
          file={moveTarget}
          folders={folders}
          onClose={() => setMoveTarget(null)}
        />
      ) : null}

      {confirmTrash ? (
        <Modal
          title={`Delete "${confirmTrash.name}"?`}
          subtitle={
            confirmTrash.kind === 'folder'
              ? 'folders and files inside will move to trash too'
              : 'the file will move to trash'
          }
          icon={
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/25 bg-red-500/10 text-red-400">
              <Trash2 className="h-5 w-5" />
            </div>
          }
          onClose={() => setConfirmTrash(null)}
        >
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setConfirmTrash(null)}>
              cancel
            </button>
            <button
              className="btn-danger"
              onClick={async () => {
                const target = confirmTrash
                setConfirmTrash(null)
                try {
                  if (target.kind === 'folder') {
                    await useVault.getState().trashFileFolder(target.id)
                    if (currentFolder === target.id) setCurrentFolder(null)
                  } else {
                    await useVault.getState().trashItem('files', target.id)
                  }
                } catch {
                  toast.error('failed to delete')
                }
              }}
            >
              delete
            </button>
          </div>
        </Modal>
      ) : null}
    </section>
  )
}

function FolderCard({
  folder,
  count,
  onOpen,
  onTrash,
}: {
  folder: FolderItem
  count: number
  onOpen: () => void
  onTrash: () => void
}) {
  return (
    <div
      onClick={onOpen}
      className="glass-soft group flex cursor-pointer flex-col gap-2.5 p-4 transition hover:border-white/20"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-400">
          <Folder className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-100" title={folder.plain.name}>
            {folder.plain.name}
          </p>
          <p className="text-[11px] text-zinc-500">{count} items</p>
        </div>
        <button
          className="shrink-0 cursor-pointer rounded-md p-1 text-zinc-500 opacity-0 transition hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100 no-hover:opacity-100"
          title="move to trash"
          onClick={(event) => {
            event.stopPropagation()
            onTrash()
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

function MoveFileModal({
  file,
  folders,
  onClose,
}: {
  file: FileItem
  folders: Record<string, FolderItem>
  onClose: () => void
}) {
  const moveFile = useVault((state) => state.moveFile)
  const options = Object.values(folders).filter((folder) => !folder.deletedAt)
  return (
    <Modal
      title={`Move "${file.plain.name}"`}
      subtitle="choose a destination folder"
      icon={
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-400">
          <Folder className="h-5 w-5" />
        </div>
      }
      onClose={onClose}
    >
      <select
        autoFocus
        className="input mb-4 cursor-pointer"
        defaultValue={file.folder ?? ''}
        onChange={(event) => {
          moveFile(file.id, event.target.value || null)
          onClose()
        }}
      >
        <option className="input-option" value="">
          root
        </option>
        {options.map((folder) => (
          <option className="input-option" key={folder.id} value={folder.id}>
            {folder.plain.name}
          </option>
        ))}
      </select>
      <p className="text-[11px] text-zinc-500">selecting a destination moves the file immediately</p>
    </Modal>
  )
}

function FileCard({
  file,
  busy,
  onBusyChange,
  onRetry,
  onAbort,
  onMove,
  onTrash,
}: {
  file: FileItem
  busy: boolean
  onBusyChange: (busy: boolean) => void
  onRetry: (id: string) => Promise<void>
  onAbort: (id: string) => Promise<void>
  onMove: () => void
  onTrash: () => void
}) {
  const download = async () => {
    onBusyChange(true)
    try {
      await useVault.getState().downloadFile(file.id)
    } catch {
      toast.error('download failed')
    } finally {
      onBusyChange(false)
    }
  }

  return (
    <div className="glass-soft group flex flex-col gap-2.5 p-4">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${iconStyle(file.plain.mime)}`}
        >
          <FileIcon mime={file.plain.mime} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-100" title={file.plain.name}>
            {file.plain.name}
          </p>
          <p className="text-[11px] text-zinc-500">
            {formatBytes(file.plain.size)} ·{' '}
            {formatDate(new Date(file.plain.uploaded).toISOString())}
          </p>
        </div>
        {!file.uploadError ? (
          <div className="flex shrink-0 gap-0.5">
            <button
              className="cursor-pointer rounded-md p-1 text-zinc-500 opacity-0 transition hover:bg-indigo-500/20 hover:text-indigo-400 group-hover:opacity-100 no-hover:opacity-100"
              title="move to folder"
              disabled={file.uploadProgress !== null}
              onClick={onMove}
            >
              <Folder className="h-3.5 w-3.5" />
            </button>
            <button
              className="cursor-pointer rounded-md p-1 text-zinc-500 opacity-0 transition hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100 no-hover:opacity-100"
              title="move to trash"
              disabled={file.uploadProgress !== null}
              onClick={onTrash}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </div>

      {file.uploadProgress !== null ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-400 transition-[width]"
                style={{ width: `${file.uploadProgress}%` }}
              />
        </div>
      ) : null}

      {file.uploadError ? (
        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-red-300">
          <X className="mt-0.5 h-3 w-3 shrink-0" />
          {file.uploadError}
        </p>
      ) : null}

      <div className="mt-auto flex gap-2">
        {file.uploadError ? (
          <>
            <button
              className="btn-ghost flex-1 px-2 py-1.5 text-xs"
              onClick={async () => {
                try {
                  await onRetry(file.id)
                  toast.success('upload complete')
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'retry failed')
                }
              }}
            >
              <RefreshCw className="h-3 w-3" />
              retry
            </button>
            <button
              className="btn-danger px-2 py-1.5 text-xs"
              onClick={async () => {
                await onAbort(file.id).catch(() => undefined)
              }}
            >
              remove
            </button>
          </>
        ) : (
          <button
            className="btn-ghost w-full px-2 py-1.5 text-xs"
            disabled={!file.stored || file.uploadProgress !== null}
            onClick={() => void download()}
          >
            {busy ? (
              <Spinner className="h-3 w-3" />
            ) : (
              <Download className="h-3 w-3" />
            )}
            {busy ? 'decrypting…' : 'download'}
          </button>
        )}
      </div>
    </div>
  )
}
