// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import AdvisorSearch from './AdvisorSearch'

vi.mock('../api', () => ({
  api: async () => ({ students: [{ id: 'one', full_name: 'علی کریمی' }] }),
}))

afterEach(cleanup)

test('advisor search finds Persian names and both types of panel sections', async () => {
  const client = new QueryClient()
  render(<QueryClientProvider client={client}><MemoryRouter><AdvisorSearch/></MemoryRouter></QueryClientProvider>)
  const search = screen.getByRole('searchbox')
  fireEvent.change(search, { target: { value: 'علي كريمي' } })
  const student = await screen.findByRole('link', { name: /علی کریمی/ })
  expect(student.getAttribute('href')).toBe('/app/advisor/students/one/report')

  fireEvent.change(search, { target: { value: 'مقالات' } })
  expect(screen.getByRole('link', { name: /مقالات من/ }).getAttribute('href')).toBe('/app/advisor/articles')

  fireEvent.change(search, { target: { value: 'نوع محاسبه هزینه' } })
  expect(screen.getByRole('link', { name: /نوع محاسبه هزینه/ }).getAttribute('href'))
    .toBe('/app/advisor/students?section=renewal-billing')
})
