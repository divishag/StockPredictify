from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import load_env_file
from app.routers import dataset_router, health_router
from app.services import init_dataset_table, init_trained_models_table

app = FastAPI(title="Predictify Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(dataset_router)


@app.on_event("startup")
def on_startup() -> None:
    load_env_file()
    init_dataset_table()
    init_trained_models_table()
