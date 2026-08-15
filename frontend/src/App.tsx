import { Navigate, Route, Routes } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { auth } from './api'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import WorkspacePage from './pages/WorkspacePage'

function Protected() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['me'], queryFn: auth.me, retry: false })
  if (isLoading) return <div className="screen-loader"><span className="brand-mark" /> در حال آماده‌سازی مسیر هوشمند...</div>
  if (isError || !data) return <Navigate to="/login" replace />
  return <WorkspacePage user={data} />
}

export default function App() {
  return <Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="/login" element={<LoginPage />} />
    <Route path="/app/*" element={<Protected />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
}
