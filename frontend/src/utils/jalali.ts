import { jalaaliMonthLength, jalaaliToDateObject, toJalaali } from 'jalaali-js'
export type JalaliDate={year:number;month:number;day:number}
export const persianMonths=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند']
export const faNumber=(value:string|number)=>String(value).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[Number(d)])
export function todayJalali():JalaliDate{const j=toJalaali(new Date());return {year:j.jy,month:j.jm,day:j.jd}}
export function parseApiDate(value:string){return new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(value)?value:`${value}Z`)}
export function isoToJalali(value?:string|null):JalaliDate{if(!value)return todayJalali();const j=toJalaali(parseApiDate(value));return {year:j.jy,month:j.jm,day:j.jd}}
export function jalaliToIso(value:JalaliDate){return jalaaliToDateObject(value.year,value.month,value.day).toISOString()}
export function formatJalali(value?:string|null,withWeekday=false){if(!value)return 'ثبت نشده';return new Intl.DateTimeFormat('fa-IR-u-ca-persian',{year:'numeric',month:'long',day:'numeric',timeZone:'Asia/Tehran',...(withWeekday?{weekday:'long' as const}:{})}).format(parseApiDate(value))}
export function formatJalaliDateTime(value?:string|null){if(!value)return '—';return new Intl.DateTimeFormat('fa-IR-u-ca-persian',{year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tehran'}).format(parseApiDate(value))}
export function formatIranDateTime(value?:string|null){if(!value)return '—';return new Intl.DateTimeFormat('fa-IR',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Tehran'}).format(parseApiDate(value))}
export function daysInJalali(value:JalaliDate){return jalaaliMonthLength(value.year,value.month)}
export function remainingDays(value?:string|null){if(!value)return 0;return Math.max(0,Math.ceil((parseApiDate(value).getTime()-Date.now())/86400000))}
