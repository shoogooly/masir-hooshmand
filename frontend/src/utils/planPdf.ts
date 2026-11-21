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
 const motifs={
  autumn:['<path d="M16 29C1 23 2 9 6 3c16 0 25 13 10 26Z" fill="#d99a42"/><path d="M16 32 9 8m5 15-7-4m6-3 4-7" stroke="#98603b" fill="none"/>','<path d="m16 3 4 8 7-4-2 9 6 2-11 9-4 3-5-4L1 18l7-2-2-9 7 4Z" fill="#bf6940"/><path d="M16 33V12m0 11 8-6m-8 6-7-6" stroke="#8f5037" fill="none"/>'],
  winter:['<g fill="none" stroke="#85b9d3" stroke-width="1.6"><path d="M16 2v28M4 9l24 14M4 23 28 9M12 5l4 4 4-4M12 27l4-4 4 4M4 14l6-2-1-6m14 20-1-6 6-2M4 18l6 2-1 6m14-20-1 6 6 2"/></g>'],
  spring:['<g fill="#edb8c6"><ellipse cx="16" cy="10" rx="5" ry="8"/><ellipse cx="10" cy="17" rx="8" ry="5"/><ellipse cx="22" cy="17" rx="8" ry="5"/><ellipse cx="16" cy="23" rx="5" ry="8"/></g><circle cx="16" cy="17" r="4" fill="#dbb45b"/>'],
  summer:['<g stroke="#e7b94e" stroke-width="2"><path d="M16 1v5m0 20v5M1 16h5m20 0h5M5 5l4 4m14 14 4 4M5 27l4-4M23 9l4-4"/></g><circle cx="16" cy="16" r="8" fill="#f2cd6b"/>']
 }
 const decor=node('div','print-season-decor');decor.setAttribute('aria-hidden','true')
 const maple='M48 85 30 74 8 69 19 58 5 43 25 44 19 23 37 33 48 6 58 32 78 20 73 43 94 38 83 58 94 67 65 76 53 86Z'
 const oak='M48 86C30 82 17 71 26 64 7 56 16 43 29 46 14 31 29 20 38 29 32 9 48 0 55 14 65 2 78 18 65 31 84 25 92 42 74 49 95 53 83 69 66 67 72 80 59 85 48 86Z'
 const leaf='M48 87C12 77 6 42 48 7 91 38 85 74 48 87Z'
 function ornament(index:number,size:number,angle:number){
  const img=document.createElement('img');img.alt='';img.className='print-season-ornament'
  const palette=[['#f8c754','#bd5a1e'],['#df7133','#8d292c'],['#cb4b39','#772d39'],['#edab35','#bd6224']][index%4]
  const shape=[maple,oak,leaf][index%3]
  const artwork=season==='autumn'?`<defs><linearGradient id="leaf" x2=".8" y2="1"><stop stop-color="${palette[0]}"/><stop offset="1" stop-color="${palette[1]}"/></linearGradient></defs><path d="${shape}" fill="url(#leaf)" stroke="${palette[1]}" stroke-width=".7"/><path d="M48 98 49 24M49 73 27 58m22 5 24-15M49 49 34 35m15 8 14-13" fill="none" stroke="#793c27" stroke-opacity=".6" stroke-width="1.4" stroke-linecap="round"/>`:motifs[season][index%motifs[season].length]
  img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 ${season==='autumn'?'100 100':'34 34'}">${artwork}</svg>`)
  img.style.cssText=`width:${size}px;height:${size}px;transform:rotate(${angle}deg)`
  if(season==='autumn'){
   const variant=index%3
   img.src='/brand/'+['autumn-natural-cluster.png','autumn-branch.png','autumn-maple.png'][variant]
   img.style.width=size*(variant===2?1:1.65)+'px';img.style.height=size*(variant===0?.83:variant===1?1.1:.9)+'px'
  }else{
   const variant=index%3
   const files=[`${season}-natural-v2-1.png`,`${season}-natural-v2-2.png`,`${season}-natural-v2-3.png`]
   img.src='/brand/'+files[variant]
   img.style.width=size*1.65+'px';img.style.height=size*.825+'px'
   if(season==='winter')img.style.transform=`rotate(${Math.round(angle/90)*90+(index%3-1)*8}deg)`
  }
  return img
 }
 // Deliberate clusters at the corners; breathing room along the long edges.
 const positions=[[0,0,65,-35],[3,-1,52,35],[7,0,42,95],[0,6,47,-60],[94,-1,65,40],[90,0,43,-30],[97,5,48,120],[0,88,58,10],[3,94,64,-50],[8,96,44,60],[95,92,68,35],[91,96,48,-70],[97,85,46,120],[22,-1,36,40],[51,0,32,-20],[75,-1,40,65],[27,96,36,-45],[65,97,38,45],[0,35,38,-40],[97,53,42,70],[0,69,34,20]]
 for(const [i,[x,y,size,angle]] of positions.entries()){
  const img=ornament(i,size,angle);img.style.left=x+'%';img.style.top=y+'%';decor.append(img)
 }
 if(season!=='autumn'){
  decor.replaceChildren()
  const xPositions=[-2,7,17,29,40,51,63,74,86,95]
  for(let i=0;i<xPositions.length;i++)for(const bottom of [false,true]){
   const item=ornament(i+(bottom?1:0),[76,62,86,68][(i+(bottom?2:0))%4],(bottom?175:0)+[-28,21,-9,34][i%4])
   item.style.left=(xPositions[i]+(bottom?1:0))+'%';item.style.top=bottom?'94.5%':[-3.5,-2,-4.5,-2.8][i%4]+'%';decor.append(item)
  }
  const yPositions=[3,15,28,42,56,69,82,93]
  for(let i=0;i<yPositions.length;i++)for(const right of [false,true]){
   const item=ornament(i+(right?2:0),[67,55,77,61][i%4],(right?-88:91)+[-18,27,-31,12][i%4])
   item.style.left=right?'95.5%':'-3.8%';item.style.top=(yPositions[i]+(right?2:0))+'%';decor.append(item)
  }
  for(const [i,x] of [3,12,22,35,45,57,68,80,91].entries())for(const bottom of [false,true]){
   const item=ornament(i+2+(bottom?1:0),[55,72,49,64][i%4],(bottom?181:-4)+[37,-24,16,-35][i%4])
   item.style.left=(x+(bottom?1.8:0))+'%';item.style.top=bottom?'96%':'-3.2%';decor.append(item)
  }
  for(const [i,y] of [8,21,34,48,62,75,88].entries())for(const right of [false,true]){
   const item=ornament(i+1+(right?2:0),[51,69,57,74][i%4],(right?-91:86)+[29,-36,13][i%3])
   item.style.left=right?'96.7%':'-3.7%';item.style.top=(y+(right?2:-1))+'%';decor.append(item)
  }
 }
 if(season==='autumn'){
  decor.replaceChildren()
  const offsets=[-3,4,12,19,29,35,44,53,59,69,78,85,94]
  for(let i=0;i<offsets.length;i++){
   for(const bottom of [false,true]){
    const variant=bottom?(i*7+2)%3:i%3
    const spray=ornament(variant,[110,85,67,102,76][(i+(bottom?2:0))%5],(bottom?165:0)+[22,-31,48,-12,8][i%5])
    spray.style.left=(offsets[i]+(bottom?2:0))+'%';spray.style.top=(bottom?94+[1,-1,2,0][i%4]:[-4,-3,-2.8,-5][i%4])+'%'
    decor.append(spray)
   }
  }
  for(let i=0;i<7;i++)for(const right of [false,true]){
   const spray=ornament(i+(right?1:0),[75,64,48,82][i%4],(right?-82:87)+[12,-27,34][i%3])
   spray.style.left=right?'96%':'-4%';spray.style.top=([9,21,36,47,61,76,86][i]+(right?4:0))+'%';decor.append(spray)
  }
  // Fill the open stretches with smaller, offset clusters, not a repeated strip.
  for(const [i,y] of [4,17,28,32,43,55,66,71,82,91].entries())for(const right of [false,true]){
   const spray=ornament((i+(right?2:0))%3,[62,54,72,58][i%4],(right?-95:78)+[24,-18,39,-31][i%4])
   spray.style.left=right?'96.5%':'-3.6%';spray.style.top=(y+(right?2:-1))+'%';decor.append(spray)
  }
  for(const [i,x] of [7,16,25,38,47,57,66,75,88].entries())for(const bottom of [false,true]){
   const spray=ornament((i+(bottom?1:0))%3,[73,59,82,65][i%4],(bottom?172:5)+[-27,36,-9,18][i%4])
   spray.style.left=(x+(bottom?1.5:0))+'%';spray.style.top=bottom?'96%':'-3.8%';decor.append(spray)
  }
 }
 sheet.append(decor)
 const reference=source.querySelector<HTMLElement>('.pdf-reference-header')
 const studentName=reference?.dataset.studentName||reference?.querySelector('h1')?.textContent||plan.title
 const advisorName=reference?.dataset.advisorName||reference?.querySelector('p')?.textContent||'—'
 const header=node('header','print-hero print-season-'+planSeason(plan.days.find(day=>day.date)?.date))
 const identity=node('div','print-hero-identity')
 const number=node('div','print-hero-number')
 if(plan.status==='published'&&plan.publication_number){number.textContent=faNumber(plan.publication_number);number.setAttribute('aria-label',`برنامه شماره ${plan.publication_number}`)}
 else {number.classList.add('print-hero-draft');number.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h10l4 4v14H5zM15 3v5h5M8 13h7M8 17h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/><path d="m16 15 3-3 2 2-3 3-3 1z" fill="currentColor"/></svg><span>پیش‌نویس</span>';number.setAttribute('aria-label','پیش‌نویس')}
 identity.append(number)
 const names=node('div','print-hero-names')
 names.append(node('div','',`دانش‌آموز: ${studentName}`),node('div','',`مشاور: ${advisorName}`))
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
  if(dayIndex<plan.days.length-1){
   const divider=node('div','print-day-divider')
   if(dayIndex%2===0){const fallen=ornament(dayIndex+1,30,dayIndex*37-40);fallen.style.left=[18,62,37][dayIndex/2%3]+'%';divider.append(fallen)}
   table.append(divider)
  }
 }
 sheet.append(table)
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
  await Promise.all(Array.from(sheet.querySelectorAll('img'),async img=>{
   // Embed assets before SVG rendering; external image URLs are not available
   // inside the isolated SVG image document used by foreignObject.
   if(!img.src.startsWith('data:')){
    const response=await fetch(img.currentSrc||img.src)
    if(!response.ok)throw new Error('تصویر برنامه بارگذاری نشد؛ دوباره تلاش کنید.')
    const blob=await response.blob()
    img.src=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob)})
   }
   await img.decode()
  }))
  for(const el of [sheet,...sheet.querySelectorAll<HTMLElement>('*')])el.style.setProperty('font-family','Tahoma, sans-serif','important')
  // Keep nested text widths tied to the card when the browser serializes styles.
  for(const span of sheet.querySelectorAll<HTMLElement>('.print-plan-card-first-line,.print-plan-card-detail')){span.style.width='100%';span.style.maxWidth='100%';span.style.textAlign='center'}
  fitPrintText(sheet)
  const width=sheet.offsetWidth,height=sheet.scrollHeight
  const page=singlePageSize(width,height)
  const canvas=await html2canvas(sheet,{scale:3,backgroundColor:'#fff',useCORS:true,logging:false,windowWidth:1500,foreignObjectRendering:true,onclone:(_doc,clonedSheet)=>{
   // The export host is offscreen; normalize it before html2canvas measures
   // the cloned bounds, otherwise foreignObject paints outside the canvas.
   if(clonedSheet.parentElement)clonedSheet.parentElement.style.cssText='position:absolute;left:0;top:0;margin:0;padding:0'
   // Native browser shaping preserves Persian joins and bidi runs across wrapped lines.
   // SVG foreignObject cannot reuse remote @font-face resources; use the installed
   // Persian-capable font consistently in both measurement and rendering.
   for(const el of [clonedSheet,...clonedSheet.querySelectorAll<HTMLElement>('*')])el.style.setProperty('font-family','Tahoma, sans-serif','important')
  }})
  if(!colored){
   const context=canvas.getContext('2d')!
   const pixels=context.getImageData(0,0,canvas.width,canvas.height)
   for(let i=0;i<pixels.data.length;i+=4){const gray=Math.round(.2126*pixels.data[i]+.7152*pixels.data[i+1]+.0722*pixels.data[i+2]);pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=gray}
   context.putImageData(pixels,0,0)
  }
  const pdf=appendTo||new jsPDF({orientation:'landscape',unit:'pt',format:[page.width,page.height],compress:true})
  if(appendTo)pdf.addPage([page.width,page.height],'landscape')
  const pw=pdf.internal.pageSize.getWidth(),ph=pdf.internal.pageSize.getHeight()
  const scale=Math.min((pw-2*page.margin)/canvas.width,(ph-2*page.margin)/canvas.height)
  pdf.addImage(canvas.toDataURL('image/jpeg',.94),'JPEG',(pw-canvas.width*scale)/2,(ph-canvas.height*scale)/2,canvas.width*scale,canvas.height*scale,undefined,'SLOW')
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
 for(const [selector,initial,minimum] of [['.print-hero-quote',22,12],['.print-hero-mission strong',23,11],['.print-hero-names',19,12]] as const){
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
