"""
Stateless FastAPI Processing Backend (Zero Data Retention).
Processes PDF drawings and Excel templates entirely in RAM and streams the results.
"""
from typing import Optional
import gc
import json
import io
import re
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse

try:
    from .schemas import MappingConfig
    from .extractor import extract_pdf_annotations
    from .excel_engine import populate_excel_in_memory
except ImportError:
    from schemas import MappingConfig
    from extractor import extract_pdf_annotations
    from excel_engine import populate_excel_in_memory


app = FastAPI(
    title="ICRS B2B Processing API",
    description="Stateless PDF Markup Extraction & Excel CRS Injection Engine",
    version="2.0.0"
)

# Enable CORS for Next.js frontend (all local & deployed origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3005",
        "http://127.0.0.1:3005",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "*"],
)


@app.get("/health")
@app.get("/api/health")
def health_check():
    """Health and liveness check endpoint."""
    return {"status": "healthy", "service": "ICRS Engine v2 (Stateless)"}


@app.post("/api/inspect-pdf")
async def inspect_pdf(
    pdf_file: UploadFile = File(..., description="Uploaded annotated drawing PDF")
):
    """
    Inspects PDF in RAM to return annotation count, pages, and lightweight previews.
    Zero data retention: buffers are deleted and GC triggered immediately.
    """
    if not pdf_file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only .pdf files are supported.")
    
    pdf_bytes = await pdf_file.read()
    if len(pdf_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded PDF file is empty.")
    if len(pdf_bytes) > 100 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Uploaded PDF exceeds maximum 100MB size limit.")

    try:
        import base64
        comments = extract_pdf_annotations(pdf_bytes, context_margin=40.0)
        
        previews = []
        for c in comments:  # Return all comments for full real-time live review in the app
            previews.append({
                "item_no": c.item_no,
                "page_num": c.page_num,
                "author": c.author or "Reviewer",
                "date": c.date_str or "",
                "comment_text": c.comment_text,
                "annot_type": c.annot_type,
                "render_mode": c.render_mode,
                "thumbnail": None,
            })

        return {
            "success": True,
            "filename": pdf_file.filename,
            "count": len(comments),
            "previews": previews,
        }
    finally:
        del pdf_bytes
        gc.collect()


@app.post("/api/inspect-excel")
async def inspect_excel(
    excel_file: UploadFile = File(..., description="Uploaded Excel template (.xlsx/.xlsm)"),
    sheet_name: Optional[str] = Form(None)
):
    """
    High-fidelity in-memory Excel inspection.
    Extracts actual cell values, merges, fills, fonts, borders, alignments, and column widths.
    Zero data retention: buffers purged immediately.
    """
    if not (excel_file.filename.lower().endswith(".xlsx") or excel_file.filename.lower().endswith(".xlsm")):
        raise HTTPException(status_code=400, detail="Only .xlsx and .xlsm files are supported.")

    excel_bytes = await excel_file.read()
    if len(excel_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded Excel file is empty.")
    if len(excel_bytes) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Uploaded Excel template exceeds maximum 50MB size limit.")

    try:
        import openpyxl
        import io
        wb = openpyxl.load_workbook(io.BytesIO(excel_bytes), data_only=False)
        sheet_names = wb.sheetnames
        target_sheet = sheet_name if sheet_name and sheet_name in sheet_names else wb.active.title
        ws = wb[target_sheet]

        def to_hex(color):
            if not color:
                return None
            if hasattr(color, 'rgb') and color.rgb:
                val = str(color.rgb)
                if val in ('00000000', '0'):
                    return None
                if len(val) == 8:
                    return '#' + val[2:]
                return '#' + val
            return None

        merges = []
        for m in ws.merged_cells.ranges:
            merges.append({
                's': {'r': m.min_row - 1, 'c': m.min_col - 1},
                'e': {'r': m.max_row - 1, 'c': m.max_col - 1}
            })

        max_row = min(ws.max_row, 100)
        max_col = ws.max_column

        # Detect table header row using robust multi-column category analysis
        header_patterns = {
            'item': re.compile(r'^(item|sr|sr\.|s/n|sl|no|no\.|#|serial\s*no\.?)$', re.I),
            'page': re.compile(r'(page|sheet|dwg|drawing|section|doc|document)', re.I),
            'comment': re.compile(r'(comment|observation|remark|finding|description)', re.I),
            'response': re.compile(r'(response|resolution|disposition|contractor|reply)', re.I),
            'status': re.compile(r'(status|action|code|o/c|closed|open)', re.I),
            'author': re.compile(r'(author|reviewer|originator|by|commented\s*by|inspector|name)', re.I),
            'date': re.compile(r'(date|time)', re.I),
        }

        candidates = []
        for r in range(1, min(35, max_row + 1)):
            non_empty = []
            for c in range(1, max_col + 1):
                val = ws.cell(r, c).value
                if val is not None and str(val).strip():
                    non_empty.append((c, str(val).strip()))
            
            # A true table header row must have at least 2 distinct non-empty columns (avoid title banners)
            if len(non_empty) < 2:
                continue

            matched_cats = set()
            matched_cols = 0
            for col_idx, text in non_empty:
                for cat, pat in header_patterns.items():
                    if pat.search(text):
                        matched_cats.add(cat)
                        matched_cols += 1
                        break
            
            if len(matched_cats) >= 2 or 'comment' in matched_cats:
                score = len(matched_cats) * 20 + matched_cols * 10
                candidates.append((score, r, len(non_empty)))

        if candidates:
            candidates.sort(key=lambda x: (x[0], x[2]), reverse=True)
            best_header = candidates[0][1]
        else:
            best_header = 1

        suggested_mapping = {}
        for c in range(1, max_col + 1):
            cell_val = str(ws.cell(best_header, c).value or '').strip().lower()
            col_letter = openpyxl.utils.get_column_letter(c)
            if not cell_val:
                continue
            if not suggested_mapping.get('item_no') and any(w in cell_val for w in ['item', 'sr.', 'sr #', 's/n', 'sl. no', 'comment id', 'serial', '#', 'no.', 'no']):
                suggested_mapping['item_no'] = col_letter
            elif not suggested_mapping.get('page_num') and any(w in cell_val for w in ['sheet', 'drawing', 'dwg', 'section', 'page', 'doc', 'document']):
                suggested_mapping['page_num'] = col_letter
            elif not suggested_mapping.get('comment_text') and any(w in cell_val for w in ['comment', 'observation', 'remark', 'finding', 'details']):
                suggested_mapping['comment_text'] = col_letter
            elif not suggested_mapping.get('contractor_response') and any(w in cell_val for w in ['response', 'disposition', 'contractor', 'reply']):
                suggested_mapping['contractor_response'] = col_letter
            elif not suggested_mapping.get('status') and any(w in cell_val for w in ['status', 'action', 'resolution', 'code']):
                suggested_mapping['status'] = col_letter
            elif not suggested_mapping.get('author') and any(w in cell_val for w in ['reviewer', 'author', 'originator', 'inspector', 'commented by', 'by']):
                suggested_mapping['author'] = col_letter
            elif not suggested_mapping.get('date') and any(w in cell_val for w in ['date', 'time']):
                suggested_mapping['date'] = col_letter

        rows = []
        for r in range(1, max_row + 1):
            row_cells = []
            for c in range(1, max_col + 1):
                cell = ws.cell(r, c)
                val = str(cell.value) if cell.value is not None else ''
                bg = to_hex(cell.fill.start_color) if cell.fill else None
                fg = to_hex(cell.font.color) if cell.font else None
                bold = cell.font.bold if cell.font else False
                italic = cell.font.italic if cell.font else False
                align_h = cell.alignment.horizontal if cell.alignment else None
                align_v = cell.alignment.vertical if cell.alignment else None
                wrap = cell.alignment.wrap_text if cell.alignment else False
                row_cells.append({
                    'r': r - 1,
                    'c': c - 1,
                    'addr': f"{openpyxl.utils.get_column_letter(c)}{r}",
                    'value': val,
                    'bg_color': bg,
                    'font_color': fg,
                    'bold': bold,
                    'italic': italic,
                    'align_h': align_h,
                    'align_v': align_v,
                    'wrap': wrap,
                })
            rows.append(row_cells)

        col_widths = {}
        for c in range(1, max_col + 1):
            col_let = openpyxl.utils.get_column_letter(c)
            dim = ws.column_dimensions.get(col_let)
            width = dim.width if dim and dim.width else 13
            col_widths[col_let] = int(width * 8)

        return {
            'success': True,
            'filename': excel_file.filename,
            'sheet_names': sheet_names,
            'active_sheet': target_sheet,
            'header_row': best_header,
            'max_row': max_row,
            'max_col': max_col,
            'merges': merges,
            'col_widths': col_widths,
            'rows': rows,
            'suggested_mapping': suggested_mapping
        }
    finally:
        del excel_bytes
        gc.collect()


@app.post("/api/process", response_class=Response)
async def process_comment_resolution_sheet(
    pdf_file: UploadFile = File(..., description="Uploaded annotated drawing PDF"),
    excel_file: UploadFile = File(..., description="Uploaded blank or corporate Excel template (.xlsx)"),
    mapping_config: str = Form(..., description="JSON serialized MappingConfig schema")
):
    """
    Zero-Disk In-Memory Processing Pipeline:
    1. Reads PDF & Excel files directly into memory buffers (io.BytesIO).
    2. Parses clipped bounding-box markups & compresses thumbnails to JPEG.
    3. Injects data according to strict user-confirmed mapping rules (with Hybrid Cell Mode).
    4. Streams populated .xlsx back to client.
    5. Immediately purges variables and triggers garbage collection.
    """
    if not pdf_file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Invalid PDF file. Only .pdf files are supported.")
    if not excel_file.filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Invalid Excel file. Only .xlsx templates are supported.")

    # Parse and validate JSON mapping config
    try:
        config_dict = json.loads(mapping_config)
        config = MappingConfig(**config_dict)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid mapping_config JSON format: {str(exc)}"
        )

    pdf_bytes = None
    excel_bytes = None
    output_stream = None

    try:
        # 1. Read files directly into memory
        pdf_bytes = await pdf_file.read()
        excel_bytes = await excel_file.read()

        if len(pdf_bytes) == 0:
            raise HTTPException(status_code=400, detail="Uploaded PDF file is empty.")
        if len(pdf_bytes) > 100 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Uploaded PDF exceeds maximum 100MB size limit.")
        if len(excel_bytes) == 0:
            raise HTTPException(status_code=400, detail="Uploaded Excel file is empty.")
        if len(excel_bytes) > 50 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Uploaded Excel template exceeds maximum 50MB size limit.")

        # 2. Extract annotations and bounded visual snapshots in RAM
        comments = extract_pdf_annotations(pdf_bytes, context_margin=40.0)

        if not comments:
            raise HTTPException(
                status_code=400,
                detail="No review annotations or markups were found in the uploaded PDF."
            )

        # 3. Inject comments into Excel in RAM
        output_stream = populate_excel_in_memory(excel_bytes, comments, config)

        excel_data = output_stream.getvalue()
        output_stream.close()

        clean_base = pdf_file.filename.rsplit(".", 1)[0]
        filename_out = f"CRS_Resolved_{clean_base}.xlsx"

        # 4. Return clean, uncorrupted Excel binary file to client
        return Response(
            content=excel_data,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="{filename_out}"',
                "Content-Length": str(len(excel_data)),
                "Access-Control-Expose-Headers": "Content-Disposition",
            }
        )

    except HTTPException:
        raise
    except Exception as exc:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Processing error: {str(exc)}")
    finally:
        # Zero Data Retention: Explicit buffer deletion and garbage collection
        if pdf_bytes is not None:
            del pdf_bytes
        if excel_bytes is not None:
            del excel_bytes
        gc.collect()



if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
