// @vitest-environment jsdom
import {expect,test} from 'vitest'
import {createPrintSheet,fitPrintText} from './planPdf'
import type {WeeklyPlan} from '../types'

test.each([false,true])('PDF uses softened durations for activities and gaps (colored=%s)',colored=>{
 const plan={title:'برنامه',week_label:'هفته',days:[{label:'شنبه'}],day_start_time:'08:00',day_end_time:'14:00',activities:[
  {day:'شنبه',start_time:'08:00',end_time:'09:00',title:'یک ساعت'},
  {day:'شنبه',start_time:'09:00',end_time:'11:00',title:'دو ساعت'},
  {day:'شنبه',start_time:'12:00',end_time:'12:15',title:'ربع ساعت'},
 ]} as WeeklyPlan
 const sheet=createPrintSheet(document.createElement('div'),plan,colored)
 const grid=(sheet.querySelector('.print-plan-cards') as HTMLElement).style.gridTemplateColumns
 const weights=[...grid.matchAll(/([\d.]+)fr/g)].map(match=>Number(match[1]))
 expect(weights).toHaveLength(5)
 expect(weights[1]/weights[0]).toBeCloseTo(1.5)
 expect(weights[2]).toBeCloseTo(weights[0])
 expect(weights[3]/weights[0]).toBeGreaterThan(.25)
 expect(sheet.querySelectorAll('.print-plan-card')[3].textContent).toContain('۱۲:۱۵')
})
test('colored and monochrome PDFs share the illustrated layout with soft subject colors',()=>{
 const plan={title:'برنامه',week_label:'هفته',days:[{label:'شنبه',date:'1405/06/21'}],day_start_time:'08:00',day_end_time:'11:00',activities:[
 {day:'شنبه',start_time:'08:00',end_time:'09:00',title:'فیزیک و ریاضی\nتمرین تستی',subject:'ریاضی',color:'#ffff00'},
 {day:'شنبه',start_time:'09:00',end_time:'10:00',title:'فیزیک',subject:'فیزیک'},
 ]} as WeeklyPlan
 const source=document.createElement('div')
 const plain=createPrintSheet(source,plan),color=createPrintSheet(source,plan,true)
 const plainCards=plain.querySelectorAll<HTMLElement>('.print-plan-card')
 const cards=color.querySelectorAll<HTMLElement>('.print-plan-card')
 expect(plainCards[0].style.background).toBe('')
 expect(cards[0].style.background).toBe('rgb(255, 255, 184)')
 expect(cards[0].style.color).toBe('rgb(23, 21, 44)')
 expect(cards[1].style.background).not.toBe(cards[0].style.background)
 expect(cards[0].querySelector('.print-plan-card-first-line')?.textContent).toBe('فیزیک و ریاضی')
 expect(cards[0].querySelector('.print-plan-card-detail')?.textContent).toBe('تمرین تستی')
 expect(cards[2].classList.contains('print-plan-rest')).toBe(true)
 expect(cards[2].querySelector('p')).toBeNull()
 expect(cards[2].querySelector('svg')).toBeTruthy()
 expect(cards[2].querySelector('.print-plan-time')?.textContent).toBe('۱ ساعت')
 expect(cards[2].querySelector('.print-plan-time-text')?.getAttribute('dir')).toBe('rtl')
 expect(cards[0].querySelector('.print-plan-time-text')?.textContent).toBe('۰۸:۰۰ تا ۰۹:۰۰')
 expect([...cards[0].querySelectorAll('.print-plan-range-time span')].map(part=>part.textContent)).toEqual(['۰۸:۰۰',' تا ','۰۹:۰۰'])
 expect(color.querySelector('.print-hero-brand img')?.getAttribute('src')).toBe('/brand/mahyaad-logo.png')
 expect(color.querySelectorAll('.print-hero-tile .print-hero-icon svg')).toHaveLength(5)
 expect(color.querySelector('.print-day-cycle img')?.getAttribute('src')).toBe('/brand/plan-day-cycle.png')
 expect(plain.querySelectorAll('.print-plan-day')).toHaveLength(color.querySelectorAll('.print-plan-day').length)
 expect(color.querySelector('.print-plan-date span')?.textContent).toBe('۲۱ شهریور')
 expect(color.querySelectorAll('.print-hero-week strong')).toHaveLength(1)
 expect(color.querySelector('.print-hero-week strong')?.textContent).toBe('۲۱ شهریور')
})

test('a narrow PDF time strip shrinks its own label to fit',()=>{
 const plan={days:[{label:'شنبه'}],day_start_time:'08:00',day_end_time:'09:00',activities:[{day:'شنبه',start_time:'08:00',end_time:'09:00',title:'درس'}]} as WeeklyPlan
 const sheet=createPrintSheet(document.createElement('div'),plan,true)
 const strip=sheet.querySelector<HTMLElement>('.print-plan-card .print-plan-time')!
 const label=strip.querySelector<HTMLElement>('.print-plan-time-text')!
 Object.defineProperty(strip,'clientWidth',{value:40})
 label.getBoundingClientRect=()=>({width:Number.parseFloat(label.style.fontSize||'15')*8} as DOMRect)
 fitPrintText(sheet)
 expect(label.style.getPropertyPriority('font-size')).toBe('important')
 expect(Number.parseFloat(label.style.fontSize)).toBeLessThan(15)
 expect(label.getBoundingClientRect().width).toBeLessThanOrEqual(38)
})

test('week dates are shown once on separate lines without a year',()=>{
 const plan={id:'preview',student_id:'student',version:1,status:'draft',time_slots:[],title:'برنامه',week_label:'از ۱۴۰۵/۰۸/۰۵ تا ۱۴۰۵/۰۸/۱۱',days:[{label:'شنبه',date:'۱۴۰۵/۰۸/۰۵'},{label:'جمعه',date:'۱۴۰۵/۰۸/۱۱'}],day_start_time:'08:00',day_end_time:'10:00',activities:[]} as WeeklyPlan
 const sheet=createPrintSheet(document.createElement('div'),plan,true)
 expect([...sheet.querySelectorAll('.print-hero-week strong')].map(item=>item.textContent)).toEqual(['۵ آبان','۱۱ آبان'])
 expect([...sheet.querySelectorAll('.print-plan-date span')].map(item=>item.textContent)).toEqual(['۵ آبان','۱۱ آبان'])
 expect(sheet.textContent).not.toContain('۱۴۰۵')
})
