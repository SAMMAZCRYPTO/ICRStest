# 📑 ICRS Studio - PDF to Excel Comment Resolution Sheet Generator

Enterprise B2B Micro-SaaS architecture for automated PDF drawing markup extraction and strict Excel Comment Resolution Sheet (CRS) template injection with **Zero Data Retention** (processed 100% in RAM via `io.BytesIO`).

---

## 🌟 Architecture & Key Features

### 1. ⚡ Stateless FastAPI Backend (`backend/`)
- **Zero Data Retention**: Processes PDF drawings and Excel templates entirely in memory (`io.BytesIO`). Files are never written to the server's disk, and large byte buffers are explicitly purged (`gc.collect()`) after streaming.
- **Bounded 144 DPI Snapshot Cropping (`PyMuPDF`)**: Eliminates timeouts on massive architectural drawings. Renders only the exact annotation bounding box with a 40pt context margin (`page.get_pixmap(clip=padded_rect, dpi=144, annots=True)`).
- **High-Efficiency JPEG Compression (`Pillow`)**: Converts pixmaps to RGB (dropping unused alpha channels), clamps maximum width to 400px, and encodes to JPEG at 70% quality, preventing multi-hundred-megabyte Excel bloat.
- **Strict Column Mapping (`openpyxl`)**: Injects data strictly based on client-confirmed column indices rather than guessing heuristically.
- **Hybrid Cell Mode**: If the user's template lacks a dedicated snapshot column, the engine writes the text, adds anchor spacer newlines, and embeds the image into the **exact same cell** with dynamic row height scaling (`points = px * 0.75 + text_padding`).
- **Fast Table Boundary Append**: Appends new rows at the table boundary and copies formatting using the internal `cell._style` integer index for high-speed throughput.

### 2. 💻 Next.js (React) Frontend Studio (`frontend/`)
- **Modern Enterprise Dark UI**: Built with Tailwind CSS, Lucide icons, glassmorphism, and responsive drag-and-drop file uploaders.
- **Client-Side Header Extraction (`SheetJS / xlsx`)**: Parses the first 20 rows of the uploaded Excel file directly in the browser to identify header rows and sheet names.
- **Interactive Mapping UI**: Configurable dropdowns for Reviewer, Page, Comment Text, Snapshot Image, Item No, Date, Status, and Response.
- **Local Persistence**: Automatically caches the user's confirmed JSON mapping configuration to browser `localStorage` for future drawing reviews.
- **1-Click Demo Loader**: Built-in test drawing and corporate template ready to test instantly.

---

## 📁 Repository Directory Structure

```text
ICRS/
├── backend/
│   ├── app/
│   │   ├── main.py              # Stateless FastAPI app with /api/process endpoint
│   │   ├── extractor.py         # PyMuPDF bounded snapshot engine & JPEG compressor
│   │   ├── excel_engine.py      # openpyxl engine: strict mapping, hybrid cells, _style copy
│   │   └── schemas.py           # Pydantic models for MappingConfig
│   ├── requirements.txt         # FastAPI, PyMuPDF, openpyxl, Pillow, python-multipart
│   └── test_backend.py          # Unit & integration test suite (RAM, Hybrid mode, API)
│
├── frontend/
│   ├── src/
│   │   ├── app/                 # Next.js App Router (layout.tsx, page.tsx, globals.css)
│   │   ├── components/          # FileDropzone.tsx, MappingUI.tsx
│   │   └── types/               # crs.ts TypeScript interfaces
│   ├── public/                  # Static assets & sample demo files
│   └── package.json             # Next.js, SheetJS, Tailwind, Lucide
│
├── run_all.bat                  # 1-Click launcher: starts both backend (:8000) & frontend (:3000)
├── run_backend.bat              # Launch FastAPI backend standalone
├── run_frontend.bat             # Launch Next.js frontend standalone
└── README.md
```

---

## 🚀 Quick Start Guide

### 1. Launch Both Services (Windows 1-Click)
Double-click:
```cmd
run_all.bat
```
This automatically starts:
- **FastAPI Backend**: `http://localhost:8000` (Docs: `http://localhost:8000/docs`)
- **Next.js Frontend Studio**: `http://localhost:3000`

---

### 2. Manual Startup

#### Backend (FastAPI):
```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### Frontend (Next.js):
```bash
cd frontend
npm install
npm run dev
```
Open **`http://localhost:3000`** in your browser.

---

### 3. Running Backend Automated Tests
```bash
python backend/test_backend.py
```
Verifies memory-only extraction, JPEG compression, dedicated column mode, Hybrid Cell Mode, and the FastAPI multipart endpoint.
