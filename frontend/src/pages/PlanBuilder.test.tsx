// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {afterEach,expect,test,vi} from 'vitest'
import {PlanBuilder} from './OperationalPages'
import {api} from '../api'
vi.mock('../api',()=>({api:vi.fn(async(path:string)=>path==='/plans'?[]:null)}))
let client:QueryClient
afterEach(()=>{cleanup();client?.clear()})
function setup(){client=new QueryClient({defaultOptions:{queries:{retry:false}}});return render(<QueryClientProvider client={client}><PlanBuilder studentId="student"/></QueryClientProvider>)}
test('plan length defaults to seven and supports the full one to fourteen day range',()=>{
 const {container}=setup()
 const count=screen.getByRole<HTMLSelectElement>('combobox',{name:'تعداد روزهای برنامه'})
 const days=()=>Array.from(container.querySelectorAll('.timeline-editor-day header > span'),day=>day.textContent)
 expect(count.options).toHaveLength(14)
 expect(count.value).toBe('7')
 expect(days()).toHaveLength(7)
 fireEvent.change(count,{target:{value:'14'}})
 expect(new Set(days()).size).toBe(14)
 fireEvent.change(count,{target:{value:'1'}})
 expect(days()).toHaveLength(1)
})
function descriptionInputs(){return screen.getAllByRole('textbox',{name:/^توضیحات بازه/}) as HTMLInputElement[]}
function descriptionText(){return descriptionInputs().map(input=>input.value).join('\n')}
function editDescription(value:string){const parts=value.split('\n');while(descriptionInputs().length>parts.length){const last=descriptionInputs().at(-1)!;fireEvent.change(last,{target:{value:''}});last.setSelectionRange(0,0);fireEvent.keyDown(last,{key:'Backspace'})}parts.forEach((part,index)=>{if(!descriptionInputs()[index])fireEvent.keyDown(descriptionInputs()[index-1],{key:'Enter'});fireEvent.change(descriptionInputs()[index],{target:{value:part}})});return descriptionInputs()}

test('three description lines stay editable in the range and its actions stay beside it',()=>{
 const {container}=setup()
 fireEvent.click(screen.getAllByRole('button',{name:/افزودن بازه برای/})[0])
 editDescription('مطالعه\nتمرین\nمرور')
 expect(descriptionText()).toBe('مطالعه\nتمرین\nمرور')
 expect(screen.queryByRole('dialog')).toBeNull()
 const block=screen.getByRole('button',{name:/ویرایش بازه مطالعه/})
 expect(within(block).getByRole('button',{name:'حذف بازه'})).toBeTruthy()
 expect(within(block).getByRole('button',{name:'کپی بازه'})).toBeTruthy()
 expect(within(block).getByRole('button',{name:'رنگ بازه'})).toBeTruthy()
 expect(within(block).getByRole('button',{name:'کتاب بازه'})).toBeTruthy()
 expect(within(block).getByRole('button',{name:'مباحث بازه'})).toBeTruthy()
 fireEvent.click(within(block).getByRole('button',{name:'حذف بازه'}))
 expect(screen.queryByRole('button',{name:/ویرایش بازه مطالعه/})).toBeNull()
 expect(container.querySelector('.range-inline-tools')).toBeNull()
})

test('range descriptions convert typed digits to Persian',()=>{
 const {container}=setup()
 fireEvent.click(screen.getAllByRole('button',{name:/افزودن بازه برای/})[0])
 editDescription('فصل 2\nتمرین ٣ و ۴')
 expect(descriptionText()).toBe('فصل ۲\nتمرین ۳ و ۴')
 expect(container.querySelector('.timeline-block')?.getAttribute('aria-label')).toBe('ویرایش بازه فصل ۲\nتمرین ۳ و ۴')
})

test('typing after Enter fills the third line and a fourth line is rejected',()=>{
 setup()
 fireEvent.click(screen.getAllByRole('button',{name:/افزودن بازه برای/})[0])
 editDescription('مطالعه\nتمرین')
 expect(fireEvent.keyDown(descriptionInputs()[1],{key:'Enter'})).toBe(false)
 expect(descriptionInputs()).toHaveLength(3)
 fireEvent.change(descriptionInputs()[2],{target:{value:'مرور'}})
 expect(descriptionText()).toBe('مطالعه\nتمرین\nمرور')
 expect(fireEvent.keyDown(descriptionInputs()[2],{key:'Enter'})).toBe(false)
 expect(descriptionInputs()).toHaveLength(3)
})

