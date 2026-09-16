export type SubjectColor={id:string;label:string;color:string;aliases:string[]}
export const subjectColors:SubjectColor[]=[
 {id:'physics',label:'فیزیک',color:'#245bb2',aliases:['فیزیک']},
 {id:'biology',label:'زیست',color:'#237445',aliases:['زیست شناسی','زیست']},
 {id:'chemistry',label:'شیمی',color:'#805034',aliases:['شیمی']},
 {id:'math',label:'ریاضی',color:'#b52d40',aliases:['ریاضیات','ریاضی','حسابان','هندسه','گسسته','آمار و احتمال','آمار']},
 {id:'religion',label:'دین و زندگی',color:'#8a650e',aliases:['دین و زندگی','دینی','تعلیمات دینی','هدیه های آسمان','هدیه آسمان']},
 {id:'persian',label:'فارسی و ادبیات',color:'#85419c',aliases:['زبان و ادبیات فارسی','ادبیات فارسی','ادبیات','فارسی','نگارش','علوم و فنون ادبی','علوم و فنون']},
 {id:'arabic',label:'عربی',color:'#b54c1b',aliases:['عربی']},
 {id:'english',label:'زبان انگلیسی',color:'#167678',aliases:['زبان انگلیسی','انگلیسی','زبان خارجی','زبان']},
 {id:'geology',label:'زمین‌شناسی',color:'#62702c',aliases:['زمین شناسی']},
 {id:'history',label:'تاریخ',color:'#785267',aliases:['تاریخ']},
 {id:'geography',label:'جغرافیا',color:'#166e98',aliases:['جغرافیا','جغرافی']},
 {id:'sociology',label:'جامعه‌شناسی',color:'#aa3e72',aliases:['جامعه شناسی','علوم اجتماعی','مطالعات اجتماعی','اجتماعی']},
 {id:'philosophy',label:'فلسفه',color:'#464d9e',aliases:['فلسفه']},
 {id:'logic',label:'منطق',color:'#65549a',aliases:['منطق']},
 {id:'psychology',label:'روان‌شناسی',color:'#9a4653',aliases:['روان شناسی']},
 {id:'economics',label:'اقتصاد',color:'#91602d',aliases:['اقتصاد']},
 {id:'science',label:'علوم تجربی',color:'#367761',aliases:['علوم تجربی','علوم']},
 {id:'health',label:'سلامت و بهداشت',color:'#43722e',aliases:['سلامت و بهداشت','بهداشت','سلامت']},
 {id:'quran',label:'قرآن',color:'#387b88',aliases:['قرآن','قران']},
 {id:'defense',label:'آمادگی دفاعی',color:'#63614a',aliases:['آمادگی دفاعی','دفاعی']},
]
export const defaultSubjectColor:SubjectColor={id:'general',label:'عمومی',color:'#e5e7eb',aliases:[]}
const normalize=(text:string)=>text.replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[\u200c\u200d]/g,' ').replace(/\s+/g,' ').trim()
const matchers=subjectColors.flatMap(subject=>subject.aliases.map(alias=>({
 subject,pattern:new RegExp('(^|[^\\p{L}])('+normalize(alias).split(' ').join('\\s*')+')(?=$|[^\\p{L}])','u')
})))
export function detectSubjects(text:string):SubjectColor[]{
 const normalized=normalize(text)
 const matches=matchers.flatMap(({subject,pattern})=>{
  const match=pattern.exec(normalized)
  return match?[{subject,start:match.index+match[1].length,end:match.index+match[0].length}]:[]
 }).sort((a,b)=>a.start-b.start||(b.end-b.start)-(a.end-a.start))
 const accepted:typeof matches=[]
 for(const match of matches){
  if(accepted.some(other=>match.start<other.end&&match.end>other.start))continue
  accepted.push(match)
 }
 return accepted.filter((match,index)=>accepted.findIndex(other=>other.subject.id===match.subject.id)===index).map(match=>match.subject)
}
export function detectSubjectColor(text:string,preferred?:string):SubjectColor{
 return subjectColors.find(subject=>subject.id===preferred||subject.label===preferred)||detectSubjects(text)[0]||defaultSubjectColor
}
export function readableTextColor(hex:string){
 const rgb=hex.replace('#','').match(/.{2}/g)!.map(part=>parseInt(part,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4)
 const luminance=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]
 return (luminance+.05)/.05>=1.05/(luminance+.05)?'#000000':'#ffffff'
}
export function subjectBlockStyle(text:string,preferred?:string,customColor?:string){
 const color=customColor&&/^#[0-9a-f]{6}$/i.test(customColor)?customColor:detectSubjectColor(text,preferred).color
 return {background:color,borderColor:color,color:readableTextColor(color)}
}
