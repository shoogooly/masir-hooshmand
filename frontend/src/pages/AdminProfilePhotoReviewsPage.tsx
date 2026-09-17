import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Clock3, UserRound, X } from 'lucide-react'
import { api } from '../api'
import type { ProfilePhoto } from '../types'
import { photoUrl } from '../utils/profilePhoto'
import '../styles/profile-photo-review.css'

type PhotoRequest = {
  id: string
  full_name: string
  phone: string
  role: string
  profile_photo?: ProfilePhoto | null
  pending_profile_photo?: ProfilePhoto | null
}

export default function AdminProfilePhotoReviewsPage() {
  const qc = useQueryClient()
  const { data = [], isLoading, error } = useQuery({
    queryKey: ['profile-photo-requests'],
    queryFn: () => api<PhotoRequest[]>('/admin/profile-photo-requests'),
  })
  const review = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'approved' | 'rejected' }) =>
      api(`/admin/users/${id}/profile-photo-review`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile-photo-requests'] })
      qc.invalidateQueries({ queryKey: ['admin-users'] })
    },
  })

  return (
    <div className="content-page">
      <div className="page-head">
        <div>
          <h1>تأیید عکس‌های پرسنلی</h1>
          <p>عکس فعلی و عکس پیشنهادی را مقایسه کنید؛ عکس جدید فقط پس از تأیید شما در سایت نمایش داده می‌شود.</p>
        </div>
      </div>
      {isLoading && <div className="panel photo-review-empty">در حال دریافت درخواست‌ها…</div>}
      {error && <div className="error-box">دریافت درخواست‌های عکس ناموفق بود.</div>}
      {!isLoading && !data.length && (
        <div className="panel photo-review-empty"><Check /> هیچ عکس در انتظار بررسی نیست.</div>
      )}
      <div className="photo-review-grid">
        {data.map(item => (
          <article className="panel photo-review-card" key={item.id}>
            <header>
              <div className="photo-review-user"><span><Clock3 /></span><div><h2>{item.full_name}</h2><p>{item.role === 'advisor' ? 'مشاور' : 'دانش‌آموز'} · <bdi>{item.phone}</bdi></p></div></div>
            </header>
            <div className="photo-compare">
              <figure>
                <div>{item.profile_photo ? <img src={photoUrl(item.profile_photo)} alt="عکس فعلی" /> : <UserRound />}</div>
                <figcaption>عکس فعلی</figcaption>
              </figure>
              <figure className="proposed">
                <div>{item.pending_profile_photo ? <img src={photoUrl(item.pending_profile_photo)} alt="عکس پیشنهادی" /> : <UserRound />}</div>
                <figcaption>عکس پیشنهادی</figcaption>
              </figure>
            </div>
            <div className="photo-review-actions">
              <button className="btn btn-primary" disabled={review.isPending} onClick={() => review.mutate({ id: item.id, status: 'approved' })}><Check /> تأیید و انتشار</button>
              <button className="btn btn-danger" disabled={review.isPending} onClick={() => review.mutate({ id: item.id, status: 'rejected' })}><X /> رد عکس</button>
            </div>
          </article>
        ))}
      </div>
      {review.error && <div className="error-box">ثبت نتیجه بررسی ناموفق بود.</div>}
    </div>
  )
}
