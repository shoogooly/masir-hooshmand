export const advisorStudentSections = [
  { key: 'report', label: 'گزارش عملکرد', aliases: ['گزارش کار', 'پیشرفت'] },
  { key: 'plan', label: 'برنامه ساز', aliases: ['برنامه درسی', 'برنامه هفتگی'] },
  { key: 'school-schedule', label: 'برنامه مدرسه' },
  { key: 'exams', label: 'آزمون‌ها' },
  { key: 'external-results', label: 'کارنامه آزمون‌های آزمایشی' },
  { key: 'academic-calendar', label: 'تقویم آموزشی' },
  { key: 'chat', label: 'گفت‌وگو', aliases: ['چت', 'پیام‌ها'] },
  { key: 'evaluation', label: 'ارزیابی مشاور از دانش‌آموز' },
  { key: 'books', label: 'کتاب‌ها' },
  { key: 'renewal-billing', label: 'نوع محاسبه هزینه', aliases: ['تعرفه', 'تمدید اشتراک', 'دستمزد'] },
]

export function normalizeAdvisorSearch(value: string) {
  return value.normalize('NFKC').toLowerCase()
    .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
    .replace(/[\u064B-\u065F\u0670\s\u200c\u200d\-ـ]/g, '')
}
