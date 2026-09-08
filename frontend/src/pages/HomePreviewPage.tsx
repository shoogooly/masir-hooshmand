import {useState} from 'react'
import {Link} from 'react-router-dom'
import {useQuery} from '@tanstack/react-query'
import {ArrowLeft,ArrowUpLeft,BadgeCheck,Bell,BookOpen,BrainCircuit,CalendarDays,Check,ChevronDown,ClipboardCheck,Clock3,FileText,GraduationCap,LineChart,Menu,MessageCircleMore,Play,ShieldCheck,Sparkles,Target,UserRoundCheck,Users,X} from 'lucide-react'
import Brand from '../components/Brand'
import {api} from '../api'
import type {RegistrationOptions} from '../types'

const capabilities=[
  {icon:CalendarDays,title:'برنامه هفتگی اختصاصی',text:'برنامه‌ای دقیق با بازه‌های زمانی شناور، هماهنگ با مدرسه، کلاس و هدف هر دانش‌آموز.',tone:'violet'},
  {icon:MessageCircleMore,title:'گفت‌وگوی مستقیم با مشاور',text:'ارتباط دوطرفه، اعلان پیام تازه و همراهی مشاور در تمام مسیر مطالعه.',tone:'mint'},
  {icon:FileText,title:'آزمون و تحلیل فایل',text:'دریافت سؤال PDF، ثبت زمان اجرا، تحویل پاسخنامه و دریافت تحلیل و منابع تکمیلی.',tone:'orange'},
  {icon:LineChart,title:'گزارش پیشرفت روشن',text:'مقایسه برنامه با عملکرد واقعی، زمان مطالعه، تعداد تست و نتیجه آزمون‌ها.',tone:'blue'},
  {icon:Bell,title:'یادآوری‌های به‌موقع',text:'اعلان برنامه، آزمون، پیام و پایان برنامه؛ بدون اینکه چیزی از قلم بیفتد.',tone:'rose'},
  {icon:ShieldCheck,title:'محیط امن و مدیریت‌شده',text:'تأیید مشاوران، کنترل دسترسی و مدیریت شفاف اشتراک و اطلاعات حساب.',tone:'navy'},
]
const journey=[
  {n:'۰۱',title:'ثبت‌نام ساده',text:'شماره موبایل، نقش و اطلاعات تحصیلی را مرحله‌به‌مرحله کامل کن.'},
  {n:'۰۲',title:'انتخاب مشاور',text:'مشاور مناسب را انتخاب کن یا انتخاب را به مدیریت بسپار.'},
  {n:'۰۳',title:'دریافت نقشه راه',text:'مشاور با توجه به مدرسه و شرایط تو، برنامه هفتگی را می‌سازد.'},
  {n:'۰۴',title:'اجرا، آزمون، پیشرفت',text:'فعالیت‌ها را ثبت کن، آزمون بده و هر هفته بهتر از قبل ادامه بده.'},
]
const fa=new Intl.NumberFormat('fa-IR')
const period:Record<string,string>={monthly:'یک‌ماهه',quarterly:'سه‌ماهه',three_months:'سه‌ماهه',yearly:'سالانه'}

