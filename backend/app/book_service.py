import json
from collections import defaultdict
from fastapi import HTTPException
from sqlalchemy import select, update
from app.book_models import Book, BookTopic, StudentBook
from app.models import Activity, WeeklyPlan, StudyReport, utcnow
from app.study_reporting import report_bounds

def catalog(db,student_id=None):
    books=db.scalars(select(Book).order_by(Book.title,Book.publication_year.desc())).all()
    topics=db.scalars(select(BookTopic).order_by(BookTopic.title)).all()
    owned={row.book_id:row.owned for row in db.scalars(select(StudentBook).where(StudentBook.student_id==student_id)).all()} if student_id else {}
    done=defaultdict(int);reserved=defaultdict(int)
    if student_id:
        pairs=db.execute(select(Activity,WeeklyPlan).join(WeeklyPlan,Activity.plan_id==WeeklyPlan.id).where(
            WeeklyPlan.student_id==student_id,WeeklyPlan.status=="published",Activity.book_topic_id!="")).all()
        plan_ids={p.id for a,p in pairs}
        reports={(r.plan_id,r.scope):json.loads(r.data_json) for r in db.scalars(select(StudyReport).where(StudyReport.plan_id.in_(plan_ids))).all()} if plan_ids else {}
        for a,p in pairs:
            report=reports.get((p.id,"activity:"+a.id))
            completed=report.get("status")=="done" if report is not None else a.status=="completed"
            if completed:
                actual=report.get("question_count") if report is not None else a.test_count or None
                done[a.book_topic_id]+=actual if actual is not None else a.book_question_count
            elif (report or {}).get("status")!="not_done" and a.status!="skipped":
                try:ends=report_bounds(p)[1]
                except (ValueError,TypeError):ends=None
                if ends and utcnow()<ends:reserved[a.book_topic_id]+=a.book_question_count
    result=[]
    for book in books:
        rows=[]
        for t in topics:
            if t.book_id!=book.id:continue
            remaining=max(0,t.question_count-done[t.id])
            rows.append({"id":t.id,"title":t.title,"question_type":t.question_type,"question_count":t.question_count,
                "completed":done[t.id],"remaining":remaining,"reserved":reserved[t.id],
                "available":max(0,remaining-reserved[t.id])})
        result.append({"id":book.id,"title":book.title,"publication_year":book.publication_year,"active":book.active,
            "owned":owned.get(book.id,False),"topics":rows})
    return result

def inventory(db,student_id):
    return [b for b in catalog(db,student_id) if b["owned"] and b["active"]]

def validate_allocations(db,student_id,activities,lock=False):
    if lock:
        # Serialize publication against another publication or ownership change.
        db.execute(update(StudentBook).where(StudentBook.student_id==student_id).values(updated_at=utcnow()))
    available={t["id"]:t for b in inventory(db,student_id) for t in b["topics"]}
    requested=defaultdict(int)
    for item in activities:
        topic=item.get("book_topic_id") or ""
        if not isinstance(topic,str) or len(topic)>36:
            raise HTTPException(422,"شناسه مبحث معتبر نیست")
        count=item.get("book_question_count",0)
        if not isinstance(count,int) or isinstance(count,bool) or count<0 or count>10000:
            raise HTTPException(422,"تعداد سؤال‌های بازه معتبر نیست")
        if not topic:
            if count:raise HTTPException(422,"برای تعداد سؤال باید مبحث کتاب را انتخاب کنید")
            continue
        if topic not in available:raise HTTPException(422,"مبحث انتخاب‌شده در کتاب‌های فعلی این دانش‌آموز نیست")
        if count<1:raise HTTPException(422,"تعداد سؤال‌های بازه را وارد کنید")
        requested[topic]+=count
    for topic,count in requested.items():
        if count>available[topic]["available"]:
            raise HTTPException(422,"تعداد سؤال‌های برنامه از موجودی قابل برنامه‌ریزی مبحث «"+available[topic]["title"]+"» بیشتر است")
