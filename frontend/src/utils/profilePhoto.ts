import type { ProfilePhoto } from '../types'

export const photoUrl=(photo?:ProfilePhoto|null)=>photo?`data:${photo.content_type};base64,${photo.content_base64}`:''

export async function prepareProfilePhoto(file:File):Promise<ProfilePhoto>{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('عکس باید با فرمت JPG، PNG یا WebP باشد.')
  if(file.size>8*1024*1024)throw new Error('حجم فایل اولیه باید کمتر از ۸ مگابایت باشد.')
  const bitmap=await createImageBitmap(file)
  const scale=Math.min(1,640/Math.max(bitmap.width,bitmap.height))
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale))
  canvas.getContext('2d')?.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close()
  const url=canvas.toDataURL('image/webp',.82)
  const [head,content_base64]=url.split(',')
  if(!content_base64||content_base64.length>1_700_000)throw new Error('حجم عکس پس از بهینه‌سازی هنوز زیاد است؛ عکس دیگری انتخاب کنید.')
  return {content_type:head.includes('image/webp')?'image/webp':'image/jpeg',content_base64}
}
