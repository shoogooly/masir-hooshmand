// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {afterEach,expect,test,vi} from 'vitest'
import AdminMotivationalQuotesPage from './AdminMotivationalQuotesPage'
import {api} from '../api'

vi.mock('../api',()=>({api:vi.fn()}))
afterEach(()=>{cleanup();vi.clearAllMocks()})
test('admin edits one of 31 Jalali day quotes and saves the complete list',async()=>{
 const quotes=Array(31).fill('')
 vi.mocked(api).mockImplementation(async(_path,options)=>options?quotes as never:quotes as never)
 const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})
 render(<QueryClientProvider client={client}><AdminMotivationalQuotesPage/></QueryClientProvider>)
 const day=await screen.findByLabelText('روز ۳')
 fireEvent.change(day,{target:{value:'امروز برای هدفم تلاش می‌کنم'}})
 fireEvent.click(screen.getByRole('button',{name:'ذخیره جمله‌ها'}))
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/admin/motivational-quotes',{
  method:'PUT',body:JSON.stringify({quotes:quotes.map((value,index)=>index===2?'امروز برای هدفم تلاش می‌کنم':value)})
 }))
})
