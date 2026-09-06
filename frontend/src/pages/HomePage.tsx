import { ArrowLeft, ArrowUpLeft, BadgeCheck, BrainCircuit, Check, ChevronLeft, Clock3, GraduationCap, MessageCircleMore, Play, ShieldCheck, Sparkles, Star, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import Brand from '../components/Brand'
import ChartCard from '../components/ChartCard'
import MockDashboard from '../components/MockDashboard'
import PublicHeader from '../components/PublicHeader'
import PublicPricing from '../components/PublicPricing'
import { fa, services, steps, testimonials } from '../data/content'

export default function HomePage() {
  return <div className="home" id="top">
    <div className="hero-shell"><PublicHeader />
      <main className="hero container">
        <div className="hero-copy">
          <div className="eyebrow"><Sparkles/> مسیر موفقیت شما هوشمندانه</div>
          <h1>یادگیری <span>هوشمند،</span><br/>با برنامه‌ای که هر هفته<br/>برای شما ساخته می‌شود</h1>
          <p>با ترکیب هوش مصنوعی، مشاور اختصاصی و آزمون‌های منظم، مسیر یادگیری شما را شخصی‌سازی می‌کنیم تا سریع‌تر و بهتر به هدف‌تان برسید.</p>
          <div className="hero-actions"><Link className="btn btn-primary btn-lg" to="/login">شروع رایگان <ArrowLeft/></Link><a className="btn btn-soft btn-lg" href="#how"><Play/> مشاهده معرفی</a></div>
        </div>
        <div className="hero-art"><div className="hero-glow"/><img src="/assets/masir-hooshmand-hero.png" alt="دانش‌آموزی در حال استفاده از دستیار مسیر هوشمند"/><div className="advisor-pill"><span>آ</span><p><b>مشاور اختصاصی</b><small>آنلاین <i/></small></p></div><div className="robot-pill"><span>●</span><p><b>هوش مصنوعی</b><small>تحلیل ۲۴ ساعته</small></p></div></div>
      </main>
      <div className="stats container">{[{v:'+۱۵,۰۰۰',l:'دانش‌آموز فعال',i:Users},{v:'+۸۰',l:'مشاور تخصصی',i:GraduationCap},{v:'۹۴٪',l:'رضایت کاربران',i:Star},{v:'+۵۰,۰۰۰',l:'آزمون برگزار شده',i:BadgeCheck}].map(s=><div key={s.l}><s.i/><p><b>{s.v}</b><span>{s.l}</span></p></div>)}</div>
    </div>

    <section className="section container" id="how"><div className="section-title"><h2>چگونه کار می‌کند؟</h2><p>چهار مرحله تا یک یادگیری هدفمند و نتیجه‌محور</p></div><div className="steps">{steps.map((s,i)=><article key={s.title}><span className="step-number">{fa.format(i+1)}</span><div className="step-icon"><s.icon/></div><h3>{s.title}</h3><p>{s.text}</p>{i<steps.length-1&&<ArrowUpLeft className="step-arrow"/>}</article>)}</div></section>

    <section className="features-section" id="services"><div className="container feature-layout"><div className="services-copy"><div className="overline">همراه شما در مسیر موفقیت</div><h2>خدمات ویژه دانش‌آموزان</h2><p>همه ابزارهایی که برای موفقیت نیاز دارید، در یک فضای یکپارچه و ساده.</p><div className="service-grid">{services.map(s=><article key={s.title}><span><s.icon/></span><h3>{s.title}</h3><p>{s.text}</p></article>)}</div><Link to="/login" className="btn btn-primary">مشاهده همه امکانات <ArrowLeft/></Link></div><MockDashboard/></div></section>

    <section className="section container ai-section" id="features"><div className="ai-visual"><div className="ai-orbit"><BrainCircuit/><span>AI</span><i/><i/><i/></div></div><div className="ai-copy"><div className="overline">هوشمندی در خدمت یادگیری</div><h2>هوش مصنوعی چگونه کمک می‌کند؟</h2><div className="ai-list"><article><span><ChartNo/></span><div><h3>تحلیل وضعیت یادگیری</h3><p>بررسی مداوم عملکرد و عادت‌های مطالعه شما</p></div></article><article><span><Clock3/></span><div><h3>شناسایی نقاط ضعف</h3><p>پیدا کردن موضوعاتی که به تمرین بیشتری نیاز دارند</p></div></article><article><span><Users/></span><div><h3>ساخت برنامه هفتگی</h3><p>یک برنامه عملی با بازبینی مشاور اختصاصی شما</p></div></article></div></div><div className="progress-panel"><div className="progress-head"><h3>گزارش پیشرفت شما</h3><select aria-label="انتخاب هفته"><option>هفته جاری</option></select></div><div className="progress-body"><div className="big-donut"><b>۸۷٪</b><span>درصد پیشرفت</span></div><div className="report-facts"><p><Clock3/><span>ساعت مطالعه</span><b>۳۲ ساعت</b></p><p><BadgeCheck/><span>تعداد آزمون‌ها</span><b>۴ آزمون</b></p><p><Star/><span>میانگین عملکرد</span><b>عالی</b></p></div></div><ChartCard/></div></section>

    <PublicPricing/>

    <section className="section container" id="reviews"><div className="section-title"><h2>دانش‌آموزان ما چه می‌گویند؟</h2><p>تجربه کسانی که مسیرشان را با مسیر هوشمند ساخته‌اند</p></div><div className="testimonials">{testimonials.map((t,i)=><article key={t.name}><div className="quote-head"><span className={`avatar av-${i}`}>{t.name[0]}</span><p><b>{t.name}</b><small>{t.meta}</small></p></div><p>{t.text}</p><div className="stars">★★★★★</div></article>)}</div></section>

    <footer id="contact"><div className="container footer-grid"><div><Brand light/><p>با ترکیب هوش مصنوعی و مشاوره تخصصی، مسیر موفقیت شما را هوشمندانه‌تر می‌کنیم.</p><div className="socials"><span>in</span><span>●</span><span>▶</span></div></div><div><h4>دسترسی سریع</h4><a href="#top">صفحه اصلی</a><a href="#services">خدمات</a><a href="#pricing">قیمت‌ها</a><a href="#contact">تماس با ما</a></div><div><h4>خدمات</h4><a>آزمون‌های هفتگی</a><a>برنامه مطالعاتی</a><a>مشاور اختصاصی</a><a>گزارش پیشرفت</a></div><div><h4>قوانین و مقررات</h4><a>شرایط استفاده</a><a>حریم خصوصی</a><a>سیاست بازگشت وجه</a></div><div><h4>تماس با ما</h4><p>۰۲۱-۸۸۷۷۶۵۷</p><p>info@masirhooshmand.ir</p><p>تهران، میدان ونک</p></div></div><div className="copyright">© ۱۴۰۵ مسیر هوشمند. تمامی حقوق محفوظ است.</div></footer><Link to="/login" className="chat-fab" aria-label="گفت‌وگو با مسیر هوشمند"><MessageCircleMore/></Link>
  </div>
}

function ChartNo(){ return <svg viewBox="0 0 24 24" width="24" height="24"><path d="M4 18V9m6 9V5m6 13v-7m4 7H2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg> }
function PriceCard({title,price,period,features,featured=false}:{title:string,price:string,period:string,features:string[],featured?:boolean}){return <article className={`price-card ${featured?'featured':''}`}>{featured&&<span className="discount">۲۰٪ تخفیف</span>}<h3>{title}</h3><div className="price"><b>{price}</b><span>تومان / {period}</span></div><ul>{features.map(f=><li key={f}><Check/>{f}</li>)}</ul><Link className={`btn ${featured?'btn-primary':'btn-soft'}`} to="/login">انتخاب اشتراک {period}انه</Link></article>}
