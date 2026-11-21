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
const faClock=(value:number)=>clock(value).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[Number(d)])
const faNumber=(value:number)=>value.toLocaleString('fa-IR')
const jalaliMonths=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند']
export function shortJalaliDate(value?:string){
 if(!value)return ''
 const normalized=value.replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
 const match=normalized.match(/^(?:\d{4}[/-])?(\d{1,2})[/-](\d{1,2})$/)
 if(match){const month=Number(match[1]),day=Number(match[2]);if(month>=1&&month<=12&&day>=1&&day<=31)return `${faNumber(day)} ${jalaliMonths[month-1]}`}
 return value
}
export function restDuration(totalMinutes:number){
 const hours=Math.floor(totalMinutes/60),remaining=totalMinutes%60
 return [hours?`${faNumber(hours)} ساعت`:'',remaining?`${faNumber(remaining)} دقیقه`:''].filter(Boolean).join(' و ')||'۰ دقیقه'
}
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
const heroIconPaths={
 week:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-13 4h2m4 0h2m-8 4h2"/>',
 quote:'<path d="M3 12c0-4 2-7 7-8v3c-2 .8-3 2-3 4h4v9H3v-8Zm11 0c0-4 2-7 7-8v3c-2 .8-3 2-3 4h4v9h-8v-8Z"/>',
 mission:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/><path d="m12 12 8-9m-2 0h2v2"/>',
 advisor:'<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2 20v-2a6 6 0 0 1 12 0v2H2Zm13 0v-2a5 5 0 0 0-1-3 5 5 0 0 1 8 4v1h-7Z"/>',
 student:'<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2H4Z"/>'
} as const
type HeroIcon=keyof typeof heroIconPaths
function heroIcon(kind:HeroIcon){
 const icon=node('span','print-hero-icon')
 icon.setAttribute('aria-hidden','true')
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg')
 svg.setAttribute('viewBox','0 0 24 24')
 svg.innerHTML=heroIconPaths[kind]
 icon.append(svg)
 return icon
}
export function planSeason(date?:string){
 const normalized=(date||'').replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
 const month=Number(normalized.match(/^(?:\d{4}[/-])?(\d{1,2})[/-]\d{1,2}$/)?.[1])
 if(month>=1&&month<=3)return 'spring'
 if(month>=4&&month<=6)return 'summer'
 if(month>=10&&month<=12)return 'winter'
 return 'autumn'
}
export function createPrintSheet(source:HTMLElement,plan:WeeklyPlan,colored=false){
 const sheet=node('section','planner-pdf-sheet print-theme-'+(colored?'color':'mono'));sheet.dir='rtl'
 const season=planSeason(plan.days.find(day=>day.date)?.date)
 sheet.classList.add('print-season-'+season)
 const decor=node('div','print-season-decor')
 decor.setAttribute('aria-hidden','true')
 const autumn=season==='autumn'
 const assets=autumn
  ? ['autumn-natural-cluster.png','autumn-branch.png','autumn-maple.png']
  : [1,2,3].map(index=>`${season}-natural-v2-${index}.png`)
 for(const edge of ['top','bottom'] as const){
  const strip=node('div',`print-season-strip print-season-strip-${edge}`)
  for(let index=0;index<13;index++){
   const variant=(index+(edge==='bottom'?1:0))%assets.length
   const size=(autumn?[105,79,60,92,73]:[80,66,88,72,76])[index%5]
   const img=document.createElement('img')
   img.alt=''
   img.className='print-season-ornament'
   img.src='/brand/'+assets[variant]
   img.style.left=(index*8-2)+'%'
   img.style.width=size*(autumn&&variant===2?1:1.65)+'px'
   img.style.height=size*(autumn?[.83,1.1,.9][variant]:.825)+'px'
   img.style.transform=`rotate(${(edge==='bottom'?180:0)+[-18,24,-7,12][index%4]}deg)`
   strip.append(img)
  }
  decor.append(strip)
 }
 sheet.append(decor)
 const reference=source.querySelector<HTMLElement>('.pdf-reference-header')
 const studentName=reference?.dataset.studentName?.trim()||plan.title
 const advisorName=reference?.dataset.advisorName?.trim()||'—'
 const header=node('header','print-hero print-season-'+planSeason(plan.days.find(day=>day.date)?.date))
 const identity=node('div','print-hero-identity')
 const number=node('div','print-hero-number')
 if(plan.status==='published'&&plan.publication_number){number.textContent=faNumber(plan.publication_number);number.setAttribute('aria-label',`برنامه شماره ${plan.publication_number}`)}
 else {number.classList.add('print-hero-draft');number.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h10l4 4v14H5zM15 3v5h5M8 13h7M8 17h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/><path d="m16 15 3-3 2 2-3 3-3 1z" fill="currentColor"/></svg><span>پیش‌نویس</span>';number.setAttribute('aria-label','پیش‌نویس')}
 identity.append(number)
 const names=node('div','print-hero-names')
 for(const [label,value] of [['دانش‌آموز',studentName],['مشاور',advisorName]]){
  const row=node('div','print-hero-name')
  const name=node('bdi','print-hero-name-value',value)
  name.dir='rtl'
  row.append(node('span','print-hero-name-label',label+': '),name)
  names.append(row)
 }
 identity.append(names)
 const message=node('div','print-hero-message')
 const quote=node('div','print-hero-quote',plan.motivational_quote?.trim()||'با برنامه، هر روز یک قدم جلوتر به رؤیاهایت نزدیک‌تر شو.')
 const mission=node('div','print-hero-mission')
 mission.append(node('span','print-hero-mission-label','مأموریت هفته'),node('strong','',plan.weekly_mission?.trim()||'با پشتکار به هدف این هفته نزدیک شو.'))
 message.append(quote,mission)
 const brand=node('div','print-hero-brand'),logo=document.createElement('img')
 logo.src='/brand/mahyaad-logo.png';logo.alt='لوگوی مهیاد'
 const logoHalo=node('div','print-hero-logo-halo')
 logoHalo.append(logo)
 brand.append(logoHalo,node('strong','','مهیاد'),node('small','','مسیر هوشمند یادگیری'))
 header.append(identity,message,brand);sheet.append(header)
 const table=node('main','print-plan-days')
 for(const [dayIndex,day] of plan.days.entries()){
  const row=node('section','print-plan-day');row.dataset.day=String(dayIndex)
  const label=node('header','print-plan-date')
  label.append(node('b','',day.label),node('span','',shortJalaliDate(day.date)));row.append(label)
  const items=timelineSegments(plan,day.label),cards=node('div','print-plan-cards')
  cards.style.gridTemplateColumns=items.map(item=>`minmax(0,${plan.plan_mode==='volume'?item.end-item.start:timelineWeight(item.end-item.start)}fr)`).join(' ')
  for(const item of items){
   const card=node('article','print-plan-card'+(item.rest?' print-plan-rest':''))
   card.dataset.minutes=String(item.end-item.start)
   if(colored&&!item.rest){const style=lightSubjectBlockStyle(item.title,item.subject,item.color);card.style.background=style.background;card.style.borderColor=style.borderColor;card.style.color=style.color;card.style.setProperty('--card-head',style.borderColor)}
   const time=node('small','print-plan-time')
   const timeText=node('span','print-plan-time-text')
   if(item.rest){timeText.dir='rtl';timeText.textContent=restDuration(item.end-item.start)}
   else if(plan.plan_mode==='volume')timeText.textContent=restDuration(item.end-item.start)
   else{
    timeText.classList.add('print-plan-range-time')
    timeText.append(node('span','print-plan-time-start',faClock(item.start)),node('span','print-plan-time-separator',' تا '),node('span','print-plan-time-end',faClock(item.end)))
   }
   time.append(timeText)
   card.append(time)
   if(item.rest){const symbol=node('div','print-plan-rest-icon');symbol.setAttribute('aria-label','استراحت');symbol.append(restIcon(day.label,item.start,item.end));card.append(symbol)}
   else{
    const title=node('p','print-plan-card-title')
    const [firstLine,...otherLines]=item.title.split(/\r?\n/)
    title.append(node('span','print-plan-card-first-line',firstLine))
    if(otherLines.length)title.append(node('span','print-plan-card-detail',otherLines.join('\n')))
    card.append(title)
   }
   cards.append(card)
  }
  row.append(cards);table.append(row)
  if(dayIndex<plan.days.length-1)table.append(node('div','print-day-divider'))
 }
 sheet.append(table)
 return sheet
}
function encodePrintImage(canvas:HTMLCanvasElement){
 return new Promise<Blob>((resolve,reject)=>{
  canvas.toBlob(blob=>{
   if(blob?.size)resolve(blob)
   else reject(new Error('ساخت تصویر برنامه ناموفق بود؛ دوباره تلاش کنید.'))
  },'image/jpeg',.92)
 })
}

async function loadPlanPdfFonts(fonts:FontFaceSet){
 const loaded=await Promise.allSettled([
  fonts.load('700 16px PDFTitr','برنامه هفتگی'),
  fonts.load('400 16px PDFIranSans','نام دانش‌آموز و مشاور')
 ])
 if(loaded.some(result=>result.status==='rejected'||!result.value.some(face=>face.status==='loaded'))){
  throw new Error('فونت‌های PDF بارگذاری نشدند. اتصال اینترنت را بررسی و دوباره تلاش کنید.')
 }
}

export async function buildPlanPdf(element:HTMLElement,plan:WeeklyPlan,colored=false,appendTo?:PdfDocument){
 const [{default:html2canvas},{jsPDF}]=await Promise.all([import('html2canvas'),import('jspdf')])
 const sheet=createPrintSheet(element,plan,colored)
 const host=node('div','print-plan-host')
 host.append(sheet)
 document.body.append(host)
 try{
  await loadPlanPdfFonts(document.fonts)
  fitPrintText(sheet)
  const width=sheet.offsetWidth,height=sheet.offsetHeight
  // Fixed bounds and the canvas renderer avoid capturing a scrolled or clipped viewport.
  const canvas=await html2canvas(sheet,{
   scale:2, width, height, scrollX:0, scrollY:0, windowWidth:Math.max(width,document.documentElement.clientWidth),
   backgroundColor:'#fff',useCORS:true,logging:false,imageTimeout:4000,
   onclone:clonedDocument=>loadPlanPdfFonts(clonedDocument.fonts),
   ignoreElements:el=>el.parentElement===document.body&&el!==host&&el.tagName!=='STYLE'&&el.tagName!=='LINK'
  })
  let image:Uint8Array
  try{
   const context=canvas.getContext('2d')
   if(!context||canvas.width!==width*2||canvas.height!==height*2)throw new Error('صفحهٔ برنامه کامل ساخته نشد؛ دوباره تلاش کنید.')
   const preview=document.createElement('canvas')
   preview.width=64
   preview.height=44
   const sample=preview.getContext('2d',{willReadFrequently:true})!
   sample.drawImage(canvas,0,0,64,44)
   for(const top of [0,24]){
    const pixels=sample.getImageData(0,top,64,20).data
    if(!pixels.some((value,index)=>index%4!==3&&value<190))throw new Error('صفحهٔ برنامه کامل ساخته نشد؛ دوباره تلاش کنید.')
   }
   if(!colored){
    const pixels=context.getImageData(0,0,canvas.width,canvas.height)
    for(let i=0;i<pixels.data.length;i+=4){
     const gray=Math.round(.2126*pixels.data[i]+.7152*pixels.data[i+1]+.0722*pixels.data[i+2])
     pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=gray
    }
    context.putImageData(pixels,0,0)
   }
   image=new Uint8Array(await (await encodePrintImage(canvas)).arrayBuffer())
  }finally{canvas.width=canvas.height=0}
  const page=singlePageSize(width,height)
  const pdf=appendTo||new jsPDF({orientation:'landscape',unit:'pt',format:[page.width,page.height],compress:true})
  if(appendTo)pdf.addPage([page.width,page.height],'landscape')
  const pw=pdf.internal.pageSize.getWidth(),ph=pdf.internal.pageSize.getHeight()
  const scale=Math.min((pw-2*page.margin)/width,(ph-2*page.margin)/height)
  pdf.addImage(image,'JPEG',(pw-width*scale)/2,(ph-height*scale)/2,width*scale,height*scale)
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
  const label=time.querySelector<HTMLElement>('.print-plan-time-text')!
  const available=Math.max(1,time.clientWidth-2)
  let size=15
  label.style.setProperty('font-size',`${size}px`,'important')
  const measured=label.getBoundingClientRect().width
  if(measured>available){
   size=Math.max(2,Math.min(size,size*available/measured))
   label.style.setProperty('font-size',`${size}px`,'important')
   while(size>2&&label.getBoundingClientRect().width>available){size=Math.max(2,size-.25);label.style.setProperty('font-size',`${size}px`,'important')}
  }
 }
 for(const day of sheet.querySelectorAll<HTMLElement>('.print-plan-date b')){
  const available=(day.parentElement?.clientWidth||0)-20
  day.style.whiteSpace='nowrap'
  day.style.width='max-content'
  let size=parseFloat(getComputedStyle(day).fontSize)
  while(size>14&&day.getBoundingClientRect().width>available){
   size-=.5
   day.style.fontSize=size+'px'
  }
 }
 for(const [selector,initial,minimum] of [['.print-hero-quote',15,10],['.print-hero-mission strong',14,10],['.print-hero-names',16,11]] as const){
  const value=sheet.querySelector<HTMLElement>(selector)
  if(!value)continue
  let size=initial
  value.style.fontSize=size+'px'
  while(size>minimum&&(value.scrollHeight>value.clientHeight+1||value.scrollWidth>value.clientWidth+1)){
   size-=.5;value.style.fontSize=size+'px'
  }
 }
}
export async function exportPlanPdf(element:HTMLElement,plan:WeeklyPlan,colored=false){
 const pdf=await buildPlanPdf(element,plan,colored)
 pdf.save(`برنامه-${colored?'رنگی-':'ساده-'}${plan.week_label.replace(/[\\/:*?"<>|]/g,'-')}.pdf`)
}


export async function exportArchivedPlans(plans:WeeklyPlan[],studentName:string,advisorName:string,colored=true){
 const source=document.createElement('div'),head=node('header','pdf-reference-header')
 head.dataset.studentName=studentName;head.dataset.advisorName=advisorName;source.append(head)
 let pdf:PdfDocument|undefined
 for(const plan of plans)pdf=await buildPlanPdf(source,plan,colored,pdf)
 if(pdf){
  const filename=plans.length===1?`mahyaad-plan-${plans[0].id}.pdf`:'mahyaad-plan-history.pdf'
  const blob=pdf.output('blob')
  pdf.save(filename)
  return {blob,filename}
 }
}
