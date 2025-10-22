from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api.routes import router

app = FastAPI(title="Aeromar Flight Planner")

# Настройка CORS - разрешаем доступ с любых локальных IP
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", 
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"http://192\.168\.\d+\.\d+:3000|http://10\.\d+\.\d+\.\d+:3000|http://172\.\d+\.\d+\.\d+:3000",  # Локальные сети
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

# Для запуска: uvicorn app.main:app --reload
