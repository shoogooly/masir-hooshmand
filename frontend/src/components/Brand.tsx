import { Link } from 'react-router-dom'

export default function Brand({ light = false }: { light?: boolean }) {
  return <Link to="/" className={`brand ${light ? 'brand-light' : ''}`} aria-label="مهیاد، صفحه اصلی">
    <img className="brand-logo" src="/brand/mahyaad-logo.png" alt="" />
    <span><strong>مهیاد <em>mahyaad</em></strong><small>مسیر هوشمند یادگیری</small></span>
  </Link>
}
