import {Plus, Trash2} from 'lucide-react'
import {persianMonths} from '../utils/jalali'

export type CalendarNode = {id:string;parent_id:string|null;subject:string;title:string;month:number|null;day:number|null;depth?:number}
const newNode=(parent?:CalendarNode):CalendarNode=>({id:crypto.randomUUID(),parent_id:parent?.id||null,
  subject:parent?.subject||'',title:'',month:null,day:null,depth:(parent?.depth||0)+1})
const maxDay=(month:number)=>month<=6?31:30

export default function CalendarTreeEditor({nodes,onChange}:{nodes:CalendarNode[];onChange:(nodes:CalendarNode[])=>void}){
 const edit=(id:string,changes:Partial<CalendarNode>)=>{
  const old=nodes.find(node=>node.id===id)
  if(!old)return
  const descendants=new Set([id])
  if(old.parent_id===null&&changes.title!==undefined){
   for(const node of nodes)if(node.parent_id&&descendants.has(node.parent_id))descendants.add(node.id)
  }
  onChange(nodes.map(node=>node.id===id?{...node,...changes,...(old.parent_id===null&&changes.title!==undefined?{subject:changes.title}:{})}:
    old.parent_id===null&&changes.title!==undefined&&descendants.has(node.id)?{...node,subject:changes.title}:node))
 }
 const remove=(id:string)=>{
  const ids=new Set([id]);let changed=true
  while(changed){changed=false;for(const node of nodes)if(node.parent_id&&ids.has(node.parent_id)&&!ids.has(node.id)){ids.add(node.id);changed=true}}
  onChange(nodes.filter(node=>!ids.has(node.id)))
 }
 const addChild=(parent:CalendarNode)=>{
  const index=nodes.findIndex(node=>node.id===parent.id)
  let insertion=index+1
  while(insertion<nodes.length&&(nodes[insertion].depth||1)>(parent.depth||1))insertion++
  onChange([...nodes.slice(0,insertion),newNode(parent),...nodes.slice(insertion)])
 }
 return <div className="calendar-tree-editor"><p>برای هر درس تا پنج سطح زیرمجموعه بسازید. مهلت مطالعه برای هر سطح اختیاری است.</p>
  <button type="button" className="btn btn-outline" onClick={()=>onChange([...nodes,newNode()])}><Plus/> افزودن درس</button>
  <div className="calendar-tree-list">{nodes.map(node=><div className="calendar-tree-node" key={node.id} style={{marginInlineStart:`${((node.depth||1)-1)*18}px`}}>
   <label>{node.parent_id?'عنوان زیرمجموعه':'نام درس'}<input required maxLength={node.parent_id?180:120} value={node.title} onChange={e=>edit(node.id,{title:e.target.value})} placeholder={node.parent_id?'فصل، درس، گفتار یا مبحث':'مثلاً فیزیک'}/></label>
   <label>مهلت ماه<select value={node.month||''} onChange={e=>edit(node.id,{month:e.target.value?Number(e.target.value):null,day:e.target.value?Math.min(node.day||1,maxDay(Number(e.target.value))):null})}><option value="">بدون تاریخ</option>{persianMonths.map((month,i)=><option value={i+1} key={month}>{month}</option>)}</select></label>
   {node.month&&<label>روز<select value={node.day||1} onChange={e=>edit(node.id,{day:Number(e.target.value)})}>{Array.from({length:maxDay(node.month)},(_,i)=><option value={i+1} key={i}>{(i+1).toLocaleString('fa-IR')}</option>)}</select></label>}
   {(node.depth||1)<5&&<button type="button" className="small-secondary" onClick={()=>addChild(node)}><Plus size={16}/> زیرمجموعه</button>}
   <button type="button" className="icon-button" aria-label={'حذف '+(node.title||'ردیف')} onClick={()=>remove(node.id)}><Trash2 size={17}/></button>
  </div>)}</div>
 </div>
}
