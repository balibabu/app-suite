import { useMemo, useState } from 'react'
import {
  Calendar,
  Check,
  CheckSquare,
  ChevronDown,
  Inbox,
  ListTodo,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { useVault } from '../stores/vault'
import { toast } from '../stores/toast'
import { EmptyState, Modal, Spinner, SyncBadge } from '../components/ui'
import type { TaskItem } from '../lib/types'

export default function TasksPage() {
  const lists = useVault((state) => state.lists)
  const tasks = useVault((state) => state.tasks)
  const ready = useVault((state) => state.ready)
  const createList = useVault((state) => state.createList)
  const createTask = useVault((state) => state.createTask)
  const trashItem = useVault((state) => state.trashItem)

  const [selected, setSelected] = useState<string | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [listModalOpen, setListModalOpen] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [deleteListId, setDeleteListId] = useState<string | null>(null)

  const activeLists = useMemo(
    () =>
      Object.values(lists)
        .filter((list) => !list.deletedAt)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [lists],
  )

  const openTasks = useMemo(
    () => Object.values(tasks).filter((task) => !task.deletedAt && !task.plain.done),
    [tasks],
  )

  const inboxCount = openTasks.filter((task) => task.taskList === null).length

  const visibleTasks = useMemo(
    () =>
      Object.values(tasks)
        .filter((task) => !task.deletedAt && task.taskList === selected)
        .sort((a, b) => Number(a.plain.done) - Number(b.plain.done) || b.createdAt.localeCompare(a.createdAt)),
    [tasks, selected],
  )

  const countFor = (listId: string) => openTasks.filter((task) => task.taskList === listId).length

  if (!ready) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Spinner className="h-6 w-6 text-emerald-400" />
      </div>
    )
  }

  const addTask = () => {
    const title = newTaskTitle.trim()
    if (!title) return
    createTask(selected, title)
    setNewTaskTitle('')
  }

  const deleteList = async () => {
    if (!deleteListId) return
    try {
      await trashItem('lists', deleteListId)
      if (selected === deleteListId) setSelected(null)
    } catch {
      toast.error('failed to delete list')
    } finally {
      setDeleteListId(null)
    }
  }

  return (
    <section className="animate-fadeIn flex flex-col gap-4 lg:h-[calc(100vh-11rem)] lg:flex-row">
      <aside className="glass shrink-0 p-4 lg:w-64 lg:overflow-y-auto">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">lists</h2>
          <button
            onClick={() => {
              setNewListName('')
              setListModalOpen(true)
            }}
            title="new list"
            className="cursor-pointer rounded-lg border border-white/10 bg-white/5 p-1 text-zinc-400 transition hover:bg-white/10 hover:text-white"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <button
          onClick={() => setSelected(null)}
          className={`mb-1.5 flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition ${
            selected === null
              ? 'bg-indigo-500/15 font-medium text-white shadow-inner'
              : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
          }`}
        >
          <Inbox className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate text-left">inbox</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-zinc-400">
            {inboxCount}
          </span>
        </button>

        {activeLists.map((list) => (
          <div key={list.id} className="group relative mb-1.5">
            <button
              onClick={() => setSelected(list.id)}
              className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 pr-9 text-sm transition ${
                selected === list.id
                  ? 'bg-indigo-500/15 font-medium text-white shadow-inner'
                  : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
              }`}
            >
              <ListTodo className="h-4 w-4 shrink-0 text-emerald-400/80" />
              <span className="flex-1 truncate text-left">{list.plain.name}</span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-zinc-400">
                {countFor(list.id)}
              </span>
            </button>
            <button
              onClick={() => setDeleteListId(list.id)}
              title="delete list (tasks move to inbox)"
              className="absolute top-1/2 right-2 hidden -translate-y-1/2 cursor-pointer rounded-md p-1 text-zinc-500 transition hover:bg-red-500/20 hover:text-red-400 group-hover:block no-hover:block"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </aside>

      <div className="glass flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="border-b border-white/5 p-4">
          <div className="mb-3 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/15 text-emerald-400">
              <CheckSquare className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">
                {selected === null ? 'inbox' : lists[selected]?.plain.name ?? 'list'}
              </h2>
              <p className="text-[11px] text-zinc-500">
                {visibleTasks.filter((task) => !task.plain.done).length} open ·{' '}
                {visibleTasks.filter((task) => task.plain.done).length} done
              </p>
            </div>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              addTask()
            }}
            className="flex gap-2"
          >
            <div className="field flex-1">
              <Plus className="h-4 w-4 shrink-0 text-zinc-500" />
              <input
                placeholder={selected === null ? 'add a task to inbox…' : 'add a task…'}
                value={newTaskTitle}
                onChange={(event) => setNewTaskTitle(event.target.value)}
              />
            </div>
            <button type="submit" className="btn-primary shrink-0" disabled={!newTaskTitle.trim()}>
              add
            </button>
          </form>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {visibleTasks.length === 0 ? (
            <EmptyState
              icon={<CheckSquare className="h-8 w-8" />}
              title="nothing here yet"
              hint="add a task above — it's encrypted before it leaves this device"
            />
          ) : (
            <div className="space-y-2">
              {visibleTasks.map((task) => (
                <TaskRow key={task.id} task={task} lists={activeLists} onTrash={trashItem} />
              ))}
            </div>
          )}
        </div>
      </div>

      {listModalOpen ? (
        <Modal
          title="Create new list"
          subtitle="group related tasks together"
          icon={
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-400">
              <ListTodo className="h-5 w-5" />
            </div>
          }
          onClose={() => setListModalOpen(false)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault()
              const name = newListName.trim()
              if (name) {
                const id = createList(name)
                setSelected(id)
              }
              setListModalOpen(false)
            }}
          >
            <input
              autoFocus
              className="input mb-4"
              placeholder="list name (e.g. groceries, work)"
              value={newListName}
              onChange={(event) => setNewListName(event.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setListModalOpen(false)}>
                cancel
              </button>
              <button type="submit" className="btn-primary" disabled={!newListName.trim()}>
                create list
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {deleteListId ? (
        <Modal
          title="Delete this list?"
          subtitle="tasks will move back to inbox"
          icon={
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/25 bg-red-500/10 text-red-400">
              <Trash2 className="h-5 w-5" />
            </div>
          }
          onClose={() => setDeleteListId(null)}
        >
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setDeleteListId(null)}>
              cancel
            </button>
            <button className="btn-danger" onClick={() => void deleteList()}>
              delete list
            </button>
          </div>
        </Modal>
      ) : null}
    </section>
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
    <div
      className={`glass-soft p-3 transition ${task.plain.done ? 'opacity-55' : ''} ${
        expanded ? 'border-white/15' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={() => commit({ done: !task.plain.done })}
          className={`flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md border transition ${
            task.plain.done
              ? 'border-emerald-400 bg-emerald-500 text-white'
              : 'border-white/20 hover:border-emerald-400'
          }`}
          title={task.plain.done ? 'mark as not done' : 'mark as done'}
        >
          {task.plain.done ? <Check className="h-3.5 w-3.5" /> : ''}
        </button>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => title.trim() && title !== task.plain.title && commit({ title: title.trim() })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
          className={`min-w-0 flex-1 bg-transparent text-sm text-zinc-100 focus:outline-none ${
            task.plain.done ? 'line-through decoration-zinc-500' : ''
          }`}
        />
        {task.plain.due ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-400">
            <Calendar className="h-3 w-3" />
            {task.plain.due}
          </span>
        ) : null}
        <SyncBadge sync={task.sync} />
        <button
          onClick={() => setExpanded(!expanded)}
          className="shrink-0 cursor-pointer rounded-lg p-1 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-300"
          title="details"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
        <button
          onClick={() => onTrash('tasks', task.id).catch(() => toast.error('failed to delete task'))}
          className="shrink-0 cursor-pointer rounded-lg p-1 text-zinc-500 transition hover:bg-red-500/20 hover:text-red-400"
          title="delete task"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {expanded ? (
        <div className="mt-3 ml-8 space-y-2.5 border-t border-white/5 pt-3">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <div>
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
            <div>
              <label className="label">list</label>
              <select
                className="input"
                value={task.taskList ?? ''}
                onChange={(event) => saveTask(task.id, task.plain, event.target.value || null)}
              >
                <option className="input-option" value="">
                  inbox
                </option>
                {lists.map((list) => (
                  <option className="input-option" key={list.id} value={list.id}>
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
