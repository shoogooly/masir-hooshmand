import type {jsPDF as PdfDocument} from 'jspdf'
import {lightSubjectBlockStyle} from './subjectColors'
import {timelineWeight} from './softTimeline'
import type { WeeklyPlan } from '../types'
import '../styles/plan-pdf-reference.css'

// Always one A4 landscape page; fit the complete measured sheet in both dimensions.
export function singlePageSize(_width:number,_height:number){
 return {width:841.89,height:595.28,margin:18}
}
function node(tag:string,className:string,text?:string){const el=document.createElement(tag);el.className=className;if(text!==undefined)el.textContent=text;return el}
const minutes=(time:string)=>{const [h,m]=time.split(':').map(Number);return h*60+m}
const clock=(value:number)=>`${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`
const faClock=(value:number,compact=false)=>(compact?clock(value).replace(/:00$/,''):clock(value)).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[Number(d)])
export function timelineSegments(plan:WeeklyPlan,day:string){
 const items=plan.activities.filter(item=>item.day===day).sort((a,b)=>minutes(a.start_time)-minutes(b.start_time))
 if(plan.plan_mode==='volume')return items.map(item=>({start:minutes(item.start_time),end:minutes(item.end_time),title:item.title,rest:false,subject:item.subject,color:item.color}))
 // Keep shared time bounds and include older activities outside the configured bounds.
 const start=Math.min(minutes(plan.day_start_time||'08:00'),...plan.activities.map(item=>minutes(item.start_time)))
 const end=Math.max(minutes(plan.day_end_time||'24:00'),...plan.activities.map(item=>minutes(item.end_time)))
 const segments:{start:number;end:number;title:string;rest:boolean;subject?:string;color?:string}[]=[]
 let cursor=start
 for(const item of items){
  const from=minutes(item.start_time),to=minutes(item.end_time)
  if(from>cursor)segments.push({start:cursor,end:from,title:'',rest:true})
  if(to>from)segments.push({start:from,end:to,title:item.title,rest:false,subject:item.subject,color:item.color})
  cursor=Math.max(cursor,to)
 }
 if(cursor<end)segments.push({start:cursor,end,title:'',rest:true})
 return segments
}
const restIcons=[
 '<path d="M4 9h14v6a4 4 0 0 1-4 4h-6a4 4 0 0 1-4-4V9Zm14 1h2a2 2 0 0 1 0 4h-2M7 4v3m4-3v3m4-3v3M3 21h17"/>',
 '<path d="M3 18V6m0 10h18v2M6 16v-5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v5M6 13h15M8 9V7h4v2"/>',
 '<path d="M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v6H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2Zm16 0h-3v6h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2Z"/>',
 '<path d="M20 4C9 4 5 9 5 16c5 0 13-2 15-12ZM4 20c3-5 7-8 12-10"/>'
]
function restIcon(day:string,start:number,end:number){
 const index=Math.abs([...day].reduce((sum,char)=>sum*31+char.charCodeAt(0),start+end))%restIcons.length
 const icon=document.createElementNS('http://www.w3.org/2000/svg','svg')
 icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true')
 icon.innerHTML=restIcons[index]
 return icon
}
function heroTile(className:string,label:string,value:string){const tile=node('div','print-hero-tile '+className);tile.append(node('small','',label),node('strong','',value));return tile}
export function createPrintSheet(source:HTMLElement,plan:WeeklyPlan,colored=false){
 const sheet=node('section','planner-pdf-sheet print-theme-'+(colored?'color':'mono'));sheet.dir='rtl'
 const reference=source.querySelector<HTMLElement>('.pdf-reference-header')
 const studentName=reference?.dataset.studentName||reference?.querySelector('h1')?.textContent||plan.title
 const advisorName=reference?.dataset.advisorName||reference?.querySelector('p')?.textContent||'—'
 const header=node('header','print-hero')
 const dates=plan.days.map(day=>day.date).filter(Boolean)
 const week=heroTile('print-hero-week',plan.plan_mode==='volume'?'برنامه حجمی':'برنامه زمانی',plan.week_label)
 week.append(node('span','',dates.length?`${dates[0]} تا ${dates.at(-1)}`:''))
 const quote=heroTile('print-hero-quote','هر روز یک قدم جلوتر',plan.motivational_quote?.trim()||'با برنامه، هر روز یک قدم جلوتر!')
 const mission=heroTile('print-hero-mission','مأموریت این هفته',plan.weekly_mission?.trim()||'با پشتکار به هدف این هفته نزدیک شو.')
 const advisor=heroTile('print-hero-advisor','مشاور',advisorName)
 const student=heroTile('print-hero-student','دانش‌آموز',studentName)
 const brand=node('div','print-hero-brand'),logo=document.createElement('img')
 logo.src='/brand/mahyaad-logo.png';logo.alt='لوگوی مهیاد'
 brand.append(logo,node('strong','','مهیاد'),node('small','','برنامه هفتگی دانش‌آموز'))
 header.append(week,quote,mission,advisor,student,brand);sheet.append(header)
 const table=node('main','print-plan-days')
 for(const [dayIndex,day] of plan.days.entries()){
  const row=node('section','print-plan-day');row.dataset.day=String(dayIndex)
  const label=node('header','print-plan-date')
  label.append(node('b','',day.label),node('span','',day.date||''));row.append(label)
  const items=timelineSegments(plan,day.label),cards=node('div','print-plan-cards')
  cards.style.gridTemplateColumns=items.map(item=>`minmax(0,${plan.plan_mode==='volume'?item.end-item.start:timelineWeight(item.end-item.start)}fr)`).join(' ')
  for(const item of items){
   const card=node('article','print-plan-card'+(item.rest?' print-plan-rest':''))
   card.dataset.minutes=String(item.end-item.start)
   if(colored&&!item.rest){const style=lightSubjectBlockStyle(item.title,item.subject,item.color);card.style.background=style.background;card.style.borderColor=style.borderColor;card.style.color=style.color;card.style.setProperty('--card-head',style.borderColor)}
   const time=node('small','print-plan-time')
   if(plan.plan_mode==='volume')time.textContent=(item.end-item.start).toLocaleString('fa-IR')+' دقیقه'
   else{const compact=item.end-item.start<=60;time.textContent=faClock(item.start,compact)+'–'+faClock(item.end,compact)}
   card.append(time)
   if(item.rest){const symbol=node('div','print-plan-rest-icon');symbol.setAttribute('aria-label','استراحت');symbol.append(restIcon(day.label,item.start,item.end));card.append(symbol)}
   else card.append(node('p','print-plan-card-title',item.title))
   cards.append(card)
  }
  row.append(cards);table.append(row)
 }
 sheet.append(table)
 const footer=node('footer','print-day-cycle'),cycle=document.createElement('img')
 cycle.src='/brand/plan-day-cycle.png';cycle.alt='چرخهٔ تصویری صبح تا شب'
 footer.append(cycle);sheet.append(footer)
 return sheet
}
export async function buildPlanPdf(element:HTMLElement,plan:WeeklyPlan,colored=false,appendTo?:PdfDocument){
 const [{default:html2canvas},{jsPDF}]=await Promise.all([import('html2canvas'),import('jspdf')])
 await document.fonts.ready
 const host=node('div','print-plan-host'),sheet=createPrintSheet(element,plan,colored)
 host.append(sheet);document.body.append(host)
 try{
  // Inserting the sheet can load fonts not used elsewhere on the page.
  sheet.getBoundingClientRect()
  await document.fonts.ready
  await Promise.all(Array.from(sheet.querySelectorAll('img'),img=>img.decode().catch(()=>{})))
  fitPrintText(sheet)
  const width=sheet.offsetWidth,height=sheet.scrollHeight
  const page=singlePageSize(width,height)
  const canvas=await html2canvas(sheet,{scale:3,backgroundColor:'#fff',useCORS:true,logging:false,windowWidth:1500})
  const pdf=appendTo||new jsPDF({orientation:'landscape',unit:'pt',format:[page.width,page.height],compress:true})
  if(appendTo)pdf.addPage([page.width,page.height],'landscape')
  const pw=pdf.internal.pageSize.getWidth(),ph=pdf.internal.pageSize.getHeight()
  const scale=Math.min((pw-2*page.margin)/canvas.width,(ph-2*page.margin)/canvas.height)
  pdf.addImage(canvas.toDataURL('image/png'),'PNG',(pw-canvas.width*scale)/2,(ph-canvas.height*scale)/2,canvas.width*scale,canvas.height*scale,undefined,'FAST')
  return pdf
 }finally{host.remove()}
}
export function fitPrintText(sheet:HTMLElement){
 for(const card of sheet.querySelectorAll<HTMLElement>('.print-plan-card:not(.print-plan-rest)')){
  const title=card.querySelector<HTMLElement>('.print-plan-card-title')!
  let size=18
  while(size>9&&(title.scrollHeight>title.clientHeight+1||title.scrollWidth>title.clientWidth+1)){
   size-=.5;title.style.fontSize=size+'px'
  }
 }
 for(const time of sheet.querySelectorAll<HTMLElement>('.print-plan-time')){
  let size=13
  while(size>8&&time.scrollWidth>time.clientWidth+1){size-=.5;time.style.fontSize=size+'px'}
 }
 for(const tile of sheet.querySelectorAll<HTMLElement>('.print-hero-tile')){
  const value=tile.querySelector<HTMLElement>('strong')!
  let size=18
  while(size>11&&value.scrollHeight>value.clientHeight+1){size-=.5;value.style.fontSize=size+'px'}
 }
}
export async function exportPlanPdf(element:HTMLElement,plan:WeeklyPlan,colored=false){
 const pdf=await buildPlanPdf(element,plan,colored)
 pdf.save(`برنامه-${colored?'رنگی-':'ساده-'}${plan.week_label.replace(/[\\/:*?"<>|]/g,'-')}.pdf`)
}


export async function exportArchivedPlans(plans:WeeklyPlan[],studentName:string,advisorName:string,colored=true){
 const source=document.createElement('div'),head=document.createElement('header'),title=document.createElement('h1'),advisor=document.createElement('p')
 head.className='pdf-reference-header';head.dataset.studentName=studentName;head.dataset.advisorName=advisorName;title.textContent='برنامه هفتگی '+studentName;advisor.textContent='مشاور و برنامه‌ریز: '+advisorName;head.append(title,advisor);source.append(head)
 let pdf:PdfDocument|undefined
 for(const plan of plans)pdf=await buildPlanPdf(source,plan,colored,pdf)
 if(pdf){
  const filename=plans.length===1?`mahyaad-plan-${plans[0].id}.pdf`:'mahyaad-plan-history.pdf'
  const blob=pdf.output('blob')
  pdf.save(filename)
  return {blob,filename}
 }
}
