import {expect,test} from 'vitest'
import {softTimelinePositions} from './softTimeline'
test('two hours receive 1.5 times one hour, with gaps and no overlap',()=>{
 const rows=[{id:'long',start_time:'10:00',end_time:'12:00'},{id:'short',start_time:'08:00',end_time:'09:00'},{id:'tiny',start_time:'12:00',end_time:'12:15'}]
 const result=softTimelinePositions(rows,'07:00','14:00')
 const one=result.get('short')!,two=result.get('long')!,tiny=result.get('tiny')!
 expect(parseFloat(two.width)/parseFloat(one.width)).toBeCloseTo(1.5)
 expect(parseFloat(tiny.width)/parseFloat(one.width)).toBeGreaterThan(.25)
 expect(parseFloat(two.right)).toBeGreaterThan(parseFloat(one.right)+parseFloat(one.width))
 expect(parseFloat(tiny.right)).toBeCloseTo(parseFloat(two.right)+parseFloat(two.width))
 expect(parseFloat(tiny.right)+parseFloat(tiny.width)).toBeLessThan(100)
})
test('full day stays within bounds and invalid overlaps fall back',()=>{
 expect(softTimelinePositions([{id:'all',start_time:'00:00',end_time:'24:00'}],'00:00','24:00').get('all')).toEqual({right:'0%',width:'100%'})
 expect(softTimelinePositions([{id:'a',start_time:'08:00',end_time:'10:00'},{id:'b',start_time:'09:00',end_time:'11:00'}],'07:00','24:00').size).toBe(0)
})
