import {expect,test} from 'vitest'
import {detectSubjectColor,detectSubjects,subjectBlockStyle,readableTextColor} from './subjectColors'
test.each([
 ['تست فیزیک فصل دوم','physics'],
 ['مرور زيست‌شناسي','biology'],
 ['شيمی: حل تمرین','chemistry'],
 ['ریاضی\nحل تست','math'],
 ['مرور دین و زندگی','religion'],
 ['تست دینی','religion'],
 ['فارسی — قرابت معنایی','persian'],
 ['ادبیات فارسی','persian'],
 ['علوم و فنون ادبی','persian'],
 ['زبان و ادبیات فارسی','persian'],
 ['جامعهشناسی','sociology'],
 ['مرور زمین‌شناسی','geology'],
 ['ریاضی سپس فیزیک','math'],
 ['فیزیک سپس ریاضی','physics'],
 ['تمرین بدنی و آمادگی ذهنی','general'],
 ['مطالعه و مرور','general'],
])('detects %s as %s',(text,id)=>expect(detectSubjectColor(text).id).toBe(id))


test('ambiguous lessons are unique and generic words within full names do not add a lesson',()=>{
 expect(detectSubjects('فیزیک و ریاضی و فیزیک').map(s=>s.id)).toEqual(['physics','math'])
 expect(detectSubjects('زبان و ادبیات فارسی').map(s=>s.id)).toEqual(['persian'])
})
test('manual colors override detection and light/dark backgrounds get readable text',()=>{
 expect(subjectBlockStyle('بدون درس').background).toBe('#e5e7eb')
 expect(subjectBlockStyle('بدون درس').color).toBe('#000000')
 expect(subjectBlockStyle('فیزیک','ریاضی','#ffffff')).toEqual({background:'#ffffff',borderColor:'#ffffff',color:'#000000'})
 expect(readableTextColor('#000000')).toBe('#ffffff')
 expect(subjectBlockStyle('فیزیک و ریاضی','ریاضی').background).toBe(detectSubjectColor('ریاضی').color)
})