test('a manual range color can override and then restore its subject color',()=>{
 setup()
 fireEvent.click(screen.getAllByRole('button',{name:/افزودن بازه برای/})[0])
 editDescription('فیزیک و ریاضی')
 const block=screen.getByRole('button',{name:'ویرایش بازه فیزیک و ریاضی'})
 fireEvent.click(within(block).getByRole('button',{name:'رنگ بازه'}))
 const color=screen.getByLabelText('رنگ دلخواه بازه')
 fireEvent.change(color,{target:{value:'#ffff00'}})
 expect((block.querySelector('.timeline-inline-description') as HTMLElement).style.background).toBe('rgb(255, 255, 184)')
 fireEvent.click(screen.getByRole('button',{name:'رنگ خودکار درس'}))
 expect((block.querySelector('.timeline-inline-description') as HTMLElement).style.background).not.toBe('rgb(255, 255, 184)')
})

test.each([
 ['یازدهم',['دهم','یازدهم','دوازدهم']],
 ['هشتم',['هفتم','هشتم','نهم']]
])('topic picker groups final branches by grade for %s',async(studentGrade,grades)=>{
 const grade=grades[2]
 vi.mocked(api).mockImplementation(async(path)=>path.endsWith('/planner-topics')?[
  {id:'root',subject:'فیزیک',title:'فیزیک',path:'فیزیک',grade,major:'تجربی',calendar_title:'تقویم',used_count:0,depth:1,is_leaf:false},
  {id:'chapter',subject:'فیزیک',title:'فصل ۱',path:'فیزیک ← فصل ۱',grade,major:'تجربی',calendar_title:'تقویم',used_count:0,depth:2,is_leaf:false},
  {id:'leaf',subject:'فیزیک',title:'حرکت',path:'فیزیک ← فصل ۱ ← درس ۱ ← حرکت',grade,major:'تجربی',calendar_title:'تقویم',used_count:2,depth:4,is_leaf:true}
 ] as never:path.endsWith('/report')?{profile:{grade:studentGrade}} as never:path==='/plans'?[] as never:null as never)
 setup()
 fireEvent.click(screen.getAllByRole('button',{name:/افزودن بازه برای/})[0])
 editDescription('فیزیک')
 const block=screen.getByRole('button',{name:/ویرایش بازه فیزیک/})
 fireEvent.click(within(block).getByRole('button',{name:'مباحث بازه'}))
 expect(await screen.findByText('فصل ۱، درس ۱، حرکت')).toBeTruthy()
 const groups=within(screen.getByRole('dialog')).getAllByRole('group')
 expect(groups.map(group=>group.getAttribute('aria-label'))).toEqual(grades)
 expect(within(groups[2]).getByRole('checkbox')).toBeTruthy()
 expect(screen.getByText('۲ بار')).toBeTruthy()
 expect(screen.queryByText('فصل ۱')).toBeNull()
 editDescription('فیزیک\nمرور\nنوشته قبلی')
 fireEvent.click(screen.getByRole('checkbox'))
 await waitFor(()=>expect(descriptionText()).toBe('فیزیک\nمرور\nحرکت'))
 expect(descriptionText()).not.toContain('فصل ۱')
 fireEvent.click(screen.getByRole('checkbox'))
 editDescription('فیزیک\nمرور')
 fireEvent.click(screen.getByRole('checkbox'))
 await waitFor(()=>expect(descriptionText()).toBe('فیزیک\nمرور\nحرکت'))
 editDescription('فیزیک\nمرور\nحرکت و تست')
 expect(screen.getByRole('checkbox',{checked:true})).toBeTruthy()
 expect(descriptionText()).toBe('فیزیک\nمرور\nحرکت و تست')
})


test('copy previous week keeps weekday assignments after changing the start date',async()=>{
 const plan={id:'previous',student_id:'student',title:'week',week_label:'week',status:'published',days:[],activities:[{id:'old',day:'شنبه',title:'Saturday lesson',subject:'ریاضی',start_time:'08:00',end_time:'09:00'}]}
 vi.mocked(api).mockImplementation(async(path:string)=>path==='/plans'?[plan]:null)
 const {container}=setup()
 await waitFor(()=>expect((screen.getByRole('button',{name:/کپی برنامه هفته قبل/}) as HTMLButtonElement).disabled).toBe(false))
 fireEvent.click(screen.getByRole('button',{name:/کپی برنامه هفته قبل/}))
 fireEvent.change(screen.getByRole('combobox',{name:'سال'}),{target:{value:'1405'}})
 fireEvent.change(screen.getByRole('combobox',{name:'ماه'}),{target:{value:'7'}})
 fireEvent.change(screen.getByRole('combobox',{name:'روز'}),{target:{value:'21'}})
 const rows=container.querySelectorAll('.timeline-editor-day')
 expect(rows[0].querySelector('header b')?.textContent).toBe('سه‌شنبه')
 const row=Array.from(rows).find(row=>row.querySelector('header b')?.textContent==='شنبه')!
 expect(within(row as HTMLElement).getByRole('button',{name:'ویرایش بازه Saturday lesson'})).toBeTruthy()
 expect(within(rows[0] as HTMLElement).queryByRole('button',{name:'ویرایش بازه Saturday lesson'})).toBeNull()
})
