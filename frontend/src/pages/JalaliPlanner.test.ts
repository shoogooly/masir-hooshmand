import { expect, test } from 'vitest'
import { buildJalaliWeek, timelinePosition, validateTimeline } from './OperationalPages'

test('builds seven consecutive Persian dates and weekdays from the selected first date',()=>{
  const week=buildJalaliWeek({year:1405,month:5,day:27})

  expect(week).toHaveLength(7)
  expect(week[0]).toMatchObject({label:'سه‌شنبه',date:'۱۴۰۵/۰۵/۲۷'})
  expect(week[1]).toMatchObject({label:'چهارشنبه',date:'۱۴۰۵/۰۵/۲۸'})
  expect(week[6]).toMatchObject({label:'دوشنبه',date:'۱۴۰۵/۰۶/۰۲'})
  expect(new Set(week.map(day=>day.id)).size).toBe(7)
})

test('sizes daily activities in proportion to the shared day range',()=>{
  const saturday=timelinePosition('07:00','08:00','07:00','24:00')
  const sunday=timelinePosition('08:00','09:06','07:00','24:00')

  expect(parseFloat(saturday.right)).toBeCloseTo(0)
  expect(parseFloat(saturday.width)).toBeCloseTo(100/17)
  expect(parseFloat(sunday.right)).toBeCloseTo(100/17)
  expect(parseFloat(sunday.width)).toBeCloseTo(66/(17*60)*100)
})

test('allows independent ranges per day and rejects overlaps',()=>{
  const independent=[{id:'1',dayId:'شنبه',start:'07:00',end:'08:00',title:'الف'},{id:'2',dayId:'یکشنبه',start:'07:30',end:'08:36',title:'ب'}]
  const overlapping=[...independent,{id:'3',dayId:'شنبه',start:'07:30',end:'08:30',title:'ج'}]
  expect(validateTimeline(independent,'07:00','24:00')).toBe('')
  expect(validateTimeline(overlapping,'07:00','24:00')).toContain('هم‌پوشانی')
})
