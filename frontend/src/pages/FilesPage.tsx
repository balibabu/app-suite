import { useMemo, useRef, useState } from 'react'
import {
  Download,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileText,
  FileVideo,
  File,
  HardDrive,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useVault } from '../stores/vault'
import { useAuth } from '../stores/auth'
import { toast } from '../stores/toast'
import { EmptyState, formatBytes, formatDate, Spinner } from '../components/ui'
import type { FileItem } from '../lib/types'

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
  const ready = useVault((state) => state.ready)
  const uploadFile = useVault((state) => state.uploadFile)
  const retryUpload = useVault((state) => state.retryUpload)
  const uploadAbort = useVault((state) => state.uploadAbort)
  const user = useAuth((state) => state.user)
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())

  const activeFiles = useMemo(
    () =>
      Object.values(files)
        .filter((file) => !file.deletedAt)
        .sort((a, b) => b.plain.uploaded - a.plain.uploaded),
    [files],
  )

  const used = user?.storage_used ?? 0
  const limit = user?.storage_limit ?? 1
  const pct = Math.min(100, (used / limit) * 100)

  const startUpload = async (list: FileList | File[]) => {
    for (const file of Array.from(list)) {
      try {
        await uploadFile(file)
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
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-400 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>
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

        {activeFiles.length === 0 ? (
          <EmptyState
            icon={<HardDrive className="h-8 w-8" />}
            title="no files yet"
            hint="upload something — the server only stores ciphertext"
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-4">
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
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function FileCard({
  file,
  busy,
  onBusyChange,
  onRetry,
  onAbort,
}: {
  file: FileItem
  busy: boolean
  onBusyChange: (busy: boolean) => void
  onRetry: (id: string) => Promise<void>
  onAbort: (id: string) => Promise<void>
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
          <button
            className="shrink-0 cursor-pointer rounded-md p-1 text-zinc-500 opacity-0 transition hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100 no-hover:opacity-100"
            title="move to trash"
            disabled={file.uploadProgress !== null}
            onClick={async () => {
              try {
                await useVault.getState().trashItem('files', file.id)
              } catch {
                toast.error('failed to trash file')
              }
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {file.uploadProgress !== null ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-400 transition-all"
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
