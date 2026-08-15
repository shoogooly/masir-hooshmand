export default function ChartCard() {
  return <div className="chart-card">
    <div className="chart-head"><span>نمودار پیشرفت کلی</span><b>۸۷٫۵٪</b></div>
    <svg viewBox="0 0 620 170" role="img" aria-label="نمودار پیشرفت صعودی">
      <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7951ee" stopOpacity=".22"/><stop offset="1" stopColor="#7951ee" stopOpacity="0"/></linearGradient></defs>
      <path className="grid" d="M0 35H620M0 75H620M0 115H620M0 155H620" />
      <path className="area" d="M0 145 C60 120 90 135 145 103 S225 116 280 72 S365 88 420 45 S520 65 620 22 L620 170 L0 170Z" />
      <path className="line" d="M0 145 C60 120 90 135 145 103 S225 116 280 72 S365 88 420 45 S520 65 620 22" />
    </svg>
  </div>
}

