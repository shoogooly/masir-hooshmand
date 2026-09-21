FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./alembic.ini
COPY tests ./tests
RUN mkdir -p /app/uploads
EXPOSE 8000
COPY start.sh ./start.sh
CMD ["sh", "start.sh"]

