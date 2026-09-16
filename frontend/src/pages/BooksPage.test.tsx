// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {afterEach,expect,test,vi} from 'vitest'
import BooksPage from './BooksPage'
import {api} from '../api'
vi.mock('../api',()=>({api:vi.fn()}))
let client:QueryClient
const book={id:'b1',title:'فیزیک خیلی سبز',publication_year:1405,active:true,owned:false,topics:[{id:'t1',title:'حرکت‌شناسی',question_type:'test',question_count:100,completed:30,remaining:70,reserved:20,available:50}]}
afterEach(()=>{cleanup();client?.clear();vi.clearAllMocks()})
function show(mode:'admin'|'student'|'advisor'){
 vi.mocked(api).mockImplementation(async()=>[book] as never)
 client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})
 render(<QueryClientProvider client={client}><BooksPage mode={mode} studentId={mode==='advisor'?'s1':undefined}/></QueryClientProvider>)
}
test('student selection persists and topics expand inline',async()=>{
 show('student')
 fireEvent.click(await screen.findByRole('checkbox',{name:/این کتاب را دارم/}))
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/books/b1/ownership',{method:'PUT',body:JSON.stringify({owned:true})}))
 const heading=screen.getByRole('button',{name:/فیزیک خیلی سبز/})
 fireEvent.click(heading);expect(screen.getByText('حرکت‌شناسی')).toBeTruthy();expect(screen.getByText('قابل برنامه‌ریزی')).toBeTruthy()
 fireEvent.click(heading);expect(screen.queryByText('حرکت‌شناسی')).toBeNull()
})
test('advisor sees only the scoped library without ownership controls',async()=>{
 show('advisor');await screen.findByRole('button',{name:/فیزیک خیلی سبز/})
 expect(api).toHaveBeenCalledWith('/advisors/students/s1/books');expect(screen.queryByRole('checkbox')).toBeNull()
})
test('admin creates books and topics with numeric inventory',async()=>{
 show('admin');await screen.findByRole('button',{name:/فیزیک خیلی سبز/})
 fireEvent.click(screen.getByRole('button',{name:'افزودن کتاب'}))
 fireEvent.change(screen.getByLabelText('عنوان کتاب'),{target:{value:'زیست'}})
 fireEvent.change(screen.getByLabelText('سال انتشار'),{target:{value:'1405'}})
 fireEvent.click(screen.getAllByRole('button',{name:'افزودن کتاب'})[1])
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/books',{method:'POST',body:JSON.stringify({title:'زیست',publication_year:1405,active:true})}))
 fireEvent.click(screen.getByRole('button',{name:/فیزیک خیلی سبز/}))
 fireEvent.click(screen.getByRole('button',{name:'اضافه کردن مبحث'}))
 fireEvent.change(screen.getAllByLabelText('عنوان مبحث')[1],{target:{value:'دینامیک'}})
 fireEvent.change(screen.getAllByLabelText('تعداد سؤال')[1],{target:{value:'80'}})
 fireEvent.change(screen.getAllByLabelText('نوع سؤال')[1],{target:{value:'written'}})
 fireEvent.click(screen.getByRole('button',{name:'افزودن مبحث'}))
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/books/b1/topics',{method:'POST',body:JSON.stringify({title:'دینامیک',question_count:80,question_type:'written'})}))
})
