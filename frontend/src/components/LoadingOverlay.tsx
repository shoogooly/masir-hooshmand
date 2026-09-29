export default function LoadingOverlay({message='در حال بارگذاری…'}:{message?:string}){
  return <div className="loading-overlay" role="status" aria-live="polite" aria-busy="true">
    <div className="loading-overlay-card"><span className="loading-overlay-spinner" aria-hidden="true"/><span>{message}</span></div>
  </div>
}
