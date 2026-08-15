import { Link } from 'react-router-dom'

export default function Brand({ light = false }: { light?: boolean }) {
  return <Link to="/" className={`brand ${light ? 'brand-light' : ''}`} aria-label="مسیر هوشمند، صفحه اصلی">
    <span className="brand-mark"><i /><b /></span>
    <span><strong>مسیر هوشمند</strong><small>سامانه هوشمند یادگیری</small></span>
  </Link>
}
