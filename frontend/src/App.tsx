import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { auth } from './api'
const HomePage = lazy(() => import('./pages/HomePage'))
import HomePreviewPage from './pages/HomePreviewPage'
const LoginPage = lazy(() => import('./pages/LoginPage'))
const WorkspacePage = lazy(() => import('./pages/WorkspacePage'))
const RegistrationPage = lazy(() => import('./pages/RegistrationPage'))
const RenewalPage = lazy(() => import('./pages/RenewalPage'))
const OnboardingPage = lazy(() => import('./pages/OnboardingPage'))
function Protected() {
  const location = useLocation()
  const { data, isLoading, isError } = useQuery({ queryKey: ['me'], queryFn: auth.me, retry: false })
  if (isLoading) return <div className="screen-loader"><span className="brand-mark" /> در حال آماده‌سازی مسیر هوشمند...</div>
  if (isError || !data) return <Navigate to="/login" replace />
  if (data.status !== 'active') return <OnboardingPage user={data} />
  if (data.role === 'student' && data.subscription_expired && !location.pathname.includes('/subscription')) return <RenewalPage user={data} />
  return <WorkspacePage user={data} />
}

export default function App() {
  return <Suspense fallback={<div className="screen-loader">در حال آماده‌سازی صفحه…</div>}><Routes>
    <Route path="/" element={<HomePreviewPage />} />
    <Route path="/home-preview" element={<HomePreviewPage />} />
    <Route path="/home-old" element={<HomePage />} />
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<RegistrationPage />} />
    <Route path="/app/*" element={<Protected />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></Suspense>
}