export default function HomePreviewPage(){
  const [menu,setMenu]=useState(false)
  const plans=useQuery({queryKey:['public-pricing'],queryFn:()=>api<RegistrationOptions>('/registrations/options')})
  const activePlans=plans.data?.plans.filter(item=>item.active!==false)||[]
  return <div className="hp" id="preview-top">
    <div className="hp-noise"/>
    <header className="hp-header hp-container">
      <a href="#preview-top" aria-label="صفحه اصلی"><Brand/></a>
      <nav className={menu?'open':''} aria-label="منوی نمونه صفحه اصلی">
        <a href="#preview-services" onClick={()=>setMenu(false)}>امکانات</a>
        <a href="#preview-path" onClick={()=>setMenu(false)}>مسیر همراهی</a>
        <a href="#preview-audiences" onClick={()=>setMenu(false)}>برای چه کسانی؟</a>
        <a href="#preview-pricing" onClick={()=>setMenu(false)}>تعرفه‌ها</a>
      </nav>
      <div className="hp-head-actions"><Link to="/login">ورود</Link><Link className="hp-button compact" to="/register">شروع مسیر <ArrowLeft/></Link></div>
      <button className="hp-menu" onClick={()=>setMenu(value=>!value)} aria-label={menu?'بستن منو':'بازکردن منو'}>{menu?<X/>:<Menu/>}</button>
    </header>

    <main>
      <section className="hp-hero hp-container">
        <div className="hp-hero-copy">
          <span className="hp-kicker"><Sparkles/> برنامه‌ریزی انسانی، ابزارهای هوشمند</span>
          <h1>درس خواندن وقتی ساده می‌شود که <em>مسیرت روشن باشد.</em></h1>
          <p>مسیر هوشمند، برنامه مدرسه، هدف و عملکردت را کنار هم می‌گذارد؛ مشاور اختصاصی هر هفته برایت یک برنامه قابل‌اجرا می‌سازد و تا رسیدن به نتیجه همراهت می‌ماند.</p>
          <div className="hp-hero-actions"><Link className="hp-button" to="/register">همین حالا شروع کن <ArrowLeft/></Link><a className="hp-text-button" href="#preview-services"><Play/> ببین چطور کمک می‌کنیم</a></div>
          <div className="hp-reassurance"><span><Check/> برنامه شخصی</span><span><Check/> مشاور تأییدشده</span><span><Check/> گزارش قابل فهم</span></div>
        </div>
        <div className="hp-hero-visual" aria-label="نمایی از برنامه هفتگی مسیر هوشمند">
          <div className="hp-orbit orbit-one"/><div className="hp-orbit orbit-two"/>
          <div className="hp-week-card">
            <header><div><small>برنامه این هفته</small><b>یک قدم جلوتر از دیروز</b></div><span>۸۴٪</span></header>
            <div className="hp-week-days"><i className="done">ش</i><i className="done">ی</i><i className="today">د</i><i>س</i><i>چ</i><i>پ</i><i>ج</i></div>
            <div className="hp-schedule-row"><time>۰۸:۰۰</time><span className="math"><b>ریاضی</b><small>تابع و تست زمان‌دار</small></span></div>
            <div className="hp-schedule-row"><time>۱۰:۱۵</time><span className="biology"><b>زیست‌شناسی</b><small>فصل گردش مواد</small></span></div>
            <div className="hp-schedule-row"><time>۱۳:۰۰</time><span className="review"><b>مرور و جمع‌بندی</b><small>فلش‌کارت‌های امروز</small></span></div>
            <footer><span><i/> ۳ فعالیت باقی مانده</span><b>مشاهده برنامه <ArrowUpLeft/></b></footer>
          </div>
          <div className="hp-float hp-float-advisor"><span>م</span><div><b>مشاور همراه شماست</b><small><i/> پاسخ‌گویی مستقیم</small></div></div>
          <div className="hp-float hp-float-report"><LineChart/><div><small>روند این هفته</small><b>۱۲٪ رشد</b></div></div>
          <div className="hp-float hp-float-focus"><Target/><span>امروز فقط<br/><b>روی قدم بعدی</b></span></div>
        </div>
      </section>

      <section className="hp-promise"><div className="hp-container"><p>همه چیزی که برای یک هفته موفق نیاز داری</p><span/><b>برنامه‌ریزی</b><i/> <b>پیگیری</b><i/> <b>آزمون</b><i/> <b>تحلیل</b><i/> <b>گفت‌وگو</b></div></section>

      <section className="hp-section hp-container" id="preview-services">
        <div className="hp-section-head"><span>یک پنل، یک مسیر روشن</span><h2>ابزارهای کامل؛<br/>بدون پیچیدگی اضافه</h2><p>هر قابلیت دقیقاً جایی قرار گرفته که به آن نیاز داری؛ ساده، فارسی و قابل استفاده روی موبایل و کامپیوتر.</p></div>
        <div className="hp-capabilities">{capabilities.map((item,index)=><article className={`hp-cap hp-${item.tone}`} style={{'--delay':`${index*70}ms`} as React.CSSProperties} key={item.title}><span><item.icon/></span><div><h3>{item.title}</h3><p>{item.text}</p></div><ArrowUpLeft/></article>)}</div>
      </section>

      <section className="hp-journey" id="preview-path"><div className="hp-container">
        <div className="hp-journey-intro"><span className="hp-kicker"><GraduationCap/> از ثبت‌نام تا نتیجه</span><h2>قرار نیست مسیر موفقیت را تنها بروی.</h2><p>چهار مرحله ساده؛ با همراهی انسانی و بازخورد واقعی در هر هفته.</p><Link className="hp-button light" to="/register">ساخت حساب دانش‌آموزی <ArrowLeft/></Link></div>
        <div className="hp-journey-list">{journey.map((item,index)=><article key={item.n}><span>{item.n}</span><div><h3>{item.title}</h3><p>{item.text}</p></div>{index<journey.length-1&&<i/>}</article>)}</div>
      </div></section>

      <section className="hp-section hp-container" id="preview-audiences">
        <div className="hp-center-head"><span>هرکس، پنل مخصوص خودش</span><h2>همراهی منظم بین دانش‌آموز، مشاور و خانواده آموزشی</h2></div>
        <div className="hp-audiences">
          <article className="student"><div className="hp-audience-icon"><BookOpen/></div><span>برای دانش‌آموز</span><h3>هر روز بدان چه کاری باید انجام دهی.</h3><ul><li><Check/> برنامه هفتگی و مأموریت هفته</li><li><Check/> ثبت مطالعه، تست و یادداشت</li><li><Check/> آزمون PDF و تحلیل مشاور</li><li><Check/> گزارش پیشرفت و وضعیت اشتراک</li></ul><Link to="/register">ثبت‌نام دانش‌آموز <ArrowLeft/></Link></article>
          <article className="advisor"><div className="hp-audience-icon"><UserRoundCheck/></div><span>برای مشاور</span><h3>برای هر دانش‌آموز، یک تصمیم دقیق‌تر.</h3><ul><li><Check/> پرونده کامل و برنامه مدرسه</li><li><Check/> برنامه‌ساز ساعتی و خروجی PDF</li><li><Check/> آزمون، پاسخنامه و منابع تکمیلی</li><li><Check/> فهرست پیگیری و گفت‌وگوی مستقیم</li></ul><Link to="/register">ثبت‌نام مشاور <ArrowLeft/></Link></article>
        </div>
      </section>

      <section className="hp-section hp-pricing" id="preview-pricing"><div className="hp-container">
        <div className="hp-center-head"><span>شفاف و قابل انتخاب</span><h2>زمان همراهی مناسب خودت را انتخاب کن.</h2><p>امکانات اصلی در همه طرح‌ها فعال است؛ فقط مدت همراهی متفاوت خواهد بود.</p></div>
        <div className="hp-price-grid">{activePlans.length?activePlans.map(plan=>{const popular=plan.period==='yearly';return <article className={popular?'featured':''} key={plan.id}>{popular&&<em>انتخاب محبوب</em>}<span>{period[plan.period]||plan.name}</span><h3>{fa.format(plan.price)} <small>تومان</small></h3><ul>{plan.features.slice(0,5).map(feature=><li key={feature}><Check/>{feature}</li>)}</ul><Link className={popular?'hp-button':'hp-price-button'} to="/register">انتخاب طرح <ArrowLeft/></Link></article>}):<div className="hp-price-loading">در حال دریافت تعرفه‌های به‌روز...</div>}</div>
      </div></section>

      <section className="hp-final hp-container"><div><span><Sparkles/></span><h2>برای یک شروع خوب، لازم نیست همه جواب‌ها را بدانی.</h2><p>کافی است هدفت را بگویی؛ قدم بعدی را با هم مشخص می‌کنیم.</p></div><Link className="hp-button light" to="/register">شروع مسیر من <ArrowLeft/></Link></section>
    </main>

    <footer className="hp-footer"><div className="hp-container"><div><Brand light/><p>برنامه‌ریزی درسی، مشاوره و پیگیری پیشرفت در یک فضای ساده و یکپارچه.</p></div><div><b>مسیر هوشمند</b><a href="#preview-services">امکانات</a><a href="#preview-path">نحوه همراهی</a><a href="#preview-pricing">تعرفه‌ها</a></div><div><b>دسترسی سریع</b><Link to="/login">ورود به پنل</Link><Link to="/register">ثبت‌نام دانش‌آموز</Link><Link to="/register">ثبت‌نام مشاور</Link></div><div><b>اعتماد و پشتیبانی</b><span><ShieldCheck/> اطلاعات شما امن می‌ماند</span><span><Users/> مشاوران پس از تأیید فعال می‌شوند</span></div></div><p>مسیر هوشمند؛ هر هفته یک قدم روشن‌تر.</p></footer>
  </div>
}
