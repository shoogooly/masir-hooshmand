import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { advisorStudentSections, normalizeAdvisorSearch } from '../utils/advisorSections'

const base = '/app/advisor'
const panelSections = [
  { key: 'overview', label: 'صفحه اصلی', aliases: ['نمای کلی', 'داشبورد', 'صف پیگیری'] },
  { key: 'students', label: 'دانش‌آموزان', aliases: ['پرونده دانش‌آموزان'] },
  { key: 'group-exams', label: 'آزمون گروهی' },
  { key: 'articles', label: 'مقالات من' },
  { key: 'messages', label: 'پیامرسان مهیاد', aliases: ['پیام‌ها', 'گفتگو', 'چت'] },
  { key: 'requests', label: 'درخواست‌های انتخاب مشاور' },
  { key: 'add-student', label: 'افزودن دانش‌آموز', aliases: ['معرفی دانش‌آموز'] },
  { key: 'ai', label: 'پیشنهادات AI', aliases: ['هوش مصنوعی'] },
  { key: 'settings', label: 'تنظیمات' },
]

export default function AdvisorSearch() {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const query = normalizeAdvisorSearch(value)
  const studentId = location.pathname.match(/^\/app\/advisor\/students\/([^/]+)\//)?.[1]
  const students = useQuery({
    queryKey: ['advisor-dashboard'],
    queryFn: () => api<{ students: { id: string; full_name: string }[] }>('/advisors/dashboard'),
    enabled: focused && Boolean(query),
    staleTime: 30_000,
  })

  const names = (students.data?.students ?? [])
    .filter(student => query && normalizeAdvisorSearch(student.full_name).includes(query))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'fa'))
    .map(student => ({ label: student.full_name, to: `${base}/students/${student.id}/report`, kind: 'دانش‌آموز' }))
  const matches = (entry: {label: string; aliases?: string[]}) =>
    query && [entry.label, ...(entry.aliases ?? [])].some(label => normalizeAdvisorSearch(label).includes(query))
  const sections = [
    ...panelSections.filter(matches).map(entry => ({
      label: entry.label, to: `${base}/${entry.key}`, kind: 'بخش پنل',
    })),
    ...advisorStudentSections.filter(matches).map(entry => ({
      label: entry.label,
      to: studentId ? `${base}/students/${studentId}/${entry.key}` : `${base}/students?section=${entry.key}`,
      kind: 'پرونده دانش‌آموز',
    })),
  ]
  const results = [...names, ...sections]
  const open = focused && Boolean(query)
  function close() {
    setValue('')
    setFocused(false)
  }

  return <form className="app-search advisor-global-search" role="search"
    onFocus={() => setFocused(true)}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false) }}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setFocused(false) } }}
    onSubmit={event => {
      event.preventDefault()
      if (open && results[0]) { navigate(results[0].to); close() }
    }}>
    <Search aria-hidden="true"/>
    <input type="search" value={value} onChange={event => { setValue(event.target.value); setFocused(true) }}
      onClick={() => setFocused(true)} autoComplete="off"
      aria-label="جست‌وجوی دانش‌آموز و بخش‌های پنل" placeholder="جست‌وجو در مهیاد..."/>
    {open && <div className="advisor-search-results" aria-label="نتایج جست‌وجو">
      {results.map(result => <Link key={result.to} to={result.to} onClick={close}>
        <b>{result.label}</b><small>{result.kind}</small>
      </Link>)}
      {students.isFetching && !students.data && <p role="status">در حال دریافت فهرست دانش‌آموزان…</p>}
      {students.isError && !students.data && <p role="status">دریافت فهرست دانش‌آموزان ناموفق بود.</p>}
      {!results.length && !students.isFetching && !students.isError && <p role="status">نتیجه‌ای پیدا نشد.</p>}
    </div>}
  </form>
}
