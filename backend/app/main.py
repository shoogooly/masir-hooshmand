from app.api.onboarding_flow import router as onboarding_flow_router
from app.api.exam_files import router as exam_files_router
from app.api.passwords import router as passwords_router
from app.api.study_reports import router as study_reports_router
from app.api.ai import router as ai_router
from app.api.ai_planner import router as ai_planner_router
from app.api.advisor_evaluation import router as advisor_evaluation_router
from app.ai_jobs import worker as ai_worker
from threading import Event, Thread
from contextlib import asynccontextmanager
import logging
import time
from uuid import uuid4
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from app.api.extended import router as extended_router
from app.api.admin_students_ext import router as admin_students_router
from app.api.subscription_ext import router as subscription_router
from app.api.router import router
from app.api.accounts_ext import router as accounts_router
from app.core.config import settings
from app.core.security import csrf_guard
from app.db.session import Base, SessionLocal, engine
from app.services import seed_database


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("masir-hooshmand")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed_database(db)
    ai_stop = Event()
    ai_thread = Thread(target=ai_worker, args=(ai_stop,), daemon=True, name="weekly-ai")
    ai_thread.start()
    try:
        yield
    finally:
        ai_stop.set()
        ai_thread.join(timeout=2)


app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=[settings.frontend_origin], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def request_context(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", str(uuid4()))
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        logger.exception("Unhandled error request_id=%s", request_id)
        raise
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    logger.info("%s %s %s %.1fms", request.method, request.url.path, response.status_code, (time.perf_counter() - start) * 1000)
    return response


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    detail = exc.detail if isinstance(exc.detail, dict) else {}
    return JSONResponse(status_code=exc.status_code, content={"success": False, "error": {
        "code": detail.get("code", f"HTTP_{exc.status_code}"),
        "message": detail.get("message", str(exc.detail)), "details": [],
    }, "request_id": request.headers.get("X-Request-ID")}, headers={**(exc.headers or {}), "Cache-Control": "no-store"})


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    details = jsonable_encoder(exc.errors(), custom_encoder={ValueError: str})
    return JSONResponse(status_code=422, content={"success": False, "error": {"code": "VALIDATION_ERROR", "message": "اطلاعات ورودی معتبر نیست", "details": details}, "request_id": request.headers.get("X-Request-ID")})


@app.get("/health")
def health():
    return {"status": "ok", "service": "masir-hooshmand-api", "version": "1.0.0"}


app.include_router(router, prefix="/api/v1", dependencies=[Depends(csrf_guard)])
app.include_router(extended_router, prefix="/api/v1", dependencies=[Depends(csrf_guard)])
app.include_router(admin_students_router, prefix="/api/v1", dependencies=[Depends(csrf_guard)])
app.include_router(subscription_router, prefix="/api/v1", dependencies=[Depends(csrf_guard)])
app.include_router(accounts_router, prefix="/api/v1", dependencies=[Depends(csrf_guard)])
app.include_router(exam_files_router, prefix="/api/v1", dependencies=[Depends(csrf_guard)])
app.include_router(passwords_router, prefix="/api/v1", dependencies=[Depends(csrf_guard)])
app.include_router(study_reports_router, prefix="/api/v1", dependencies=[Depends(csrf_guard)])
app.include_router(ai_router, prefix="/api/v1", dependencies=[Depends(csrf_guard)])
app.include_router(ai_planner_router, prefix="/api/v1", dependencies=[Depends(csrf_guard)])
app.include_router(advisor_evaluation_router, prefix="/api/v1", dependencies=[Depends(csrf_guard)])

app.include_router(onboarding_flow_router, prefix="/api/v1", dependencies=[Depends(csrf_guard)])
