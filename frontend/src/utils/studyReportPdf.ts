import type { WeeklyPlan } from '../types'
import { activityLines, dayLines, type StudyReports } from '../pages/studyReportTypes'
import { singlePageSize } from './planPdf'
import '../styles/study-report-pdf.css'

function el(tag:string,cls:string,text?:string){const item=document.createElement(tag);item.className=cls;if(text!==undefined)item.textContent=text;return item}
export function createStudyReportSheet(plan:WeeklyPlan,reports:StudyReports,studentName:string,advisorName:string){
 const sheet=el('section','study-pdf');sheet.dir='rtl'
 const header=el('header','study-pdf-header')
 header.append(el('h1','','برنامه و گزارش کار '+studentName),el('p','',plan.week_label+' · مشاور: '+advisorName))
 sheet.append(header)
 const days=el('div','study-pdf-days')
 days.style.gridTemplateRows=`repeat(${Math.max(1,plan.days.length)},minmax(0,1fr))`
 for(const day of plan.days){
  const row=el('section','study-pdf-day'),content=el('div','study-pdf-content')
  content.append(el('h2','',day.label+' · '+day.date))
  const activities=plan.activities.filter(a=>a.day===day.label).sort((a,b)=>a.start_time.localeCompare(b.start_time))
  const cards=el('div','study-pdf-cards')
  cards.style.gridTemplateColumns=`repeat(${Math.max(1,Math.min(4,activities.length))},minmax(0,1fr))`
  for(const activity of activities){
   const card=el('article','study-pdf-card')
   card.append(el('b','',activity.start_time+' تا '+activity.end_time+' · '+activity.title))
   const lines=activityLines(reports.activities[activity.id]?.values,'بدون پاسخ')
   card.append(el('p','',lines.join(' | ')||'گزارشی ثبت نشده است.'))
   cards.append(card)
  }
  if(!activities.length)cards.append(el('p','','فعالیتی ثبت نشده است.'))
  content.append(cards,el('p','study-pdf-daily','گزارش روز: '+(dayLines(reports.days[day.label]?.values).join(' | ')||'ثبت نشده است.')))
  row.append(content);days.append(row)
 }
 sheet.append(days,el('footer','study-pdf-footer','مأموریت هفته: '+(plan.weekly_mission||'ثبت نشده است.')+' · مهیاد'))
 return sheet
}
export function fitStudyReportSheet(sheet:HTMLElement){
 // Give busy days more space before reducing text, so a ten-activity day stays readable.
 const rows=Array.from(sheet.querySelectorAll<HTMLElement>('.study-pdf-day'))
 const weights=rows.map(row=>{
  const content=row.querySelector<HTMLElement>('.study-pdf-content')!
  const cards=row.querySelector<HTMLElement>('.study-pdf-cards')!
  const count=cards.querySelectorAll('.study-pdf-card').length
  content.style.fontSize='15px'
  let best=1,height=Infinity
  for(let columns=1;columns<=Math.max(1,Math.min(6,count));columns++){
   cards.style.gridTemplateColumns=`repeat(${columns},minmax(0,1fr))`
   const measured=content.getBoundingClientRect().height
   if(measured<height){height=measured;best=columns}
  }
  cards.style.gridTemplateColumns=`repeat(${best},minmax(0,1fr))`
  return Math.max(45,height+8)
 })
 sheet.querySelector<HTMLElement>('.study-pdf-days')!.style.gridTemplateRows=weights.map(weight=>`minmax(0,${weight}fr)`).join(' ')
 for(const row of rows){
  const content=row.querySelector<HTMLElement>('.study-pdf-content')!
  let low=.25,high=15
  for(let i=0;i<12;i++){
   const size=(low+high)/2;content.style.fontSize=size+'px'
   if(content.getBoundingClientRect().height<=row.clientHeight-8 && content.scrollWidth<=content.clientWidth+1)low=size
   else high=size
  }
  content.style.fontSize=low+'px'
 }
}
export async function buildStudyReportPdf(plan:WeeklyPlan,reports:StudyReports,studentName:string,advisorName:string){
 const [{default:html2canvas},{jsPDF}]=await Promise.all([import('html2canvas'),import('jspdf')])
 await document.fonts.ready
 const sheet=createStudyReportSheet(plan,reports,studentName,advisorName)
 const host=el('div','study-pdf-host');host.append(sheet);document.body.append(host)
 try{
  fitStudyReportSheet(sheet)
  const canvas=await html2canvas(sheet,{scale:3,backgroundColor:'#fff',logging:false,windowWidth:1500,useCORS:true})
  const page=singlePageSize(canvas.width,canvas.height)
  const pdf=new jsPDF({orientation:'landscape',unit:'pt',format:'a4',compress:true})
  const scale=Math.min((page.width-page.margin*2)/canvas.width,(page.height-page.margin*2)/canvas.height)
  pdf.addImage(canvas.toDataURL('image/png'),'PNG',(page.width-canvas.width*scale)/2,(page.height-canvas.height*scale)/2,canvas.width*scale,canvas.height*scale,undefined,'FAST')
  return pdf
 }finally{host.remove()}
}
export async function exportStudyReportPdf(plan:WeeklyPlan,reports:StudyReports,studentName:string,advisorName:string){
 const pdf=await buildStudyReportPdf(plan,reports,studentName,advisorName)
 pdf.save(('گزارش-'+plan.week_label).replace(/[\\/:*?"<>|]/g,'-')+'.pdf')
}
