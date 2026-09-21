import {subjectBlockStyle} from './subjectColors'
import {timelineWeight} from './softTimeline'
import type { WeeklyPlan } from '../types'

// Always one A4 landscape page; fit the complete measured sheet in both dimensions.
export function singlePageSize(_width:number,_height:number){
 return {width:841.89,height:595.28,margin:18}
}
function node(tag:string,className:string,text?:string){const el=document.createElement(tag);el.className=className;if(text!==undefined)el.textContent=text;return el}
const minutes=(time:string)=>{const [h,m]=time.split(':').map(Number);return h*60+m}
const clock=(value:number)=>`${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`
export function timelineSegments(plan:WeeklyPlan,day:string){
 const items=plan.activities.filter(item=>item.day===day).sort((a,b)=>minutes(a.start_time)-minutes(b.start_time))
 // Keep shared time bounds and include older activities outside the configured bounds.
 const start=Math.min(minutes(plan.day_start_time||'08:00'),...plan.activities.map(item=>minutes(item.start_time)))
 const end=Math.max(minutes(plan.day_end_time||'24:00'),...plan.activities.map(item=>minutes(item.end_time)))
 const segments:{start:number;end:number;title:string;rest:boolean;subject?:string;color?:string}[]=[]
 let cursor=start
 for(const item of items){
  const from=minutes(item.start_time),to=minutes(item.end_time)
  if(from>cursor)segments.push({start:cursor,end:from,title:'.......',rest:true})
  if(to>from)segments.push({start:from,end:to,title:item.title,rest:false,subject:item.subject,color:item.color})
  cursor=Math.max(cursor,to)
 }
 if(cursor<end)segments.push({start:cursor,end,title:'.......',rest:true})
 return segments
}
export function createPrintSheet(source:HTMLElement,plan:WeeklyPlan,colored=false){
 const sheet=node('section','planner-pdf-sheet');sheet.dir='rtl'
 const header=node('header','print-plan-header')
 const identity=node('div','print-plan-identity')
 identity.append(node('h1','',source.querySelector('.pdf-reference-header h1')?.textContent||plan.title),node('p','',source.querySelector('.pdf-reference-header p')?.textContent||''),node('p','',`${plan.week_label} · ${plan.day_start_time||'08:00'} تا ${plan.day_end_time||'24:00'}`))
 header.append(identity,node('strong','print-plan-brand','مهیاد'));sheet.append(header)
 const main=node('div','print-plan-main'),table=node('div','print-plan-days')
 for(const day of plan.days){
  const row=node('section','print-plan-day'),label=node('header','print-plan-date')
  label.append(node('b','',day.label),node('span','',day.date||''));row.append(label)
  const items=timelineSegments(plan,day.label)
  const cards=node('div','print-plan-cards')
  cards.style.gridTemplateColumns=items.map(item=>`minmax(0,${timelineWeight(item.end-item.start)}fr)`).join(' ')
  for(const item of items){
   const card=node('article','print-plan-card'+(item.rest?' print-plan-rest':''))
   card.dataset.minutes=String(item.end-item.start)
   if(colored&&!item.rest)Object.assign(card.style,subjectBlockStyle(item.title,item.subject,item.color))
   const text=node('div','print-plan-card-content')
   const time=node('small','')
   time.append(node('span','',clock(item.start)),document.createTextNode(' تا '),node('span','',clock(item.end)))
   text.append(node('p','',item.title),time)
   if(colored&&!item.rest){
    const style=subjectBlockStyle(item.title,item.subject,item.color)
    text.style.color=style.color
    for(const child of text.children)(child as HTMLElement).style.color=style.color
   }
   card.append(text);cards.append(card)
  }
  row.append(cards);table.append(row)
 }
 const mission=node('aside','print-plan-mission');mission.append(node('h2','','مأموریت هفته'),node('p','',plan.weekly_mission?.trim()||'مأموریتی ثبت نشده است.'))
 main.append(table,mission);sheet.append(main,node('footer','print-plan-footer','مهیاد · برنامه هفتگی'+(colored?' · نسخه رنگی':'')))
 return sheet
}
export async function buildPlanPdf(element:HTMLElement,plan:WeeklyPlan,colored=false){
 const [{default:html2canvas},{jsPDF}]=await Promise.all([import('html2canvas'),import('jspdf')])
 await document.fonts.ready
 const host=node('div','print-plan-host'),sheet=createPrintSheet(element,plan,colored)
 host.append(sheet);document.body.append(host)
 try{
  // Inserting the sheet can load fonts not used elsewhere on the page.
  sheet.getBoundingClientRect()
  await document.fonts.ready
  fitPrintText(sheet)
  const width=sheet.offsetWidth,height=sheet.scrollHeight
  const page=singlePageSize(width,height)
  const canvas=await html2canvas(sheet,{scale:3,backgroundColor:'#fff',useCORS:true,logging:false,windowWidth:1500})
  const pdf=new jsPDF({orientation:'landscape',unit:'pt',format:[page.width,page.height],compress:true})
  const pw=pdf.internal.pageSize.getWidth(),ph=pdf.internal.pageSize.getHeight()
  const scale=Math.min((pw-2*page.margin)/canvas.width,(ph-2*page.margin)/canvas.height)
  pdf.addImage(canvas.toDataURL('image/png'),'PNG',(pw-canvas.width*scale)/2,(ph-canvas.height*scale)/2,canvas.width*scale,canvas.height*scale,undefined,'FAST')
  return pdf
 }finally{host.remove()}
}
export function fitPrintText(sheet:HTMLElement){
 // Fit each block independently; never enlarge a short interval or shrink its neighbours.
 const boxes=sheet.querySelectorAll<HTMLElement>('.print-plan-card')
 for(const box of boxes){
  const content=box.querySelector<HTMLElement>('.print-plan-card-content')!
  const padding=Math.min(4,box.clientWidth*.06,box.clientHeight*.04)
  box.style.padding=padding+'px'
  const height=box.clientHeight-padding*2
  let low=.1,high=16
  for(let i=0;i<12;i++){
   const size=(low+high)/2;content.style.fontSize=size+'px'
   if(content.getBoundingClientRect().height<=height && content.scrollWidth<=content.clientWidth+1)low=size
   else high=size
  }
  content.style.fontSize=low+'px'
 }
 const mission=sheet.querySelector<HTMLElement>('.print-plan-mission')!
 const body=mission.querySelector<HTMLElement>('p')!
 let size=16
 while(mission.scrollHeight>mission.clientHeight&&size>1){size-=.25;body.style.fontSize=size+'px'}
}
export async function exportPlanPdf(element:HTMLElement,plan:WeeklyPlan,colored=false){
 const pdf=await buildPlanPdf(element,plan,colored)
 pdf.save(`برنامه-${colored?'رنگی-':'ساده-'}${plan.week_label.replace(/[\\/:*?"<>|]/g,'-')}.pdf`)
}
