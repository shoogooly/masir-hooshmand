type Interval={id:string;start_time:string;end_time:string}
const minutes=(clock:string)=>{const [h,m]=clock.split(':').map(Number);return h*60+m}
// 120 minutes receives 1.5 times the space of 60 minutes.
const exponent=Math.log(1.5)/Math.log(2)
export const timelineWeight=(duration:number)=>Math.pow(duration,exponent)
export function softTimelinePositions(items:Interval[],start:string,end:string){
 const base=minutes(start),limit=minutes(end)
 const sorted=items.map(item=>({...item,start:minutes(item.start_time),end:minutes(item.end_time)})).sort((a,b)=>a.start-b.start)
 const segments:{id?:string;duration:number}[]=[]
 let cursor=base
 for(const item of sorted){
  // Invalid drafts keep their original positioning until the advisor fixes them.
  if(!Number.isFinite(item.start+item.end)||item.start<cursor||item.end>limit||item.end<=item.start)return new Map<string,{right:string;width:string}>()
  if(item.start>cursor)segments.push({duration:item.start-cursor})
  segments.push({id:item.id,duration:item.end-item.start});cursor=item.end
 }
 if(cursor<limit)segments.push({duration:limit-cursor})
 const total=segments.reduce((sum,s)=>sum+timelineWeight(s.duration),0)
 const positions=new Map<string,{right:string;width:string}>()
 let offset=0
 for(const segment of segments){
  const width=timelineWeight(segment.duration)/total*100
  if(segment.id)positions.set(segment.id,{right:offset+'%',width:width+'%'})
  offset+=width
 }
 return positions
}
