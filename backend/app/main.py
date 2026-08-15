from contextlib import asynccontextmanager
import logging
import time
from uuid import uuid4
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api.router import router
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
    yield


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
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    logger.info("%s %s %s %.1fms", request.method, request.url.path, response.status_code, (time.perf_counter() - start) * 1000)
    return response


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"success": False, "error": {"code": f"HTTP_{exc.status_code}", "message": str(exc.detail), "details": []}, "request_id": request.headers.get("X-Request-ID")})


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"success": False, "error": {"code": "VALIDATION_ERROR", "message": "اطلاعات ورودی معتبر نیست", "details": exc.errors()}, "request_id": request.headers.get("X-Request-ID")})


@app.get("/health")
def health():
    return {"status": "ok", "service": "masir-hooshmand-api", "version": "1.0.0"}


app.include_router(router, prefix="/api/v1", dependencies=[Depends(csrf_guard)])
