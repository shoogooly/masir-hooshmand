// @vitest-environment jsdom
import { useRef, useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import TimeFields from './TimeFields'
function Demo(){const [value,setValue]=useState('08:00');return <><TimeFields label="شروع کل روز" value={value} onChange={setValue}/><output>{value}</output></>}
function RangeDemo(){const [start,setStart]=useState('08:00'),[end,setEnd]=useState('09:00'),endHour=useRef<HTMLInputElement>(null);return <><TimeFields label="شروع بازه" value={start} onChange={setStart} onComplete={()=>endHour.current?.focus()}/><TimeFields label="پایان بازه" value={end} onChange={setEnd} hourInputRef={endHour}/><output>{start} تا {end}</output></>}
afterEach(cleanup)
test('two hour digits focus minutes and single digit pads on blur',()=>{
 render(<Demo/>);const hour=screen.getByLabelText('شروع کل روز ساعت'),minute=screen.getByLabelText('شروع کل روز دقیقه')
 fireEvent.change(hour,{target:{value:'05'}});expect(document.activeElement).toBe(minute)
 fireEvent.change(hour,{target:{value:'5'}});fireEvent.blur(hour)
 expect((hour as HTMLInputElement).value).toBe('05')
 fireEvent.change(minute,{target:{value:'6'}});fireEvent.blur(minute)
 expect((minute as HTMLInputElement).value).toBe('06');expect(screen.getByText('05:06')).toBeTruthy()
})
test('Persian and Arabic digits normalize, including midnight end',()=>{
 render(<Demo/>);fireEvent.change(screen.getByLabelText('شروع کل روز ساعت'),{target:{value:'۲۴'}})
 fireEvent.change(screen.getByLabelText('شروع کل روز دقیقه'),{target:{value:'٠٠'}})
 expect(screen.getByText('24:00')).toBeTruthy()
})
test('editing a range advances through all four fields and pads single digits on blur',()=>{
 render(<RangeDemo/>)
 const startHour=screen.getByLabelText('شروع بازه ساعت') as HTMLInputElement
 const startMinute=screen.getByLabelText('شروع بازه دقیقه') as HTMLInputElement
 const endHour=screen.getByLabelText('پایان بازه ساعت') as HTMLInputElement
 const endMinute=screen.getByLabelText('پایان بازه دقیقه') as HTMLInputElement
 fireEvent.change(startHour,{target:{value:'5'}});fireEvent.blur(startHour)
 expect(startHour.value).toBe('05')
 fireEvent.change(startMinute,{target:{value:'30'}})
 expect(document.activeElement).toBe(endHour)
 fireEvent.change(endHour,{target:{value:'11'}})
 expect(document.activeElement).toBe(endMinute)
 fireEvent.change(endMinute,{target:{value:'7'}});fireEvent.blur(endMinute)
 expect(endMinute.value).toBe('07')
 expect(screen.getByText('05:30 تا 11:07')).toBeTruthy()
})
test('Tab moves from a single-digit end hour to end minutes and adds a leading zero',()=>{
 render(<RangeDemo/>)
 const endHour=screen.getByLabelText('پایان بازه ساعت') as HTMLInputElement
 const endMinute=screen.getByLabelText('پایان بازه دقیقه') as HTMLInputElement
 fireEvent.change(endHour,{target:{value:'7'}})
 fireEvent.keyDown(endHour,{key:'Tab'})
 expect(endHour.value).toBe('07')
 expect(document.activeElement).toBe(endMinute)
 expect(screen.getByText('08:00 تا 07:00')).toBeTruthy()
})
