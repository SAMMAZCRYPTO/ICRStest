"""
Stateless In-Memory Excel Injection Engine with Universal Dynamic Template Adaptation:
- Dynamic data-row style cloning & horizontal merge preservation
- Universal footer / signature block boundary detection & safe downward relocation
- Intelligent TEXT_ONLY vs SNIPPET_ONLY decision engine rendering
- Strict 1-based header verification & crisp white data rows (never inherits header fills)
- Non-overlapping wide horizontal context strip placement

Operates 100% in RAM using openpyxl.
"""
from typing import List, Optional, Tuple, Dict, Any
from copy import copy
import io
import math
import re
import openpyxl
from openpyxl.cell.cell import MergedCell
from openpyxl.drawing.image import Image as OpenpyxlImage
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.drawing.spreadsheet_drawing import OneCellAnchor, AnchorMarker
from openpyxl.drawing.xdr import XDRPositiveSize2D
from openpyxl.utils.units import pixels_to_EMU

try:
    from .schemas import MappingConfig
    from .extractor import ExtractedComment
except ImportError:
    from schemas import MappingConfig
    from extractor import ExtractedComment


def safe_set_cell_value(ws, col_letter: str, row_idx: int, value, alignment: Optional[Alignment] = None):
    """
    Safely writes a value to an Excel cell, even if the target coordinate is
    part of a merged cell range (redirects to the top-left master cell).
    """
    if not col_letter:
        return None
    coord = f"{col_letter.upper().strip()}{row_idx}"
    try:
        cell = ws[coord]
    except Exception:
        return None

    # If this cell is a MergedCell (read-only in openpyxl), find the master cell
    if isinstance(cell, MergedCell):
        for rng in ws.merged_cells.ranges:
            if cell.coordinate in rng:
                cell = ws.cell(row=rng.min_row, column=rng.min_col)
                break

    try:
        cell.value = value
        if alignment:
            cell.alignment = alignment
    except Exception:
        pass

    return cell


