import { subscriptionPlanName } from '../utils/subscriptions'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowUpLeft, Bell, BookOpen, BrainCircuit, CalendarDays, ChartNoAxesCombined, Check, ChevronDown, ClipboardCheck, Clock3, CreditCard, GraduationCap, Menu, MessageCircleMore, Mouse, Play, ShieldCheck, Sparkles, Target, Users, X } from 'lucide-react'
import Brand from '../components/Brand'
import { api } from '../api'
import type { SubscriptionPlanOption } from '../types'
import '../styles/home-astra.css'
import '../styles/home-modern.css'

const services = [
  { icon: CalendarDays, label: 'برنامه‌ریزی شخصی', title: 'برنامه‌ای که به زندگی تو می‌خورد', text: 'برنامه هفتگی و ساعتی با توجه به هدف، مدرسه و کلاس‌هایت. فعالیت‌ها، زمان مطالعه و تعداد تست را ثبت کن تا برنامه بعدی دقیق‌تر شود.', color: 'violet' },
  { icon: MessageCircleMore, label: 'مشاوره و گفت‌وگو', title: 'یک مشاور، کنار تمام قدم‌هایت', text: 'مشاور خودت را انتخاب کن، مستقیم پیام بده و درباره برنامه و نتیجه‌ها بازخورد بگیر. پرونده تحصیلی تو مبنای همراهی مشاور است.', color: 'mint' },
  { icon: ClipboardCheck, label: 'آزمون و بانک سؤال', title: 'یادگیری‌ات را واقعی بسنج', text: 'آزمون‌های تعیین‌شده و سؤال‌های PDF را دریافت کن، زمان اجرا را ثبت کن و پاسخنامه بفرست؛ تحلیل مشاور و منابع تکمیلی را همان‌جا ببین.', color: 'peach' },
  { icon: ChartNoAxesCombined, label: 'گزارش و تحلیل', title: 'پیشرفتت را ببین، حدس نزن', text: 'ساعت مطالعه، تعداد تست و نتیجه آزمون‌ها را در گزارش‌ها دنبال کن. مقایسه برنامه و عملکرد نشان می‌دهد چه چیزی نیاز به تغییر دارد.', color: 'blue' },
  { icon: BrainCircuit, label: 'دستیار هوشمند', title: 'برای قدم بعدی، یک پیشنهاد', text: 'بخش پیشنهادهای هوشمند برای کمک به تحلیل عملکرد و برنامه‌ریزی طراحی شده است؛ تصمیم نهایی برنامه با مشاور توست.', color: 'violet' },
  { icon: Bell, label: 'اعلان و یادآوری', title: 'هیچ قدمی از قلم نیفتد', text: 'از برنامه تازه، آزمون، پیام مشاور و وضعیت فعالیت‌ها باخبر شو. اعلان‌های مرتبط با حساب را در پنلت یک‌جا دنبال کن.', color: 'mint' },
  { icon: BookOpen, label: 'منابع و سوابق تحصیلی', title: 'همه چیز، در پرونده خودت', text: 'اطلاعات تحصیلی، برنامه مدرسه، یادداشت‌های مطالعه، فایل آزمون و منابع تکمیلی در مسیر کار تو و مشاور در دسترس هستند.', color: 'peach' },
  { icon: CreditCard, label: 'اشتراک و تمدید', title: 'مدیریت روشنِ مدت همراهی', text: 'طرح‌های فعال و امکاناتشان را مقایسه کن، وضعیت و زمان پایان اشتراکت را ببین و برای ادامه همراهی، تمدید را از حساب خودت انجام بده.', color: 'blue' },
  { icon: ShieldCheck, label: 'پنل مشاور و مدیریت', title: 'یک تیم هماهنگ، پشت مسیر تو', text: 'مشاور، برنامه‌ها و پیگیری دانش‌آموزان را مدیریت می‌کند. مدیر هم تأیید مشاوران، تخصیص‌ها، کاربران، تعرفه‌ها و امور مالی را در پنل اختصاصی انجام می‌دهد.', color: 'violet' },
]
const days = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه']
const demo = [
  [
    ['ریاضی · تابع', 'رسم نمودار و تعیین دامنه'],
    ['زیست · گردش مواد', 'مرور شکل‌های قلب'],
    ['مرور نکته‌های هفته', 'مرور فلش‌کارت‌ها'],
  ],
  [
    ['شیمی · محلول‌ها', 'تمرین محاسبهٔ غلظت'],
    ['ریاضی · تمرین تابع', 'حل تمرین ترکیب توابع'],
    ['تست و تحلیل پاسخ‌ها', 'ثبت علت پاسخ‌های غلط'],
  ],
  [
    ['زیست · تنظیم عصبی', 'مقایسهٔ انواع نورون'],
    ['فیزیک · حرکت‌شناسی', 'تحلیل نمودار سرعت و زمان'],
    ['مرور نکته‌های دیروز', 'حل دوبارهٔ سؤال‌های نشان‌دار'],
  ],
  [
    ['ریاضی · حد و پیوستگی', 'محاسبهٔ حدهای یک‌طرفه'],
    ['شیمی · تست زمان‌دار', 'پاسخ به ۱۵ تست محلول‌ها'],
    ['جمع‌بندی و رفع اشکال', 'یادداشت سؤال‌های حل‌نشده'],
  ],
  [
    ['فیزیک · کار و انرژی', 'تمرین قضیهٔ کار و انرژی'],
    ['زیست · تمرین ترکیبی', 'مقایسهٔ دستگاه‌های گردش خون'],
    ['مرور خلاصه‌نویسی‌ها', 'تکمیل برگهٔ فرمول‌ها'],
  ],
  [
    ['آزمون هفتگی', 'پاسخ به سؤال‌ها در زمان تعیین‌شده'],
    ['تحلیل پاسخ‌های آزمون', 'دسته‌بندی اشتباه‌های آزمون'],
    ['گفت‌وگو با مشاور', 'ارسال سؤال‌های باقی‌مانده'],
  ],
  [
    ['مرور سبک هفته', 'مرور خلاصه‌های فصل'],
    ['بررسی گزارش پیشرفت', 'مقایسهٔ زمان مطالعه با برنامه'],
    ['آماده‌سازی هفته بعد', 'مشخص‌کردن اولویت‌های مطالعه'],
  ],
]
const audiences = [
  { title: 'دانش‌آموز', icon: GraduationCap, heading: 'بدان امروز از کجا شروع کنی.', text: 'به جای جابه‌جایی بین دفتر برنامه، پیام‌رسان و فایل‌ها، مسیر مطالعه‌ات را یک‌جا دنبال کن.', items: ['برنامه روزانه و هفتگی متناسب با شرایط تو', 'ثبت مطالعه، تست و یادداشت‌های هر فعالیت', 'آزمون، پاسخنامه و بازخورد مشاور', 'گزارش پیشرفت، پیام‌ها و مدیریت اشتراک'], action: 'ساخت حساب دانش‌آموزی' },
  { title: 'مشاور', icon: Users, heading: 'برای هر دانش‌آموز، همراهی دقیق‌تر.', text: 'اطلاعات تحصیلی و عملکرد واقعی دانش‌آموز را کنار هم ببین و برنامه هفته بعد را با دید روشن‌تری بساز.', items: ['پرونده دانش‌آموز و برنامه مدرسه و کلاس‌ها', 'برنامه‌ساز ساعتی و دریافت خروجی PDF', 'تعیین آزمون، بررسی پاسخنامه و ارسال منابع', 'فهرست پیگیری، گزارش‌ها و گفت‌وگوی مستقیم'], action: 'ثبت‌نام مشاور' },
]
const journey = [
  ['خودت و هدفت را معرفی کن', 'با شماره موبایل ثبت‌نام کن و اطلاعات تحصیلی‌ات را کامل کن.'],
  ['مشاور همراهت را انتخاب کن', 'مشاورت را انتخاب کن یا تخصیص را به مدیریت بسپار.'],
  ['برنامه‌ات را بگیر و شروع کن', 'برنامه متناسب با شرایطت را اجرا کن و فعالیت‌هایت را ثبت کن.'],
  ['نتیجه را بسنج؛ مسیر را بهتر کن', 'آزمون بده، بازخورد بگیر و برای هفته بعد دقیق‌تر ادامه بده.'],
]
const fa = new Intl.NumberFormat('fa-IR')

