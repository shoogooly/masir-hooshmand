import { expect, test } from 'vitest'
import { singlePageSize, timelineSegments } from './planPdf'
import type { WeeklyPlan } from '../types'

test('study, internal rest and boundary rests use their actual minutes on every day',()=>{
 const plan={day_start_time:'03:00',day_end_time:'24:00',activities:[
  {day:'شنبه',start_time:'08:00',end_time:'08:15',title:'کوتاه'},
  {day:'شنبه',start_time:'09:00',end_time:'10:00',title:'بلند'}
 ]} as WeeklyPlan
 const spans=timelineSegments(plan,'شنبه')
 expect(spans.map(x=>x.end-x.start)).toEqual([300,15,45,60,840])
 expect(spans.map(x=>x.rest)).toEqual([true,false,true,false,true])
 expect(spans.reduce((sum,x)=>sum+x.end-x.start,0)).toBe(1260)
 expect(timelineSegments(plan,'یکشنبه')).toEqual([{start:180,end:1440,title:'.......',rest:true}])
})
test.each([[1280,700],[1280,1700],[1280,4000]])('always fits the whole sheet on A4 (%i × %i)',(width,height)=>{
 const page=singlePageSize(width,height)
 expect(page.width).toBeCloseTo(841.89)
 expect(page.height).toBeCloseTo(595.28)
 const scale=Math.min((page.width-page.margin*2)/width,(page.height-page.margin*2)/height)
 expect(width*scale).toBeLessThanOrEqual(page.width-page.margin*2+0.0001)
 expect(height*scale).toBeLessThanOrEqual(page.height-page.margin*2+0.0001)
})
