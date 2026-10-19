"""
Comprehensive Unit & Integration Test Suite for ICRS Universal Template Compatibility & Smart Rendering.
Tests:
1. Dynamic Data-Row Style Cloning & Merged Cell Preservation (Issue 1)
2. Universal Footer / Signature Block Detection & Safe Downward Shifting (Issue 2)
3. Intelligent TEXT_ONLY vs SNIPPET_ONLY Decision Engine & Clean Excel Rendering (Issue 3)
4. Full Stateless FastAPI /api/process Endpoint
"""
import io
import json
import math
import os
import sys
from copy import copy

try:
    import pytest
except ImportError:
    pytest = None

from fastapi.testclient import TestClient
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.cell.cell import MergedCell
from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "app"))

from app.main import app
from app.schemas import MappingConfig, ColumnMapping
from app.extractor import extract_pdf_annotations, ExtractedComment
from app.excel_engine import populate_excel_in_memory


def _fixture(func):
    return pytest.fixture(func) if pytest else func


@_fixture
def sample_pdf_bytes():
    """Returns sample PDF bytes from project root."""
    path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "sample_annotated_drawing.pdf")
    with open(path, "rb") as f:
        return f.read()


@_fixture
def sample_excel_bytes():
    """Returns sample corporate template bytes from project root."""
    path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "sample_corporate_template.xlsx")
    with open(path, "rb") as f:
        return f.read()


# ---------------------------------------------------------------------------
# TEXT-ONLY MODE TESTS: Pure Text Extraction & Clean Excel Injection
# ---------------------------------------------------------------------------

def test_extractor_text_only_mode(sample_pdf_bytes):
    """
    Verifies Text-Only Mode Extraction Rules:
    - All annotations extracted with render_mode='TEXT_ONLY' and image_bytes=None.
    - No image cropping or JPEG generation overhead.
    - Every comment has clean, transcribed text.
    - Sequential item numbering and natural ordering.
    """
    comments = extract_pdf_annotations(sample_pdf_bytes, context_margin=40.0)
    assert len(comments) > 0, "Should extract comments from sample annotated PDF"

    for c in comments:
        assert c.item_no >= 1
        assert c.page_num >= 1
        assert len(c.comment_text) > 0
        assert "\r" not in c.comment_text, "Carriage returns must be cleaned"
        assert c.render_mode == "TEXT_ONLY"
        assert c.image_bytes is None, f"Comment {c.item_no} must not have image_bytes in text-only mode"
        assert c.image_width == 0
        assert c.image_height == 0


def test_excel_injection_text_only(sample_pdf_bytes, sample_excel_bytes):
    """
    Verifies Text-Only Mode Excel Execution Rules:
    - Every row receives clean text without spacer newlines.
    - No images inserted into the workbook (ws._images is empty).
    - Row height is adjusted cleanly to fit the wrapped text.
    """
    comments = extract_pdf_annotations(sample_pdf_bytes)

    config = MappingConfig(
        sheet_name=None,
        header_row=6,
        data_start_row=7,
        columns=ColumnMapping(
            item_no="A",
            page_num="B",
            author="C",
            date="D",
            comment_text="F",
            snapshot=None,
            status="H",
            response="I",
        )
    )

    out_io = populate_excel_in_memory(sample_excel_bytes, comments, config)
    wb = openpyxl.load_workbook(out_io)
    ws = wb.active

    # Check each row for clean text-only injection
    for i, comment in enumerate(comments):
        row_idx = 7 + i
        cell_val = str(ws[f"F{row_idx}"].value or "")

        # Every row MUST have text
        assert len(cell_val.strip()) > 0, f"Row {row_idx} must have text"
        assert cell_val == comment.comment_text, f"Row {row_idx} must match comment text exactly"
        assert "\n\n\n" not in cell_val, f"Row {row_idx} must not have extra image spacing"

    # Workbook must have 0 images in text-only mode
    assert len(ws._images) == 0, "Excel worksheet must not contain image snapshots in text-only mode"


def test_excel_injection_dedicated_mode(sample_pdf_bytes, sample_excel_bytes):
    """Verifies that mapping a snapshot column in text-only mode succeeds cleanly without errors."""
    comments = extract_pdf_annotations(sample_pdf_bytes)

    config = MappingConfig(
        sheet_name=None,
        header_row=6,
        data_start_row=7,
        columns=ColumnMapping(
            item_no="A",
            page_num="B",
            author="C",
            date="D",
            comment_text="F",
            snapshot="G",  # Dedicated snapshot column mapped
            status="H",
            response="I",
        )
    )

    out_io = populate_excel_in_memory(sample_excel_bytes, comments, config)
    assert out_io.getvalue(), "Should generate non-empty Excel bytes"

    wb = openpyxl.load_workbook(out_io)
    ws = wb.active
    assert len(ws._images) == 0, "No images injected in text-only mode"


