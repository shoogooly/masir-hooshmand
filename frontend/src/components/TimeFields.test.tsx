// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import TimeFields from './TimeFields'
function Demo(){const [value,setValue]=useState('08:00');return <><TimeFields label="شروع کل روز" value={value} onChange={setValue}/><output>{value}</output></>}
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