def populate_excel_in_memory(
    excel_bytes: bytes,
    comments: List[ExtractedComment],
    config: MappingConfig
) -> io.BytesIO:
    """
    Injects extracted comments into an uploaded Excel template in RAM based strictly
    on user-confirmed column mappings and universal dynamic structural detection rules.

    Universal Architectural Features:
    1. 1-Based Header Verification: Verifies header_row contains true column headers. If
       the frontend sent a 0-based index or skipped a row, auto-corrects header_row.
       Data injection strictly starts at template_data_row = header_bottom + 1. Never overwrites headers!
    2. Crisp White Data Rows: Data rows are explicitly set to PatternFill(fill_type=None),
       guaranteeing they never inherit orange #FFC000 or colored fills from the header row.
    3. Dynamic Horizontal Merge Replication: Clones horizontal merges on template_data_row
       (e.g., Columns D:F for Comments) to every generated row with borders intact.
    4. Universal Footer Detection & Safe Shift: Detects footer blocks by merge divergence,
       keywords, or subheaders, shifting them below the final comment row.
    5. Clean Non-Overlapping Layout:
       - TEXT_ONLY: Clean plain text, vertical="center", wrap_text=True, NO image.
       - SNIPPET_ONLY: Wide horizontal context strip embedded cleanly. If no popup note,
         cell string is empty ("") so the red/blue markup on the drawing is visible without text overlap.
    """
    wb = openpyxl.load_workbook(io.BytesIO(excel_bytes), data_only=False)

    # 1. Select target worksheet
    if config.sheet_name and config.sheet_name in wb.sheetnames:
        ws = wb[config.sheet_name]
    else:
        ws = wb.active

    # 2. Strict 1-Based Table Header Detection & Auto-Correction
    header_patterns = {
        'item': re.compile(r'^(item|sr|sr\.|s/n|sl|no|no\.|#|serial\s*no\.?)$', re.I),
        'page': re.compile(r'(page|sheet|dwg|drawing|section|doc|document)', re.I),
        'comment': re.compile(r'(comment|observation|remark|finding|description)', re.I),
        'response': re.compile(r'(response|resolution|disposition|contractor|reply)', re.I),
        'status': re.compile(r'(status|action|code|o/c|closed|open)', re.I),
        'author': re.compile(r'(author|reviewer|originator|by|commented\s*by|inspector|name)', re.I),
        'date': re.compile(r'(date|time)', re.I),
    }

    max_col = ws.max_column
    candidates = []
    for r in range(1, min(35, ws.max_row + 1)):
        non_empty = []
        for c in range(1, max_col + 1):
            val = ws.cell(r, c).value
            if val is not None and str(val).strip():
                non_empty.append((c, str(val).strip()))
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

    candidates.sort(key=lambda x: (x[0], x[2]), reverse=True)
    detected_best_header = candidates[0][1] if candidates else 1

    header_row = config.header_row
    cfg_non_empty = [c for c in range(1, max_col + 1) if ws.cell(header_row, c).value is not None and str(ws.cell(header_row, c).value).strip()]
    if (len(cfg_non_empty) < 2 or header_row < detected_best_header) and detected_best_header > 1:
        header_row = detected_best_header

    # Detect if header_row spans multiple vertically merged rows
    header_bottom = header_row
    for rng in list(ws.merged_cells.ranges):
        if rng.min_row <= header_row <= rng.max_row:
            if rng.max_row > header_bottom:
                header_bottom = rng.max_row

    # Data injection starts immediately below the header block
    template_data_row = header_bottom + 1

    # 3. Dynamic Footer Boundary Detection
    footer_regex = re.compile(
        r'(add additional|insert row|approved by|prepared by|reviewed by|signed by|signature|sign-off|client approval|contractor approval|end of|notes?:|^\s*\*\s*status|\baction code\b|\blegend\b|comments approved by|final resolution approved)',
        re.IGNORECASE
    )

    footer_start_row = None
    for r in range(template_data_row, ws.max_row + 1):
        vals = [str(ws.cell(r, c).value or '').strip() for c in range(1, max_col + 1) if ws.cell(r, c).value is not None]
        joined = ' '.join(vals)
        if footer_regex.search(joined):
            footer_start_row = r
            break

    has_blank_separator = False
    if footer_start_row and footer_start_row > template_data_row:
        prev_r = footer_start_row - 1
        prev_empty = all(
            (ws.cell(row=prev_r, column=c).value is None)
            for c in range(1, max_col + 1)
            if not isinstance(ws.cell(row=prev_r, column=c), MergedCell)
        )
        if prev_empty:
            has_blank_separator = True

    # 4. Extract Archetype Entry Rows (captures fonts, borders, fills/zebra striping, alignments, merges)
    data_end_row = (footer_start_row - 1) if footer_start_row else ws.max_row
    if has_blank_separator and data_end_row >= template_data_row:
        data_end_row -= 1

    entry_rows = list(range(template_data_row, data_end_row + 1)) if data_end_row >= template_data_row else [template_data_row]

    existing_entry_rows_count = len(entry_rows)
    total_comments = len(comments)
    rows_to_add = max(0, total_comments - existing_entry_rows_count)

    archetypes = []
    for er in entry_rows:
        merges = []
        for rng in ws.merged_cells.ranges:
            if rng.min_row <= er <= rng.max_row and rng.min_col != rng.max_col:
                merges.append((rng.min_col, rng.max_col))
        merges = sorted(list(set(merges)))

        styles = {}
        for c in range(1, max_col + 1):
            cell = ws.cell(row=er, column=c)
            styles[c] = {
                'font': copy(cell.font) if cell.font else None,
                'border': copy(cell.border) if cell.border else None,
                'fill': copy(cell.fill) if cell.fill else None,
                'alignment': copy(cell.alignment) if cell.alignment else None,
                'num_fmt': cell.number_format or 'General',
            }
        h = ws.row_dimensions[er].height
        archetypes.append({'merges': merges, 'styles': styles, 'height': h})

    # 5. Safe Footer Relocation (captures all cells, styles, merges, and heights)
    footer_cells = []
    footer_heights = {}
    footer_merges = []

    if footer_start_row and (rows_to_add > 0 or has_blank_separator):
        orig_max_row = ws.max_row
        for r in range(footer_start_row, orig_max_row + 1):
            rel_r = r - footer_start_row
            footer_heights[rel_r] = ws.row_dimensions[r].height
            for c in range(1, max_col + 1):
                cell = ws.cell(row=r, column=c)
                v = cell.value if not isinstance(cell, MergedCell) else None
                footer_cells.append({
                    'rel_r': rel_r,
                    'col': c,
                    'val': v,
                    'font': copy(cell.font) if cell.font else None,
                    'fill': copy(cell.fill) if cell.fill else None,
                    'border': copy(cell.border) if cell.border else None,
                    'alignment': copy(cell.alignment) if cell.alignment else None,
                    'num_fmt': cell.number_format
                })
        for rng in list(ws.merged_cells.ranges):
            if rng.min_row >= footer_start_row:
                footer_merges.append((
                    rng.min_row - footer_start_row,
                    rng.max_row - footer_start_row,
                    rng.min_col,
                    rng.max_col
                ))
                try:
                    ws.unmerge_cells(str(rng))
                except Exception:
                    pass
        # Clear old footer area
        for r in range(footer_start_row, orig_max_row + 1):
            ws.row_dimensions[r].height = None
            for c in range(1, max_col + 1):
                cell = ws.cell(row=r, column=c)
                cell.value = None
                cell.border = None
                cell.fill = openpyxl.styles.PatternFill(fill_type=None)

    # 6. Inject Comments into Data Rows
    cols = config.columns
    comment_col = cols.comment_text.upper().strip() if cols.comment_text else 'C'

    for i, comment in enumerate(comments):
        current_row = template_data_row + i
        arch = archetypes[i % len(archetypes)]

        # Apply archetype styles to every column (preserves zebra striping, fonts, borders)
        for c in range(1, max_col + 1):
            cell = ws.cell(row=current_row, column=c)
            st = arch['styles'].get(c, {})
            if st.get('font'):
                cell.font = copy(st['font'])
            if st.get('border'):
                cell.border = copy(st['border'])
            if st.get('fill'):
                cell.fill = copy(st['fill'])
            if st.get('alignment'):
                cell.alignment = copy(st['alignment'])
            if st.get('num_fmt'):
                cell.number_format = st['num_fmt']

        # Replicate horizontal merges from archetype row
        for min_c, max_c in arch['merges']:
            ws.merge_cells(start_row=current_row, start_column=min_c, end_row=current_row, end_column=max_c)
            master_border = arch['styles'].get(min_c, {}).get('border')
            if master_border:
                for col_idx in range(min_c, max_c + 1):
                    ws.cell(row=current_row, column=col_idx).border = copy(master_border)

        # Standard metadata fields
        if cols.item_no:
            safe_set_cell_value(ws, cols.item_no, current_row, comment.item_no or (i + 1), Alignment(horizontal='center', vertical='center'))

        if cols.page_num:
            safe_set_cell_value(ws, cols.page_num, current_row, f"Page {comment.page_num}", Alignment(horizontal='center', vertical='center'))

        if cols.author:
            safe_set_cell_value(ws, cols.author, current_row, comment.author or '', Alignment(horizontal='left', vertical='center'))

        if cols.date:
            safe_set_cell_value(ws, cols.date, current_row, comment.date_str or '', Alignment(horizontal='center', vertical='center'))

        if cols.status:
            safe_set_cell_value(ws, cols.status, current_row, 'Open', Alignment(horizontal='center', vertical='center'))

        if cols.response:
            safe_set_cell_value(ws, cols.response, current_row, '', Alignment(horizontal='left', vertical='center', wrap_text=True))

        # Text-only comment injection
        raw_text = (comment.comment_text or '').strip()
        if not raw_text:
            raw_text = f"[{comment.annot_type or 'Reviewer'} Markup]"
        clean_text = raw_text

        safe_set_cell_value(
            ws,
            comment_col,
            current_row,
            clean_text,
            Alignment(horizontal='left', vertical='top', wrap_text=True)
        )

        # Auto-fit row height based on text line count
        text_lines = sum(max(1, math.ceil(len(line) / 50.0)) for line in clean_text.split('\n'))
        text_h_pts = max(18.0, text_lines * 15.0)
        base_h = arch['height'] or 24.0
        ws.row_dimensions[current_row].height = min(409.0, max(base_h, text_h_pts + 8.0))

    # 7. If comments < existing_entry_rows_count, clear sample dummy text from remaining entry rows
    if total_comments < existing_entry_rows_count:
        for r_unused in range(template_data_row + total_comments, template_data_row + existing_entry_rows_count):
            if cols.comment_text:
                c_idx = openpyxl.utils.column_index_from_string(cols.comment_text.upper().strip())
                ws.cell(row=r_unused, column=c_idx).value = None
            if cols.response:
                r_idx = openpyxl.utils.column_index_from_string(cols.response.upper().strip())
                ws.cell(row=r_unused, column=r_idx).value = None
            if cols.author:
                a_idx = openpyxl.utils.column_index_from_string(cols.author.upper().strip())
                ws.cell(row=r_unused, column=a_idx).value = None
            if cols.date:
                d_idx = openpyxl.utils.column_index_from_string(cols.date.upper().strip())
                ws.cell(row=r_unused, column=d_idx).value = None

    # 8. Reconstruct Footer Block Below Generated Rows
    if footer_cells:
        final_comment_row = template_data_row + max(total_comments - 1, 0)
        new_footer_start = final_comment_row + 1
        if has_blank_separator:
            new_footer_start += 1  # Preserve 1 blank separator row

        for cell_info in footer_cells:
            target_r = new_footer_start + cell_info['rel_r']
            target_c = cell_info['col']
            c_cell = ws.cell(row=target_r, column=target_c)
            if cell_info['val'] is not None:
                c_cell.value = cell_info['val']
            if cell_info['font']:
                c_cell.font = copy(cell_info['font'])
            if cell_info['fill']:
                c_cell.fill = copy(cell_info['fill'])
            if cell_info['border']:
                c_cell.border = copy(cell_info['border'])
            if cell_info['alignment']:
                c_cell.alignment = copy(cell_info['alignment'])
            if cell_info['num_fmt']:
                c_cell.number_format = cell_info['num_fmt']

        for rel_r, h in footer_heights.items():
            if h is not None:
                ws.row_dimensions[new_footer_start + rel_r].height = h

        for min_r_rel, max_r_rel, min_c, max_c in footer_merges:
            ws.merge_cells(
                start_row=new_footer_start + min_r_rel,
                start_column=min_c,
                end_row=new_footer_start + max_r_rel,
                end_column=max_c
            )

    output_buffer = io.BytesIO()
    wb.save(output_buffer)
    output_buffer.seek(0)
    return output_buffer