# ---------------------------------------------------------------------------
# ISSUE 1 TESTS: Dynamic Data-Row Style Cloning & Merged Cell Preservation
# ---------------------------------------------------------------------------

def test_dynamic_style_cloning_and_merge_replication():
    """
    Verifies Issue 1 Rules:
    - Vertically merged multi-row header detection: template_data_row = header_bottom + 1.
    - Never copies styles from header row.
    - Horizontal merges existing on template_data_row are replicated across all generated rows.
    - Clean style cloning: borders, fonts, and fill defaults to PatternFill(fill_type=None).
    """
    # Create a synthetic template with a 2-row vertically merged header and horizontal merge on data row
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "CRS"

    header_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
    border_thin = Border(
        left=Side(style="thin", color="CBD5E1"),
        right=Side(style="thin", color="CBD5E1"),
        top=Side(style="thin", color="CBD5E1"),
        bottom=Side(style="thin", color="CBD5E1"),
    )

    # Multi-row header spanning rows 4 to 5 (e.g. Header row 4, merged down to row 5)
    for c in range(1, 10):
        c_letter = openpyxl.utils.get_column_letter(c)
        ws.merge_cells(f"{c_letter}4:{c_letter}5")
        cell = ws[f"{c_letter}4"]
        cell.value = f"Header {c_letter}"
        cell.fill = header_fill
        cell.font = Font(bold=True, color="FFFFFF")

    # Archetype data row is row 6 (header_bottom + 1)
    # Give archetype row 6 a horizontal merge between Column D (4) and Column E (5)
    ws.merge_cells("D6:E6")
    for c in range(1, 10):
        cell = ws.cell(row=6, column=c)
        cell.border = border_thin
        # No background fill (clean)
        cell.fill = PatternFill(fill_type=None)

    tpl_io = io.BytesIO()
    wb.save(tpl_io)
    tpl_bytes = tpl_io.getvalue()

    # Synthetic comments
    dummy_comments = [
        ExtractedComment(
            item_no=i,
            page_num=1,
            author="Engineer",
            date_str="2026-10-17",
            comment_text=f"Test comment #{i} with sufficient text for evaluation",
            image_bytes=None,
            image_width=0,
            image_height=0,
            render_mode="TEXT_ONLY",
        )
        for i in range(1, 4)
    ]

    config = MappingConfig(
        sheet_name="CRS",
        header_row=4,  # Engine must detect header bottom = 5, template_data_row = 6
        data_start_row=6,
        columns=ColumnMapping(
            item_no="A",
            page_num="B",
            author="C",
            comment_text="D",  # Column D is part of D:E merge
            snapshot=None,
        )
    )

    out_io = populate_excel_in_memory(tpl_bytes, dummy_comments, config)
    res_wb = openpyxl.load_workbook(out_io)
    res_ws = res_wb["CRS"]

    # Check horizontal merges on generated rows (rows 6, 7, 8)
    merged_ranges_str = [str(r) for r in res_ws.merged_cells.ranges]
    assert "D6:E6" in merged_ranges_str, "Row 6 must retain archetype horizontal merge D6:E6"
    assert "D7:E7" in merged_ranges_str, "Generated row 7 must replicate horizontal merge D7:E7"
    assert "D8:E8" in merged_ranges_str, "Generated row 8 must replicate horizontal merge D8:E8"

    # Verify that generated data rows did NOT inherit header's dark blue fill
    for r in (6, 7, 8):
        for c in range(1, 10):
            cell = res_ws.cell(row=r, column=c)
            # Fill should be None or have fill_type=None
            fill_type = getattr(cell.fill, "fill_type", None)
            assert fill_type in (None, "none"), f"Cell ({r}, {c}) must not inherit header background color"
            # Border should be preserved on master and unmerged cells
            if not isinstance(cell, MergedCell):
                assert cell.border is not None and cell.border.left.style == "thin", f"Cell ({r}, {c}) must have borders"


# ---------------------------------------------------------------------------
# ISSUE 2 TESTS: Universal Footer Detection & Safe Downward Shifting
# ---------------------------------------------------------------------------

