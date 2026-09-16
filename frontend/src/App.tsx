import { useEffect, Suspense, lazy } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { sessionExpiredEvent } from './lib/api'
import { useAuth } from './stores/auth'
import { useVault } from './stores/vault'
import { Spinner, Toaster } from './components/ui'
import Layout from './components/Layout'
import AuthPage from './pages/AuthPage'
import HomePage from './pages/HomePage'

// code-split pages so the initial bundle stays small (faster first paint / LCP)
const NotesPage = lazy(() => import('./pages/NotesPage'))
const TasksPage = lazy(() => import('./pages/TasksPage'))
const FilesPage = lazy(() => import('./pages/FilesPage'))
const TrashPage = lazy(() => import('./pages/TrashPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

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
    <HashRouter>
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
          <Route
            path="notes/:noteId?"
            element={
              <Suspense
                fallback={
                  <div className="flex h-[60vh] items-center justify-center">
                    <Spinner className="h-6 w-6 text-indigo-400" />
                  </div>
                }
              >
                <NotesPage />
              </Suspense>
            }
          />
          <Route
            path="tasks"
            element={
              <Suspense
                fallback={
                  <div className="flex h-[60vh] items-center justify-center">
                    <Spinner className="h-6 w-6 text-emerald-400" />
                  </div>
                }
              >
                <TasksPage />
              </Suspense>
            }
          />
          <Route
            path="files"
            element={
              <Suspense
                fallback={
                  <div className="flex h-[60vh] items-center justify-center">
                    <Spinner className="h-6 w-6 text-blue-400" />
                  </div>
                }
              >
                <FilesPage />
              </Suspense>
            }
          />
          <Route
            path="trash"
            element={
              <Suspense
                fallback={
                  <div className="flex h-[60vh] items-center justify-center">
                    <Spinner className="h-6 w-6 text-zinc-400" />
                  </div>
                }
              >
                <TrashPage />
              </Suspense>
            }
          />
          <Route
            path="settings"
            element={
              <Suspense
                fallback={
                  <div className="flex h-[60vh] items-center justify-center">
                    <Spinner className="h-6 w-6 text-purple-400" />
                  </div>
                }
              >
                <SettingsPage />
              </Suspense>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </HashRouter>
  )
}
