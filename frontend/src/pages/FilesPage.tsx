import { useMemo, useRef, useState } from 'react'
import { useVault } from '../stores/vault'
import { useAuth } from '../stores/auth'
import { toast } from '../stores/toast'
import { EmptyState, formatBytes, formatDate } from '../components/ui'

function fileIcon(mime: string): string {
  if (mime.startsWith('image/')) return '🖼'
  if (mime.startsWith('video/')) return '🎬'
  if (mime.startsWith('audio/')) return '🎵'
  if (mime.startsWith('text/')) return '📄'
  if (mime.includes('pdf')) return '📕'
  if (mime.includes('zip') || mime.includes('compressed')) return '🗜'
  return '📦'
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
    () => Object.values(files).filter((file) => !file.deletedAt).sort((a, b) => b.plain.uploaded - a.plain.uploaded),
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
    return <EmptyState icon="⏳" title="decrypting your files…" />
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-white/5 p-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex justify-between text-xs text-slate-500">
              <span>encrypted storage</span>
              <span>
                {formatBytes(used)} / {formatBytes(limit)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-400 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <button className="btn-primary" onClick={() => inputRef.current?.click()}>
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
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
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
          className={`mb-4 rounded-2xl border-2 border-dashed p-6 text-center text-sm transition ${
            dragOver ? 'border-indigo-400/60 bg-indigo-500/10 text-indigo-200' : 'border-white/10 text-slate-500'
          }`}
        >
          drop files here — they are encrypted in your browser before upload
        </div>
        {activeFiles.length === 0 ? (
          <EmptyState icon="🗂" title="no files yet" hint="upload something — the server only stores ciphertext" />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeFiles.map((file) => (
              <div key={file.id} className="glass-soft flex flex-col gap-2 p-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{fileIcon(file.plain.mime)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-100" title={file.plain.name}>
                      {file.plain.name}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {formatBytes(file.plain.size)} · {formatDate(new Date(file.plain.uploaded).toISOString())}
                    </p>
                  </div>
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
                  <p className="text-[11px] text-red-300">{file.uploadError}</p>
                ) : null}
                <div className="mt-auto flex gap-2">
                  {file.uploadError ? (
                    <>
                      <button
                        className="btn-ghost flex-1 px-2 py-1.5 text-xs"
                        onClick={async () => {
                          try {
                            await retryUpload(file.id)
                            toast.success('upload complete')
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : 'retry failed')
                          }
                        }}
                      >
                        retry
                      </button>
                      <button
                        className="btn-danger px-2 py-1.5 text-xs"
                        onClick={async () => {
                          await uploadAbort(file.id).catch(() => undefined)
                        }}
                      >
                        remove
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn-ghost flex-1 px-2 py-1.5 text-xs"
                        disabled={!file.stored || file.uploadProgress !== null}
                        onClick={async () => {
                          setBusyIds((prev) => new Set(prev).add(file.id))
                          try {
                            await useVault.getState().downloadFile(file.id)
                          } catch {
                            toast.error('download failed')
                          } finally {
                            setBusyIds((prev) => {
                              const next = new Set(prev)
                              next.delete(file.id)
                              return next
                            })
                          }
                        }}
                      >
                        {busyIds.has(file.id) ? 'decrypting…' : 'download'}
                      </button>
                      <button
                        className="btn-danger px-2 py-1.5 text-xs"
                        disabled={file.uploadProgress !== null}
                        onClick={async () => {
                          try {
                            await useVault.getState().trashItem('files', file.id)
                          } catch {
                            toast.error('failed to trash file')
                          }
                        }}
                      >
                        🗑
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
