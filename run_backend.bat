@echo off
title ICRS FastAPI Stateless Backend (Port 8000)
echo ========================================================
echo Starting ICRS Stateless FastAPI Backend on http://localhost:8000
echo ========================================================
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
pause
