// @vitest-environment jsdom
import {expect,test} from 'vitest'
import {createPrintSheet} from './planPdf'
import type {WeeklyPlan} from '../types'
test('simple PDF remains plain and colored PDF uses persisted choices and contrast',()=>{
 const plan={title:'برنامه',week_label:'هفته',days:[{label:'شنبه',date:'1405/06/21'}],day_start_time:'08:00',day_end_time:'11:00',activities:[
 {day:'شنبه',start_time:'08:00',end_time:'09:00',title:'فیزیک و ریاضی',subject:'ریاضی',color:'#ffff00'},
 {day:'شنبه',start_time:'09:00',end_time:'10:00',title:'فیزیک',subject:'فیزیک'},
 ]} as WeeklyPlan
 const source=document.createElement('div')
 const plain=createPrintSheet(source,plan),color=createPrintSheet(source,plan,true)
 const plainCards=plain.querySelectorAll<HTMLElement>('.print-plan-card')
 const cards=color.querySelectorAll<HTMLElement>('.print-plan-card')
 expect(plainCards[0].style.background).toBe('')
 expect(cards[0].style.background).toBe('rgb(255, 255, 0)')
 expect(cards[0].querySelector('p')!.style.color).toBe('rgb(0, 0, 0)')
 expect(cards[1].querySelector('p')!.style.color).toBe('rgb(255, 255, 255)')
 expect(cards[2].classList.contains('print-plan-rest')).toBe(true)
 expect(color.textContent).toContain('نسخه رنگی')
})
