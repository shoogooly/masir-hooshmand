// @vitest-environment jsdom
import {afterEach,expect,test,vi} from 'vitest'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {MemoryRouter} from 'react-router-dom'
import {StudentProfileForm,AdvisorProfileForm} from './OnboardingForms'
import RegistrationPage from './RegistrationPage'
import TermsStep from './TermsStep'
import {api,auth} from '../api'
vi.mock('../api',()=>({api:vi.fn(),auth:{register:vi.fn(),requestOtp:vi.fn()}}))
let client:QueryClient
afterEach(()=>{cleanup();client?.clear();vi.clearAllMocks()})
function setup(node:React.ReactNode){client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});return render(<MemoryRouter><QueryClientProvider client={client}>{node}</QueryClientProvider></MemoryRouter>)}
const personal={full_name:'دانش آموز آزمایشی',national_code:'1234567890',birth_date:'1388/01/01',parent_name:'ولی آزمایشی',parent_phone:'09123456789',address:'نشانی کامل برای آزمایش'}
test('missing student fields stay on step and name the missing field beside next',()=>{
 const result=setup(<StudentProfileForm refresh={()=>{}}/> )
 fireEvent.click(screen.getByRole('button',{name:'مرحله بعد: سوابق تحصیلی'}))
 expect(screen.getByRole('alert').textContent).toContain('نام و نام خانوادگی')
 expect(screen.getByRole('alert').closest('.onboarding-actions')).toBeTruthy()
 expect(screen.getByRole('heading',{name:'اطلاعات فردی دانش‌آموز'})).toBeTruthy()
 expect(result.container.querySelector('.required-mark')).toBeTruthy()
 expect(api).not.toHaveBeenCalled()
})
test('student invalid national code and required average explain why next is blocked',()=>{
 setup(<StudentProfileForm initial={{...personal,national_code:'123',school:'مدرسه',major:'تجربی',goal:'پزشکی'}} refresh={()=>{}}/> )
 fireEvent.click(screen.getByRole('button',{name:'مرحله بعد: سوابق تحصیلی'}))
 expect(screen.getByRole('alert').textContent).toContain('کد ملی')
 fireEvent.change(screen.getByLabelText('کد ملی'),{target:{value:'1234567890'}})
 fireEvent.click(screen.getByRole('button',{name:'مرحله بعد: سوابق تحصیلی'}))
 fireEvent.click(screen.getByRole('button',{name:'ذخیره و مرحله بعد'}))
 expect(screen.getByRole('alert').textContent).toContain('معدل نهم')
 expect(api).not.toHaveBeenCalled()
})
test('advisor missing mandatory photo blocks the first step with explanation',()=>{
 setup(<AdvisorProfileForm initial={personal} refresh={()=>{}}/> )
 fireEvent.click(screen.getByRole('button',{name:'مرحله بعد: سوابق و مدارک'}))
 expect(screen.getByRole('alert').textContent).toContain('عکس پرسنلی')
})
test('advisor missing documents keeps submit clickable and explains the requirement',()=>{
 setup(<AdvisorProfileForm initial={{...personal,profile_photo:{content_type:'image/png',content_base64:'AA=='},education_degree:'کارشناسی',education_field:'مشاوره',experience_years:0,bio:'معرفی و سابقه مشاور با طول کافی برای ثبت'}} refresh={()=>{}}/> )
 fireEvent.click(screen.getByRole('button',{name:'مرحله بعد: سوابق و مدارک'}))
 fireEvent.click(screen.getByRole('button',{name:'ذخیره و مرحله بعد'}))
 expect(screen.getByRole('alert').textContent).toContain('دو مدرک')
 expect(api).not.toHaveBeenCalled()
})
test('initial account form names missing input without submitting registration',()=>{
 setup(<RegistrationPage/> )
 fireEvent.click(screen.getByRole('button',{name:'ساخت حساب و تکمیل پرونده'}))
 expect(screen.getByRole('alert').textContent).toContain('شماره موبایل')
 expect(auth.register).not.toHaveBeenCalled()
})
test('terms step explains required acceptance when continuing unchecked',async()=>{
 vi.mocked(api).mockResolvedValue({text:'شرایط نمونه',version:1} as never)
 setup(<TermsStep role="student" refresh={()=>{}}/> )
 fireEvent.click(await screen.findByRole('button',{name:'پذیرش و ادامه'}))
 expect(screen.getByRole('alert').textContent).toContain('پذیرش شرایط')
 expect(api).toHaveBeenCalledTimes(1)
})
