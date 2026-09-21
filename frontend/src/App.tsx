import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { auth } from './api'
import SubscriptionBoundary from './components/SubscriptionBoundary'
const HomePage = lazy(() => import('./pages/HomePage'))
import HomePreviewPage from './pages/HomePreviewPage'
const LoginPage = lazy(() => import('./pages/LoginPage'))
const PasswordRecoveryPage = lazy(() => import('./pages/PasswordRecoveryPage'))
const WorkspacePage = lazy(() => import('./pages/WorkspacePage'))
const RegistrationPage = lazy(() => import('./pages/RegistrationPage'))
const OnboardingPage = lazy(() => import('./pages/OnboardingPage'))
const PublicAdvisorsPage = lazy(() => import('./pages/PublicAdvisorsPage'))
const PublicArticlesPage = lazy(() => import('./pages/PublicArticlesPage'))
const BaleDownloadPage = lazy(() => import('./pages/BalePages').then(module => ({ default: module.BaleDownloadPage })))
const BaleAccessPage = lazy(() => import('./pages/BalePages').then(module => ({ default: module.BaleAccessPage })))
const PaymentResultPage = lazy(() => import('./pages/PaymentResultPage'))
function Protected() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['me'], queryFn: auth.me, retry: false })
  if (isLoading) return <div className="screen-loader"><img className="brand-logo" src="/brand/mahyaad-logo.png" alt="" /> در حال آماده‌سازی مهیاد...</div>
  if (isError || !data) return <Navigate to="/login" replace />
  if (data.status !== 'active') return <OnboardingPage user={data} />
  return <WorkspacePage user={data} />
}

export default function App() {
  return <Suspense fallback={<div className="screen-loader">در حال آماده‌سازی صفحه…</div>}><SubscriptionBoundary><Routes>
    <Route path="/" element={<HomePreviewPage />} />
    <Route path="/home-preview" element={<HomePreviewPage />} />
    <Route path="/home-old" element={<HomePage />} />
    <Route path="/login" element={<LoginPage />} />
    <Route path="/forgot-password" element={<PasswordRecoveryPage />} />
    <Route path="/register" element={<RegistrationPage />} />
    <Route path="/advisors" element={<PublicAdvisorsPage />} />
    <Route path="/articles" element={<PublicArticlesPage />} />
    <Route path="/bale-download/:token" element={<BaleDownloadPage />} />
    <Route path="/bale-access/:token" element={<BaleAccessPage />} />
    <Route path="/payment-result" element={<PaymentResultPage />} />
    <Route path="/app/*" element={<Protected />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></SubscriptionBoundary></Suspense>
}
