import { CheckCircle2,CircleX } from 'lucide-react'
import { Link,useSearchParams } from 'react-router-dom'
import Brand from '../components/Brand'
export default function PaymentResultPage(){
 const [params]=useSearchParams(),success=params.get('status')==='success',ref=params.get('ref_id')
 return <main className="payment-result"><Brand/><section><span className={success?'success':'failed'}>{success?<CheckCircle2/>:<CircleX/>}</span><h1>{success?'پرداخت با موفقیت انجام شد':'پرداخت انجام نشد'}</h1><p>{success?'پرداخت شما در مهیاد ثبت شد و وضعیت اشتراک به‌روز شده است.':'پرداخت لغو شد یا تأیید زرین‌پال ناموفق بود؛ می‌توانید دوباره تلاش کنید.'}</p>{ref&&<small>شماره پیگیری: {ref}</small>}<Link className="btn btn-primary" to="/app">بازگشت به پنل</Link></section></main>
}
