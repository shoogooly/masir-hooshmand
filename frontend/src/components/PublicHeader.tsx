import { Menu } from 'lucide-react'
import { Link } from 'react-router-dom'
import Brand from './Brand'

export default function PublicHeader() {
  return <header className="public-header container">
    <Brand />
    <nav aria-label="منوی اصلی">
      <a className="active" href="#top">صفحه اصلی</a><a href="#services">خدمات</a><a href="#features">ویژگی‌ها</a><a href="#how">نحوه کار</a><a href="#pricing">قیمت‌ها</a><a href="#reviews">تجربه‌ها</a><a href="#contact">تماس با ما</a>
    </nav>
    <div className="header-actions"><Link className="btn btn-ghost" to="/login">ورود</Link><Link className="btn btn-primary" to="/login">ثبت نام</Link></div>
    <button className="mobile-menu" aria-label="نمایش منو"><Menu /></button>
  </header>
}

