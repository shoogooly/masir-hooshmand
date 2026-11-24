export const MESSENGER_CONTACT_PARAM='contact'

export function advisorMessengerThread(studentId:string){
  const params=new URLSearchParams({[MESSENGER_CONTACT_PARAM]:studentId})
  return `/app/advisor/messages?${params}`
}
