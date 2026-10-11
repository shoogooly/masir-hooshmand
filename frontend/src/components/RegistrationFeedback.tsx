import '../styles/registration-feedback.css'

export function RequiredMark(){return <span className="required-mark" aria-hidden="true">*</span>}
export function StepError({message}:{message:string}){return message?<p className="step-validation-error" role="alert">{message}</p>:null}

export function registrationError(scope:HTMLElement|null):string{
 for(const field of scope?.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>('input,textarea,select')||[]){
  if(field.matches(':disabled')||field.type==='hidden')continue
  const name=field.getAttribute('data-field-label')||field.getAttribute('aria-label')||field.closest('label')?.querySelector('span')?.textContent?.replace('*','').trim()||field.labels?.[0]?.textContent?.replace('*','').trim()||'این فیلد'
  const value=field.value.trim(),valid=field.validity
  let reason=''
  if(field.required&&(!value||valid.valueMissing))reason=`«${name}» را ${field.type==='radio'||field.tagName==='SELECT'?'انتخاب':'تکمیل'} کنید.`
  else if(valid.customError)reason=field.validationMessage
  else if(value&&'minLength' in field&&field.minLength>0&&value.length<field.minLength)reason=`«${name}» باید حداقل ${field.minLength.toLocaleString('fa-IR')} نویسه باشد.`
  else if(valid.patternMismatch)reason=`«${name}» را مطابق راهنمای کنار فیلد وارد کنید.`
  else if(valid.rangeUnderflow||valid.rangeOverflow)reason=`«${name}» باید بین ${field.getAttribute('min')} و ${field.getAttribute('max')} باشد.`
  else if(!valid.valid)reason=`مقدار «${name}» معتبر نیست.`
  if(reason)return reason
 }
 return ''
}
