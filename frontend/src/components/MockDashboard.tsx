import { Bell, BookOpen, ChartNoAxesCombined, Home, MessageSquare, Settings, Users } from 'lucide-react'
import ChartCard from './ChartCard'

export default function MockDashboard() {
  return <div className="mock-dashboard">
    <aside><span className="mini-brand">◆</span><Home/><Users/><BookOpen/><ChartNoAxesCombined/><MessageSquare/><Bell/><Settings/></aside>
    <div className="mock-content">
      <div className="mock-top"><b>پنل مشاور</b><span>مدیریت یکپارچه دانش‌آموزان در یک نگاه</span></div>
      <div className="mock-grid"><div className="student-list"><h4>لیست دانش‌آموزان</h4>{['علی حسینی','سارا احمدی','پارسا رضایی','نگار یوسفی'].map((n,i)=><div key={n}><span className={`avatar av-${i}`}>{n[0]}</span><p><b>{n}</b><small>پیشرفت هفتگی</small></p><em>{78+i*5}٪</em></div>)}</div><ChartCard /></div>
      <div className="mock-bottom"><div><h4>هشدارهای هوش مصنوعی</h4><p>۳ دانش‌آموز نیاز به بررسی برنامه دارند</p></div><div className="donut"><b>۸۳٪</b></div><div><h4>نتایج آخرین آزمون</h4><p>میانگین گروه ۷۹٪ · روند مثبت</p></div></div>
    </div>
  </div>
}

