@echo off
title ICRS Micro-SaaS Launcher
echo ========================================================
echo Starting ICRS Backend (FastAPI :8000) and Frontend (Next.js :3005)
echo ========================================================
start "ICRS FastAPI Backend" cmd /c "cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
start "ICRS Next.js Frontend" cmd /c "cd frontend && npm run dev"
echo Both services launched!
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:3005
timeout /t 4 >nul
start http://localhost:3005

