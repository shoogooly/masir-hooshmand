import { BrainCircuit, ClipboardCheck, GraduationCap, LineChart, MessageCircle, Sparkles, Target, UserRoundCheck } from 'lucide-react'

export const services = [
  { icon: Sparkles, title: 'دستیار هوشمند', text: 'پیشنهادهای شخصی‌سازی‌شده و قابل توضیح' },
  { icon: ClipboardCheck, title: 'آزمون‌های هفتگی', text: 'ارزیابی منظم و تحلیل دقیق مبحثی' },
  { icon: BrainCircuit, title: 'تحلیل هوش مصنوعی', text: 'کشف الگوهای پیشرفت و نقاط قابل بهبود' },
  { icon: UserRoundCheck, title: 'مشاور اختصاصی', text: 'پشتیبانی حرفه‌ای و برنامه‌ریزی انسانی' },
  { icon: LineChart, title: 'نمودار پیشرفت', text: 'مشاهده روشن روند مطالعه و آزمون‌ها' },
  { icon: Target, title: 'برنامه مطالعاتی', text: 'برنامه هفتگی متناسب با هدف و زمان شما' },
]

export const steps = [
  { icon: GraduationCap, title: 'ثبت‌نام و انتخاب', text: 'ثبت‌نام کنید و هدف تحصیلی خود را انتخاب کنید.' },
  { icon: BrainCircuit, title: 'تحلیل هوشمند', text: 'مسیر هوشمند وضعیت و داده‌های آموزشی شما را بررسی می‌کند.' },
  { icon: ClipboardCheck, title: 'برنامه هفتگی شخصی', text: 'برنامه با تایید مشاور برای شما منتشر می‌شود.' },
  { icon: Target, title: 'آزمون و پیشرفت', text: 'هر هفته نتیجه را بسنجید و مسیر بعدی را بشناسید.' },
]

export const testimonials = [
  { name: 'پارسا رضایی', meta: 'رتبه ۸۱۲ کنکور تجربی ۱۴۰۴', text: 'گزارش‌های دقیق مسیر هوشمند باعث شد بفهمم کجا زمانم را از دست می‌دهم و برنامه‌ام واقعاً قابل اجرا شد.' },
  { name: 'سارا محمدی', meta: 'رتبه ۵۶ کنکور انسانی ۱۴۰۴', text: 'پیشنهادهای هوشمند همراه با بازبینی مشاور، برنامه‌ریزی را برایم ساده و مطمئن کرد.' },
  { name: 'علی حسینی', meta: 'رتبه ۳۴ کنکور ریاضی ۱۴۰۴', text: 'ثبت روزانه و آزمون‌های کوتاه کمک کرد پیشرفتم را واقعی و قابل اندازه‌گیری ببینم.' },
]

export const fa = new Intl.NumberFormat('fa-IR')
