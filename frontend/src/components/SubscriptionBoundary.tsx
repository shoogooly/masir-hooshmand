import { useEffect, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate, useLocation } from 'react-router-dom'
import { auth, SUBSCRIPTION_REQUIRED_EVENT } from '../api'
import RenewalPage from '../pages/RenewalPage'
import type { User } from '../types'

export default function SubscriptionBoundary({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const location = useLocation()
  const [deadlineReached, setDeadlineReached] = useState(false)
  const session = useQuery({
    queryKey: ['me'], queryFn: auth.me, retry: false, staleTime: 0,
    refetchOnMount: 'always', refetchOnWindowFocus: 'always',
    refetchInterval: query => query.state.data?.role === 'student' && query.state.data?.status === 'active' ? 15_000 : false,
  })
  const user = session.data
  const activeStudent = user?.role === 'student' && user.status === 'active'
  const locked = activeStudent && (user.subscription_expired !== false || !user.subscription || user.subscription.status !== 'active' || !Number.isFinite(Date.parse(user.subscription.expires_at)) || deadlineReached)
  const privatePage = location.pathname.startsWith('/app')

  useEffect(() => {
    const lock = () => {
      setDeadlineReached(true)
      qc.setQueryData<User>(['me'], current => current?.role === 'student'
        ? { ...current, subscription_expired: true, subscription: null } : current)
      void qc.invalidateQueries({ queryKey: ['me'] })
    }
    window.addEventListener(SUBSCRIPTION_REQUIRED_EVENT, lock)
    return () => window.removeEventListener(SUBSCRIPTION_REQUIRED_EVENT, lock)
  }, [qc])

  useEffect(() => {
    setDeadlineReached(false)
    if (!activeStudent || user.subscription_expired || !user.subscription?.expires_at) return
    // Use the server's remaining duration rather than trusting the browser's clock.
    const remaining = Date.parse(user.subscription.expires_at) - Date.parse(user.server_time || new Date(session.dataUpdatedAt).toISOString())
    const delay = Math.max(0, remaining - (Date.now() - session.dataUpdatedAt))
    const timer = window.setTimeout(() => {
      setDeadlineReached(true)
      void qc.invalidateQueries({ queryKey: ['me'] })
    }, Math.min(delay, 2_147_483_647))
    return () => window.clearTimeout(timer)
  }, [activeStudent, user, session.dataUpdatedAt, qc])

  useEffect(() => {
    if (!locked) return
    const privateQuery = (query: { queryKey: readonly unknown[] }) => !['me', 'renewal-plans'].includes(String(query.queryKey[0]))
    void qc.cancelQueries({ predicate: privateQuery }).then(() => qc.removeQueries({ predicate: privateQuery }))
  }, [locked, qc])

  if (privatePage && (session.isPending || (!locked && !session.isFetchedAfterMount && session.isFetching))) return <div className="screen-loader">در حال بررسی دسترسی…</div>
  // A failed verification cannot expose a cached workspace.
  if (session.isError && user) return <div className="screen-loader"><div>
    <p>بررسی دسترسی ممکن نشد. لطفاً دوباره تلاش کنید.</p>
    <button className="btn btn-primary" onClick={() => void session.refetch()}>بررسی دوباره</button>
    <button className="btn btn-outline" onClick={async () => { await auth.logout(); qc.clear(); window.location.assign('/login') }}>خروج</button>
  </div></div>
  if (privatePage && session.isError) return <Navigate to="/login" replace />
  if (locked && user) {
    if (location.pathname !== '/app/renewal') return <Navigate to="/app/renewal" replace />
    return <RenewalPage user={user} />
  }
  if (location.pathname === '/app/renewal' && user?.status === 'active')
    return <Navigate to="/app/student/overview" replace />
  return <>{children}</>
}
