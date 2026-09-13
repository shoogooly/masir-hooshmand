// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BirthDateInput from './BirthDateInput'
import { StudentProfileForm, AdvisorProfileForm } from '../pages/OnboardingForms'
vi.mock('../api',()=>({api:vi.fn()}))
afterEach(cleanup)
function Calendar(){const [value,setValue]=useState('');return <BirthDateInput value={value} onChange={setValue}/>}
test('Jalali calendar selects a birthday and accepts Persian digits',()=>{
 render(<Calendar/>);
 fireEvent.click(screen.getByRole('button',{name:'انتخاب تاریخ تولد از تقویم شمسی'}));
 fireEvent.click(screen.getByRole('button',{name:'۱۲ فروردین ۱۳۸۸'}));
 expect((screen.getByLabelText('تاریخ تولد') as HTMLInputElement).value).toBe('1388/01/12');
 expect(screen.queryByRole('dialog')).toBeNull();
 fireEvent.change(screen.getByLabelText('تاریخ تولد'),{target:{value:'۱۳۸۹/۰۲/۰۳'}});
 expect((screen.getByLabelText('تاریخ تولد') as HTMLInputElement).value).toBe('1389/02/03');
 fireEvent.change(screen.getByLabelText('تاریخ تولد'),{target:{value:'1400/12/30'}});
 expect((screen.getByLabelText('تاریخ تولد') as HTMLInputElement).validity.valid).toBe(false);
});
const initial={full_name:'دانش آموز آزمایشی',national_code:'1234567890',birth_date:'1388/01/01',parent_name:'ولی دانش آموز',parent_phone:'09123456789',address:'نشانی کامل برای آزمایش',school:'مدرسه',major:'تجربی',goal:'پزشکی',average_grade9:19};
function setup(advisor=false){const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});return render(<QueryClientProvider client={client}>{advisor?<AdvisorProfileForm initial={{...initial,documents:[{name:'identity.pdf'},{name:'degree.pdf'}]}} refresh={()=>{}}/>:<StudentProfileForm initial={initial} refresh={()=>{}}/>}</QueryClientProvider>)}
test('student back preserves fields and schedule is optional; postgraduate needs both averages',()=>{
 setup();fireEvent.click(screen.getByRole('button',{name:'مرحله بعد: سوابق تحصیلی'}));
 expect((screen.getByLabelText('شنبه زنگ 1') as HTMLInputElement).required).toBe(false);
 fireEvent.change(screen.getByLabelText('شنبه زنگ 1'),{target:{value:'ریاضی'}});
 fireEvent.click(screen.getByRole('button',{name:'مرحله قبل'}));
 expect((screen.getByLabelText('نام و نام خانوادگی') as HTMLInputElement).value).toBe(initial.full_name);
 fireEvent.click(screen.getByRole('button',{name:'مرحله بعد: سوابق تحصیلی'}));
 expect((screen.getByLabelText('شنبه زنگ 1') as HTMLInputElement).value).toBe('ریاضی');
 fireEvent.change(screen.getByLabelText('پایه'),{target:{value:'پشت کنکوری'}});
 expect((screen.getByLabelText('معدل یازدهم (الزامی)') as HTMLInputElement).required).toBe(true);
 expect((screen.getByLabelText('معدل دوازدهم (الزامی)') as HTMLInputElement).required).toBe(true);
});
test('advisor back preserves previously uploaded documents',()=>{
 setup(true);fireEvent.click(screen.getByRole('button',{name:'مرحله بعد: سوابق و مدارک'}));
 expect(screen.getByText('identity.pdf')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'مرحله قبل'}));
 expect(screen.getByRole('button',{name:'انتخاب تاریخ تولد از تقویم شمسی'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'مرحله بعد: سوابق و مدارک'}));
 expect(screen.getByText('degree.pdf')).toBeTruthy();
});