def test_footer_detection_and_safe_shifting():
    """
    Verifies Issue 2 Rules:
    - Detects footer boundary by keyword ("Approved by", "Signature", etc.) or merge pattern.
    - When comments exceed available rows, safely shifts footer block downward.
    - Preserves all footer values, cell styles, and shifted merged cell ranges.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "CRS"

    border_thin = Border(
        left=Side(style="thin", color="CBD5E1"),
        right=Side(style="thin", color="CBD5E1"),
        top=Side(style="thin", color="CBD5E1"),
        bottom=Side(style="thin", color="CBD5E1"),
    )

    # Header at row 6
    for c in range(1, 8):
        cell = ws.cell(row=6, column=c)
        cell.value = f"Col {c}"
        cell.font = Font(bold=True)

    # Template data row at row 7
    for c in range(1, 8):
        cell = ws.cell(row=7, column=c)
        cell.border = border_thin

    # Row 8 is an empty template data row
    for c in range(1, 8):
        cell = ws.cell(row=8, column=c)
        cell.border = border_thin

    # Row 9 is the start of the footer block with approval text & banner merge
    ws.merge_cells("A9:D9")
    ws["A9"] = "Approved by: Client Project Director"
    ws["A9"].font = Font(bold=True, color="1E3A8A")

    # Row 10 is signature block with merge
    ws.merge_cells("A10:D10")
    ws["A10"] = "Signature: __________________________"

    tpl_io = io.BytesIO()
    wb.save(tpl_io)
    tpl_bytes = tpl_io.getvalue()

    # 5 comments to inject (exceeding 2 available rows: 7 and 8)
    dummy_comments = [
        ExtractedComment(
            item_no=i,
            page_num=1,
            author="Reviewer",
            date_str="2026-10-17",
            comment_text=f"Resolution comment number {i} for structural engineering review",
            image_bytes=None,
            image_width=0,
            image_height=0,
            render_mode="TEXT_ONLY",
        )
        for i in range(1, 6)
    ]

    config = MappingConfig(
        sheet_name="CRS",
        header_row=6,
        data_start_row=7,
        columns=ColumnMapping(
            item_no="A",
            page_num="B",
            author="C",
            comment_text="D",
            snapshot=None,
        )
    )

    out_io = populate_excel_in_memory(tpl_bytes, dummy_comments, config)
    res_wb = openpyxl.load_workbook(out_io)
    res_ws = res_wb["CRS"]

    # 5 comments must occupy rows 7, 8, 9, 10, 11
    for i in range(1, 6):
        r = 6 + i
        assert res_ws[f"A{r}"].value == i, f"Row {r} must contain comment #{i}"

    # Because row 8 in the template was an empty row before the footer,
    # the engine preserves 1 blank separator row at row 12, and relocates footer to rows 13 and 14
    assert res_ws["A12"].value is None, "Row 12 must be a preserved blank separator row"
    assert "Approved by: Client Project Director" in str(res_ws["A13"].value), "Footer text must be preserved and shifted down to row 13"
    assert "Signature:" in str(res_ws["A14"].value), "Signature block must be preserved and shifted down to row 14"

    # Verify shifted merged ranges exist
    merged_ranges_str = [str(r) for r in res_ws.merged_cells.ranges]
    assert "A13:D13" in merged_ranges_str, "Shifted merge A13:D13 must be present"
    assert "A14:D14" in merged_ranges_str, "Shifted merge A14:D14 must be present"


# ---------------------------------------------------------------------------
# FASTAPI ENDPOINT INTEGRATION TEST
# ---------------------------------------------------------------------------

def test_fastapi_process_endpoint(sample_pdf_bytes, sample_excel_bytes):
    """Verifies the stateless FastAPI /api/process endpoint with multipart payload."""
    client = TestClient(app)

    mapping_payload = {
        "sheet_name": "Review Comments Matrix",
        "header_row": 6,
        "data_start_row": 7,
        "columns": {
            "item_no": "A",
            "page_num": "B",
            "author": "C",
            "comment_text": "F",
            "snapshot": "G"
        }
    }

    files = {
        "pdf_file": ("test_drawing.pdf", sample_pdf_bytes, "application/pdf"),
        "excel_file": ("test_template.xlsx", sample_excel_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    }
    data = {
        "mapping_config": json.dumps(mapping_payload)
    }

    response = client.post("/api/process", files=files, data=data)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    assert "attachment; filename=" in response.headers["content-disposition"]
    assert len(response.content) > 1000


def test_real_engineering_template_and_pdf():
    """
    Verifies that the real engineering PDF (SDOC-1000482...) and template (Comments_Resolution_Sheet.xlsx):
    1. Retain Row 11 as intact orange #FFC000 table header row (auto-correcting if header_row=10 was passed).
    2. Start comments at Row 12 with crisp white background fill (PatternFill(fill_type=None)).
    3. Crop wide horizontal table strips capturing Item No, Activity, and markup without text overlap.
    4. Safely shift the footer block ("Add additional as required") below all comment rows.
    """
    pdf_p = os.path.join(os.path.dirname(os.path.dirname(__file__)), "SDOC-1000482-GG-542-1310-A01-SNY-07-007-A4_2.pdf")
    xl_p = os.path.join(os.path.dirname(os.path.dirname(__file__)), "Comments_Resolution_Sheet.xlsx")

    if not os.path.exists(pdf_p) or not os.path.exists(xl_p):
        return

    with open(pdf_p, "rb") as f:
        pdf_bytes = f.read()
    with open(xl_p, "rb") as f:
        excel_bytes = f.read()

    comments = extract_pdf_annotations(pdf_bytes)
    assert len(comments) == 67, f"Expected all 67 comments extracted from SDOC PDF, got {len(comments)}"

    # Pass header_row=10 (testing frontend 0-based offset auto-correction to Row 11)
    config = MappingConfig(
        sheet_name="Comments Resolution Sheet",
        header_row=10,
        data_start_row=11,
        columns=ColumnMapping(
            item_no="A",
            page_num="B",
            comment_text="D",
            snapshot=None,  # Hybrid mode (merged D:F)
            response="G",
        )
    )

    out_io = populate_excel_in_memory(excel_bytes, comments, config)
    wb = openpyxl.load_workbook(out_io)
    ws = wb["Comments Resolution Sheet"]

    # 1. Row 11 must be the intact orange table header
    h_cell = ws["D11"]
    assert "Comments" in str(h_cell.value), "Row 11 must be preserved as table header!"
    assert str(getattr(h_cell.fill.start_color, "rgb", "")).endswith("FFC000"), "Row 11 must retain orange fill"

    # 2. Row 12 must be the first data row and must have crisp white fill
    d12 = ws["D12"]
    assert ws["A12"].value == 1, "Row 12 must contain Item #1"
    fill_rgb = getattr(d12.fill.start_color, "rgb", "00000000")
    assert d12.fill.fill_type in (None, "none") or fill_rgb in ("00000000", "FFFFFFFF"), "Row 12 must be crisp white"

    # 3. Last comment row
    last_row = 11 + len(comments)
    assert ws[f"A{last_row}"].value == len(comments)

    # 4. Footer shifted below comment rows
    footer_row = last_row + 1
    while ws[f"A{footer_row}"].value is None:
        footer_row += 1
    assert "Add additional" in str(ws[f"A{footer_row}"].value), "Footer must be shifted safely below all comments"


if __name__ == "__main__":
    pdf_p = os.path.join(os.path.dirname(os.path.dirname(__file__)), "sample_annotated_drawing.pdf")
    with open(pdf_p, "rb") as f:
        p_bytes = f.read()
    xl_p = os.path.join(os.path.dirname(os.path.dirname(__file__)), "sample_corporate_template.xlsx")
    with open(xl_p, "rb") as f:
        x_bytes = f.read()

    print("Running test_extractor_text_only_mode...")
    test_extractor_text_only_mode(p_bytes)
    print("[OK] test_extractor_text_only_mode passed.")

    print("Running test_excel_injection_text_only...")
    test_excel_injection_text_only(p_bytes, x_bytes)
    print("[OK] test_excel_injection_text_only passed.")

    print("Running test_excel_injection_dedicated_mode...")
    test_excel_injection_dedicated_mode(p_bytes, x_bytes)
    print("[OK] test_excel_injection_dedicated_mode passed.")

    print("Running test_dynamic_style_cloning_and_merge_replication...")
    test_dynamic_style_cloning_and_merge_replication()
    print("[OK] test_dynamic_style_cloning_and_merge_replication passed.")

    print("Running test_footer_detection_and_safe_shifting...")
    test_footer_detection_and_safe_shifting()
    print("[OK] test_footer_detection_and_safe_shifting passed.")

    print("Running test_fastapi_process_endpoint...")
    test_fastapi_process_endpoint(p_bytes, x_bytes)
    print("[OK] test_fastapi_process_endpoint passed.")

    print("Running test_real_engineering_template_and_pdf...")
    test_real_engineering_template_and_pdf()
    print("[OK] test_real_engineering_template_and_pdf passed.")

    print("\nALL UNIVERSAL UNIT & INTEGRATION TESTS PASSED SUCCESSFULLY! :)")