export default function HomePreviewPage() {
  const [menu, setMenu] = useState(false)
  const [day, setDay] = useState(2)
  const [audience, setAudience] = useState(0)
  const [loadPlans, setLoadPlans] = useState(false)


  const scene = useRef<HTMLDivElement>(null)
  const pricing = useRef<HTMLElement>(null)
  const plans = useQuery({
    queryKey: ['public-subscription-plans'],
    queryFn: () => api<SubscriptionPlanOption[]>('/subscriptions/plans', { cache: 'no-store' }),
    enabled: loadPlans,
    staleTime: 0,
    refetchOnWindowFocus: 'always',
    refetchOnMount: 'always',
    refetchInterval: loadPlans ? 30_000 : false,
  })
  const periodOrder: Record<string, number> = { monthly: 0, quarterly: 1, three_months: 1, yearly: 2 }
  const visiblePlans = (plans.data || [])
    .sort((a, b) => (periodOrder[a.period] ?? 3) - (periodOrder[b.period] ?? 3))
  const person = audiences[audience]

  useEffect(() => {
    const oldTitle = document.title
    document.title = 'مهیاد | برنامه درسی، مشاور و پیشرفت'
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.target === scene.current) {
          entry.target.classList.toggle('is-offscreen', !entry.isIntersecting)
        } else {
          setLoadPlans(entry.isIntersecting)
        }
      }
    }, { rootMargin: '80px' })
    if (scene.current) observer.observe(scene.current)
    if (pricing.current) observer.observe(pricing.current)
    return () => { observer.disconnect(); document.title = oldTitle }
  }, [])

  useEffect(() => {
    if (!menu) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu(false) }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [menu])

  return <div className="mh" dir="rtl" id="preview-top">
    <a className="mh-skip" href="#main-content">رفتن به محتوای اصلی</a>
    <header className="mh-header mh-wrap">
      <Brand light />
      <nav id="mh-navigation" className={menu ? 'is-open' : ''} aria-label="منوی اصلی">
        <Link to="/advisors" onClick={() => setMenu(false)}>معرفی مشاورین</Link><Link to="/articles" onClick={() => setMenu(false)}>مقالات</Link>{[['#preview-services', 'خدمات ما'], ['#preview-path', 'چطور شروع کنم؟'], ['#preview-pricing', 'تعرفه‌ها']].map(([href, text]) => <a key={href} href={href} onClick={() => setMenu(false)}>{text}</a>)}
      </nav>
      <div className="mh-header-actions"><Link to="/login">ورود</Link><Link className="mh-btn mh-btn-small" to="/register">شروع مسیر <ArrowUpLeft size={17} /></Link></div>
      <button className="mh-menu" aria-label={menu ? 'بستن منو' : 'باز کردن منو'} aria-expanded={menu} aria-controls="mh-navigation" onClick={() => setMenu(!menu)}>{menu ? <X /> : <Menu />}</button>
    </header>

    <main id="main-content">
      <section className="mh-hero mh-wrap">
        <div className="mh-hero-copy">
          <div className="mh-eyebrow"> مسیر تو، به سبک خودت <Sparkles size={15} /></div>
          <h1>هدف بزرگ تو،<br />با <span>قدم‌های روشن.</span></h1>
          <p>برنامهٔ درسی مخصوص تو، مشاوری که کنارت می‌ماند و گزارشی که پیشرفتت را نشان می‌دهد.<br /><strong>همه در یک جا: مهیاد.</strong></p>
          <div className="mh-actions"><Link to="/register" className="mh-btn">مسیر من رو بساز <ArrowLeft size={20} /></Link><a href="#preview-services" className="mh-demo-link"><span><Play size={15} fill="currentColor" /></span> کشف امکانات</a></div>
          <div className="mh-hero-checks"><span><Check /> برنامه شخصی</span><span><Check /> همراهی مشاور</span><span><Check /> پیگیری پیشرفت</span></div>
        </div>
        <div className="mh-scene" ref={scene}>
          <div className="mh-scene-grid" aria-hidden="true" />
          <div className="mh-orb" aria-hidden="true"><div /><i /><b /></div>
          <div className="mh-orbit mh-orbit-one" aria-hidden="true" /><div className="mh-orbit mh-orbit-two" aria-hidden="true" />
          <div className="mh-stage">
            <div className="mh-panel-layer mh-layer-back" aria-hidden="true" /><div className="mh-panel-layer mh-layer-mid" aria-hidden="true" />
            <div className="mh-planner">
              <div className="mh-planner-head"><span className="mh-tile"><CalendarDays size={22} /></span><div><b>این هفته، یک قدم جلوتر</b><small>برنامهٔ مطالعاتی من</small></div><span className="mh-sample">نمونه</span></div>
              <div className="mh-days" aria-label="انتخاب روز در برنامه نمونه">{days.map((name, index) => <button key={name} onClick={() => setDay(index)} aria-pressed={day === index} className={day === index ? 'selected' : ''}><span>{name}</span><b>{fa.format(index + 14)}</b><i /></button>)}</div>
              <div className="mh-plan-label"><span>{days[day]}؛ قدم‌های امروز</span><span><Clock3 size={13} /> ۳ فعالیت</span></div>
              <div className="mh-tasks" key={day}>
                {demo[day].map(([task, description], index) => (
                  <div className={`mh-task mh-task-${index}`} key={task}>
                    <span className="mh-task-icon">{index === 0 ? <BookOpen size={19} /> : index === 1 ? <Target size={19} /> : <ClipboardCheck size={19} />}</span>
                    <div><b>{task}</b><small>{description}</small></div>
                    <time>{['۰۸:۰۰', '۱۰:۱۵', '۱۳:۰۰'][index]}</time>
                    {index === 0 ? <span className="mh-task-done"><Check size={13} /></span> : <span className="mh-task-circle" />}
                  </div>
                ))}
              </div>
              <div className="mh-plan-bottom">
                <span><i /> قدم اول انجام شد</span>
                <span className="mh-plan-hint"><Mouse size={14} aria-hidden="true" /> روزهای برنامه را انتخاب کن و یک نمونه ببین</span>
              </div>
              <div className="mh-progress"><i /></div>
            </div>
            <div className="mh-floating mh-advisor"><span className="mh-advisor-avatar"><GraduationCap /><i /></span><div><small>تنها پیش نمی‌ری</small><b>مشاورت کنارته.</b></div><MessageCircleMore size={19} /></div>
            <div className="mh-floating mh-growth"><div><span className="mh-growth-icon"><ChartNoAxesCombined size={19} /></span><span>گزارش پیشرفت</span></div><b>هر روز، بهتر از دیروز</b><div className="mh-bars" aria-hidden="true">{[26, 42, 36, 60, 51, 76, 94].map((height, index) => <i key={index} style={{ '--bar': height + '%', '--i': index } as CSSProperties} />)}</div><small>نمایش نمونهٔ روند مطالعه</small></div>
            <span className="mh-spark mh-spark-one" aria-hidden="true">✦</span><span className="mh-spark mh-spark-two" aria-hidden="true">✧</span>
          </div>
        </div>
      </section>
      <div className="mh-strip"><div className="mh-wrap"><span>از برنامه تا نتیجه، همراهت هستیم</span><b><CalendarDays /> برنامه‌ریزی</b><i /><b><Users /> مشاوره</b><i /><b><ClipboardCheck /> آزمون</b><i /><b><ChartNoAxesCombined /> تحلیل پیشرفت</b></div></div>

      <section className="mh-section mh-wrap" id="preview-services">
        <div className="mh-section-head mh-reveal"><div><span className="mh-overline">هر چیزی که برای مسیرت نیاز داری</span><h2>روی درس خواندن تمرکز کن.<br /><span>ابزارهایش اینجاست.</span></h2></div><p>از اولین برنامه تا بررسی نتیجه؛<br />تمام خدمات در یک فضای یکپارچه.</p></div>
        <div className="mh-services">
          {services.map(service => (
            <details className="mh-service" key={service.label}>
              <summary>
                <span className="mh-service-icon"><service.icon size={21} /></span>
                <span><small>{service.label}</small><strong>{service.title}</strong></span>
                <ChevronDown size={18} />
              </summary>
              <p>{service.text}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mh-section mh-path-section" id="preview-path"><div className="mh-wrap"><div className="mh-center mh-reveal"><span className="mh-overline">شروعش ساده‌تر از چیزیه که فکر می‌کنی</span><h2>چهار قدم، تا مسیر خودت.</h2><p>لازم نیست از همین اول همه جواب‌ها را بدانی.</p></div><div className="mh-journey">{journey.map(([title, text], index) => <article className="mh-reveal" key={title}><div className="mh-step-marker"><span>{fa.format(index + 1).padStart(2, '۰')}</span>{index < 3 && <ArrowLeft size={18} />}</div><h3>{title}</h3><p>{text}</p></article>)}</div><div className="mh-centered-action"><Link className="mh-btn" to="/register">قدم اول رو بردار <ArrowLeft size={18} /></Link></div></div></section>

      <section className="mh-section mh-wrap" id="preview-audiences"><div className="mh-audience mh-reveal"><div className="mh-audience-copy"><span className="mh-overline">دو نقش، یک هدف</span><h2>هرکس ابزار خودش را دارد.</h2><div className="mh-role-switch" role="group" aria-label="نمایش امکانات هر نقش">{audiences.map((item, index) => <button key={item.title} aria-pressed={audience === index} onClick={() => setAudience(index)}><item.icon size={17} />{item.title}</button>)}</div><div key={audience} className="mh-role-content" aria-live="polite"><h3>{person.heading}</h3><p>{person.text}</p><ul>{person.items.map(item => <li key={item}><Check size={16} />{item}</li>)}</ul><Link className="mh-inline-link" to="/register">{person.action}<ArrowLeft size={18} /></Link></div></div><div className="mh-role-art"><span className="mh-role-core"><person.icon strokeWidth={1.1} /></span><span className="mh-role-chip top"><CalendarDays /> برنامه روشن</span><span className="mh-role-chip bottom"><ChartNoAxesCombined /> پیشرفت قابل پیگیری</span><p>کنار هم، یک قدم جلوتر.</p></div></div></section>

      <section className="mh-section mh-wrap" id="preview-pricing" ref={pricing}><div className="mh-center mh-reveal"><span className="mh-overline">همراهی، به انتخاب تو</span><h2>طرح مناسب مسیرت را پیدا کن.</h2><p>مدت همراهی، قیمت و امکانات هر اشتراک را بررسی کن.</p></div><div className="mh-prices">
        {plans.isPending ? <div className="mh-price-state" role="status"><span className="mh-loading-dot" /> در حال دریافت تعرفه‌های به‌روز…</div> : plans.isError ? <div className="mh-price-state" role="status"><CreditCard /><h3>تعرفه‌ها فعلاً در دسترس نیستند.</h3><p>برای دریافت قیمت‌های به‌روز دوباره تلاش کن.</p><button className="mh-btn mh-btn-outline" onClick={() => void plans.refetch()} disabled={plans.isFetching}>{plans.isFetching ? 'در حال دریافت…' : 'دریافت دوباره تعرفه‌ها'}</button></div> : visiblePlans.length ? visiblePlans.map((plan) => <article className={'mh-price ' + (plan.period === 'yearly' && plan.active !== false ? 'mh-price-featured ' : '') + (plan.active === false ? 'mh-price-unavailable' : '')} key={plan.id}>{plan.period === 'yearly' && plan.active !== false && <span className="mh-price-popular">انتخاب محبوب</span>}<h3>{subscriptionPlanName(plan)}</h3><div className="mh-price-amount"><strong>{plan.price > 0 ? fa.format(plan.price) : 'تعرفه اعلام نشده'}</strong>{plan.price > 0 && <span>تومان</span>}</div><ul>{plan.features.map(feature => <li key={feature}><Check size={17} />{feature}</li>)}</ul>{plan.active === false ? <span className="mh-price-disabled">این طرح فعلاً در دسترس نیست</span> : <Link className={'mh-btn ' + (plan.period === 'yearly' ? '' : 'mh-btn-outline')} to="/register">انتخاب این طرح <ArrowLeft size={17} /></Link>}</article>) : <div className="mh-price-state"><h3>هنوز طرحی تعریف نشده است.</h3><p>پس از فعال‌شدن اشتراک‌ها، مشخصات و تعرفه‌ها اینجا نمایش داده می‌شود.</p></div>}
      </div></section>

      <section className="mh-section mh-wrap mh-faq"><div><span className="mh-overline">قبل از شروع</span><h2>چند جواب کوتاه.</h2><p>برای انتخاب مسیر، تصویر روشنی داشته باش.</p></div><div>{[
        ['برنامه من چطور ساخته می‌شود؟', 'اطلاعات تحصیلی، هدف، برنامه مدرسه و زمان‌های در دسترس تو در اختیار مشاور قرار می‌گیرد. مشاور برنامه هفتگی را می‌سازد و با توجه به فعالیت‌هایی که ثبت می‌کنی و نتیجه آزمون‌ها آن را بازبینی می‌کند.'],
        ['ارتباط با مشاور چطور است؟', 'پس از انتخاب و تخصیص مشاور، گفت‌وگوی مستقیم در پنل در دسترس است. می‌توانی درباره برنامه و نتیجه‌ها پیام بدهی و پاسخ و فایل‌های مرتبط را در همان مسیر دنبال کنی.'],
        ['با موبایل هم می‌توانم استفاده کنم؟', 'بله. برنامه، ثبت فعالیت، پیام‌ها و بخش‌های اصلی سایت از مرورگر موبایل در دسترس هستند و نیازی به نصب برنامه جداگانه نیست.'],
        ['هوش مصنوعی جای مشاور را می‌گیرد؟', 'خیر. پیشنهادهای هوشمند ابزار کمکی هستند و برنامه با نظر مشاور پیش می‌رود.'],
      ].map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={19} /></summary><p>{answer}</p></details>)}</div></section>

      <section className="mh-final mh-wrap mh-reveal"><span className="mh-overline"><Sparkles size={17} /> آینده، از قدم امروز شروع می‌شود</span><h2>این بار، با یک مسیر روشن شروع کن.</h2><p>هدفت را بگو؛ قدم‌های بعدی را با هم مشخص می‌کنیم.</p><Link className="mh-btn" to="/register">بزن بریم، مسیر من! <ArrowLeft size={20} /></Link></section>
    </main>
    <footer className="mh-footer mh-wrap"><div className="mh-footer-main"><div><Brand light /><p>برنامه‌ریزی درسی، مشاوره و پیگیری پیشرفت.<br />هر هفته، یک قدم روشن‌تر.</p></div><div><h3>کشف مسیر</h3><a href="#preview-services">تمام خدمات</a><a href="#preview-path">مراحل شروع</a><a href="#preview-pricing">تعرفه اشتراک‌ها</a></div><div><h3>همراه ما باش</h3><Link to="/register">ثبت‌نام دانش‌آموز و مشاور</Link><Link to="/login">ورود به حساب کاربری</Link><a href="#preview-audiences">آشنایی با پنل‌ها</a></div><div className="mh-trust-seal"><h3>اعتماد و مجوزها</h3><a referrerPolicy="origin" target="_blank" rel="noopener noreferrer" href="https://trustseal.enamad.ir/?id=7969734&Code=P0QgzwjmlWwPbqTzimJMIpxA0s8IcoMF" aria-label="مشاهده اعتبار نماد اعتماد الکترونیکی مهیاد"><img referrerPolicy="origin" src="https://trustseal.enamad.ir/logo.aspx?id=7969734&Code=P0QgzwjmlWwPbqTzimJMIpxA0s8IcoMF" alt="نماد اعتماد الکترونیکی مهیاد" loading="lazy" /></a></div></div><div className="mh-footer-bottom"><span>مهیاد · همراه مسیر یادگیری تو</span><a href="#preview-top">برگشت به بالا <ArrowUpLeft size={16} /></a></div></footer>
  </div>
}
