import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { sessionExpiredEvent } from './lib/api'
import { useAuth } from './stores/auth'
import { useVault } from './stores/vault'
import { Spinner, Toaster } from './components/ui'
import Layout from './components/Layout'
import AuthPage from './pages/AuthPage'
import HomePage from './pages/HomePage'
import NotesPage from './pages/NotesPage'
import TasksPage from './pages/TasksPage'
import FilesPage from './pages/FilesPage'
import TrashPage from './pages/TrashPage'
import SettingsPage from './pages/SettingsPage'

function Boot() {
  const boot = useAuth((state) => state.boot)
  useEffect(() => {
    void boot()
  }, [boot])
  return null
}

function SessionWatch() {
  const forceExpired = useAuth((state) => state.forceExpired)
  const location = useLocation()
  useEffect(() => {
    const handler = () => {
      useVault.getState().reset()
      forceExpired()
    }
    window.addEventListener(sessionExpiredEvent, handler)
    return () => window.removeEventListener(sessionExpiredEvent, handler)
  }, [forceExpired])
  useEffect(() => {
    if (useAuth.getState().status !== 'unlocked') {
      useVault.getState().reset()
    }
  }, [location])
  return null
}

function RequireVault({ children }: { children: React.ReactNode }) {
  const status = useAuth((state) => state.status)
  if (status === 'boot') {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-6 w-6 text-indigo-400" />
      </div>
    )
  }
  if (status !== 'unlocked') return <Navigate to="/auth" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Boot />
      <SessionWatch />
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route
          path="/"
          element={
            <RequireVault>
              <Layout />
            </RequireVault>
          }
        >
          <Route index element={<HomePage />} />
          <Route path="notes/:noteId?" element={<NotesPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="files" element={<FilesPage />} />
          <Route path="trash" element={<TrashPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  )
}
