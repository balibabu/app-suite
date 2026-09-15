import { useMemo, useState } from 'react'
import { useVault } from '../stores/vault'
import { toast } from '../stores/toast'
import { EmptyState } from '../components/ui'
import type { TaskItem } from '../lib/types'

export default function TasksPage() {
  const lists = useVault((state) => state.lists)
  const tasks = useVault((state) => state.tasks)
  const ready = useVault((state) => state.ready)
  const createList = useVault((state) => state.createList)
  const renameList = useVault((state) => state.renameList)
  const createTask = useVault((state) => state.createTask)
  const trashItem = useVault((state) => state.trashItem)

  const [selected, setSelected] = useState<string | null>(null)
  const [newListName, setNewListName] = useState('')
  const [addingList, setAddingList] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')

  const activeLists = useMemo(
    () => Object.values(lists).filter((list) => !list.deletedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [lists],
  )

  const inboxCount = useMemo(
    () => Object.values(tasks).filter((task) => !task.deletedAt && task.taskList === null && !task.plain.done).length,
    [tasks],
  )

  const visibleTasks = useMemo(
    () =>
      Object.values(tasks)
        .filter((task) => !task.deletedAt && task.taskList === selected)
        .sort((a, b) => Number(a.plain.done) - Number(b.plain.done) || b.createdAt.localeCompare(a.createdAt)),
    [tasks, selected],
  )

  if (!ready) {
    return <EmptyState icon="⏳" title="decrypting your tasks…" />
  }

  const addTask = () => {
    const title = newTaskTitle.trim()
    if (!title) return
    createTask(selected, title)
    setNewTaskTitle('')
  }

  return (
    <div className="flex min-h-0 flex-1">
      <section className="flex w-64 shrink-0 flex-col border-r border-white/5">
        <header className="p-3">
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">lists</span>
            <button
              onClick={() => setAddingList(true)}
              className="cursor-pointer rounded-lg px-2 py-0.5 text-sm text-slate-400 hover:bg-white/5 hover:text-white"
              title="new list"
            >
              +
            </button>
          </div>
          <button
            onClick={() => setSelected(null)}
            className={`mb-1 flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-sm transition ${
              selected === null ? 'bg-white/10 font-medium text-white shadow-inner' : 'text-slate-400 hover:bg-white/5'
            }`}
          >
            inbox
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-400">{inboxCount}</span>
          </button>
          {activeLists.map((list) => {
            const count = Object.values(tasks).filter(
              (task) => !task.deletedAt && task.taskList === list.id && !task.plain.done,
            ).length
            return (
              <div key={list.id} className="group relative">
                <button
                  onClick={() => setSelected(list.id)}
                  onDoubleClick={() => {
                    const next = window.prompt('rename list', list.plain.name)
                    if (next && next.trim() && next.trim() !== list.plain.name) {
                      renameList(list.id, next.trim())
                    }
                  }}
                  className={`mb-1 flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2 pr-8 text-sm transition ${
                    selected === list.id
                      ? 'bg-white/10 font-medium text-white shadow-inner'
                      : 'text-slate-400 hover:bg-white/5'
                  }`}
                >
                  <span className="truncate">{list.plain.name}</span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-400">{count}</span>
                </button>
                <button
                  onClick={async () => {
                    try {
                      await trashItem('lists', list.id)
                      if (selected === list.id) setSelected(null)
                    } catch {
                      toast.error('failed to delete list')
                    }
                  }}
                  className="absolute top-1/2 right-2 hidden -translate-y-1/2 cursor-pointer rounded px-1 text-xs text-slate-500 hover:text-red-400 group-hover:block"
                  title="delete list (tasks move to inbox)"
                >
                  ✕
                </button>
              </div>
            )
          })}
          {addingList ? (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                const name = newListName.trim()
                if (name) {
                  const id = createList(name)
                  setSelected(id)
                }
                setNewListName('')
                setAddingList(false)
              }}
              className="mt-1"
            >
              <input
                autoFocus
                className="input"
                placeholder="list name…"
                value={newListName}
                onChange={(event) => setNewListName(event.target.value)}
                onBlur={() => {
                  setAddingList(false)
                  setNewListName('')
                }}
              />
            </form>
          ) : null}
        </header>
      </section>
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-white/5 p-4">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              addTask()
            }}
            className="flex gap-2"
          >
            <input
              className="input flex-1"
              placeholder={selected === null ? 'add a task to inbox…' : 'add a task…'}
              value={newTaskTitle}
              onChange={(event) => setNewTaskTitle(event.target.value)}
            />
            <button type="submit" className="btn-primary" disabled={!newTaskTitle.trim()}>
              add
            </button>
          </form>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {visibleTasks.length === 0 ? (
            <EmptyState icon="✓" title="nothing here" hint="add a task above" />
          ) : (
            <div className="space-y-2">
              {visibleTasks.map((task) => (
                <TaskRow key={task.id} task={task} lists={activeLists} onTrash={trashItem} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function TaskRow({
  task,
  lists,
  onTrash,
}: {
  task: TaskItem
  lists: { id: string; plain: { name: string } }[]
  onTrash: (collection: 'tasks', id: string) => Promise<void>
}) {
  const saveTask = useVault((state) => state.saveTask)
  const [expanded, setExpanded] = useState(false)
  const [title, setTitle] = useState(task.plain.title)
  const [notes, setNotes] = useState(task.plain.notes)
  const [due, setDue] = useState(task.plain.due ?? '')

  const commit = (patch: Partial<{ title: string; notes: string; due: string | null; done: boolean }>) => {
    saveTask(task.id, {
      title: patch.title ?? title,
      done: patch.done ?? task.plain.done,
      notes: patch.notes ?? notes,
      due: patch.due !== undefined ? patch.due : due ? due : null,
    })
  }

  return (
    <div className={`glass-soft p-3 transition ${task.plain.done ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3">
        <button
          onClick={() => commit({ done: !task.plain.done })}
          className={`flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md border transition ${
            task.plain.done
              ? 'border-indigo-400 bg-indigo-500 text-white'
              : 'border-white/20 hover:border-indigo-400'
          }`}
          title={task.plain.done ? 'mark as not done' : 'mark as done'}
        >
          {task.plain.done ? '✓' : ''}
        </button>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => title.trim() && title !== task.plain.title && commit({ title: title.trim() })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
          className={`min-w-0 flex-1 bg-transparent text-sm text-slate-100 focus:outline-none ${
            task.plain.done ? 'line-through decoration-slate-500' : ''
          }`}
        />
        {task.plain.due ? (
          <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-slate-400">
            {task.plain.due}
          </span>
        ) : null}
        {task.sync === 'pending' ? (
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-400" />
        ) : null}
        {task.sync === 'error' ? (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
        ) : null}
        <button
          onClick={() => setExpanded(!expanded)}
          className="shrink-0 cursor-pointer rounded-lg px-1.5 py-0.5 text-xs text-slate-500 hover:bg-white/5 hover:text-slate-300"
          title="details"
        >
          {expanded ? '▴' : '▾'}
        </button>
        <button
          onClick={() => onTrash('tasks', task.id).catch(() => toast.error('failed to delete task'))}
          className="shrink-0 cursor-pointer rounded-lg px-1.5 py-0.5 text-xs text-slate-500 hover:bg-white/5 hover:text-red-400"
          title="delete task"
        >
          🗑
        </button>
      </div>
      {expanded ? (
        <div className="mt-3 space-y-2 border-t border-white/5 pt-3 pl-8">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="label">due date</label>
              <input
                type="date"
                className="input"
                value={due}
                onChange={(event) => {
                  setDue(event.target.value)
                  commit({ due: event.target.value || null })
                }}
              />
            </div>
            <div className="flex-1">
              <label className="label">list</label>
              <select
                className="input"
                value={task.taskList ?? ''}
                onChange={(event) =>
                  saveTask(task.id, task.plain, event.target.value || null)
                }
              >
                <option value="">inbox</option>
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.plain.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">notes</label>
            <textarea
              className="input min-h-20 resize-y"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              onBlur={() => notes !== task.plain.notes && commit({ notes })}
              placeholder="encrypted details…"
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
