"""
High-Performance In-Memory PDF Annotation Extractor (Text-Only Mode).
Parses PDF annotations, reviewer callouts, free-text notes, highlights, and markups
directly in RAM with zero data retention. Visual snapshots are bypassed in text-only mode
to ensure every comment appears with full transcribed text and rapid performance.
"""
from dataclasses import dataclass
from typing import List, Optional
import io
import re
import pymupdf


@dataclass
class ExtractedComment:
    """Represents a single extracted review comment (Text-Only Mode)."""
    item_no: int
    page_num: int
    author: str
    date_str: str
    comment_text: str
    image_bytes: Optional[bytes] = None  # None in text-only mode
    image_width: int = 0
    image_height: int = 0
    render_mode: str = "TEXT_ONLY"
    annot_type: str = "Markup"
    has_popup_note: bool = False
    popup_text: str = ""
    target_y0: float = 0.0
    target_x0: float = 0.0
    target_y1: float = 0.0
    target_x1: float = 0.0
    page_width: float = 0.0
    page_height: float = 0.0


def _parse_pdf_date(raw_date: Optional[str]) -> str:
    """Normalizes PDF D:YYYYMMDD format to readable YYYY-MM-DD."""
    if not raw_date:
        return ""
    clean = raw_date.strip()
    if clean.startswith("D:"):
        clean = clean[2:]
    if len(clean) >= 8 and clean[:8].isdigit():
        return f"{clean[0:4]}-{clean[4:6]}-{clean[6:8]}"
    return clean[:10]


def _bbox_distance(r1: pymupdf.Rect, r2: pymupdf.Rect) -> float:
    """Computes Euclidean distance between two bounding rectangles."""
    dx = max(0.0, r1.x0 - r2.x1, r2.x0 - r1.x1)
    dy = max(0.0, r1.y0 - r2.y1, r2.y0 - r1.y1)
    return (dx * dx + dy * dy) ** 0.5


def extract_pdf_annotations(
    pdf_bytes: bytes,
    context_margin: float = 40.0,
    max_snapshot_width: int = 520,
    jpeg_quality: int = 80
) -> List[ExtractedComment]:
    """
    Parses PDF annotations directly in RAM without writing to disk.
    Text-Only Mode: Extracts every reviewer comment, callout, sticky note, markup,
    and highlighted text without generating or attaching image snippets.
    Comments are naturally ordered by page, top-to-bottom, left-to-right.
    """
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    raw_records = []

    try:
        for page_idx, page in enumerate(doc):
            page_num = page_idx + 1
            raw_annots = page.annots()
            if not raw_annots:
                continue

            pw = float(page.rect.width)
            ph = float(page.rect.height)
            candidates = []
            empty_lines = []

            for annot in raw_annots:
                try:
                    annot_type_id = annot.type[0]
                    annot_type_name = annot.type[1]

                    # Filter out non-review internal PDF objects: Link (1), Popup (15), Widget (19)
                    if annot_type_id in (1, 15, 19) or annot_type_name in ("Link", "Popup", "Widget"):
                        continue

                    info = annot.info or {}
                    author = (
                        info.get("title")
                        or info.get("author")
                        or info.get("name")
                        or ""
                    ).strip()

                    date_str = _parse_pdf_date(info.get("modDate") or info.get("creationDate"))
                    raw_content = (info.get("content") or "").strip()
                    clean_content = " ".join(raw_content.replace("\r", " ").split()).strip()
                    subj = (info.get("subject") or "").strip()

                    rect = annot.rect
                    if rect.is_empty or rect.is_infinite:
                        continue

                    target_rect = pymupdf.Rect(rect)
                    if annot.vertices:
                        for vx, vy in annot.vertices:
                            if vx != 0.0 or vy != 0.0:
                                target_rect.include_point(pymupdf.Point(vx, vy))

                    # Filter only standalone empty single-char checkboxes without author on Cover Page
                    if page_num == 1 and clean_content.lower() in ("x", "✓", "v") and not author:
                        continue

                    has_popup_note = bool(clean_content)
                    popup_text = clean_content if has_popup_note else ""
                    clean_text = clean_content

                    # If no text in annot.info['content'], try get_text or underlying page text
                    if not clean_text:
                        underlying = " ".join(page.get_text("text", clip=target_rect).split()).strip()
                        if annot_type_name in ("Highlight", "Underline", "StrikeOut", "Squiggly", "Caret") or annot_type_id in (8, 9, 10, 11):
                            if underlying:
                                clean_text = underlying
                            else:
                                clean_text = f"[{annot_type_name} Markup]"
                        elif underlying:
                            clean_text = f"[{subj or annot_type_name}]: {underlying}"
                        elif subj and subj.lower() not in (annot_type_name.lower(), "line", "shape", "square", "circle"):
                            clean_text = f"[{subj}]"

                    # Convert unrotated annotation rect to visual page coordinates
                    rot_m = page.rotation_matrix
                    vis_rect = target_rect * rot_m

                    # Collect empty shapes/lines for proximity linking
                    if not clean_text and annot_type_name in ("Line", "PolyLine", "Ink", "Square", "Circle"):
                        empty_lines.append({
                            "annot": annot,
                            "rect": target_rect,
                            "vis_rect": vis_rect,
                            "type_name": annot_type_name,
                            "author": author or "Reviewer",
                            "date_str": date_str,
                            "subj": subj,
                            "page_width": pw,
                            "page_height": ph,
                        })
                    else:
                        candidates.append({
                            "page_num": page_num,
                            "y0": vis_rect.y0,
                            "x0": vis_rect.x0,
                            "y1": vis_rect.y1,
                            "x1": vis_rect.x1,
                            "page_width": pw,
                            "page_height": ph,
                            "author": author or "Reviewer",
                            "date_str": date_str,
                            "comment_text": clean_text or f"[{subj or annot_type_name} Markup]",
                            "annot_type": annot_type_name,
                            "has_popup_note": has_popup_note,
                            "popup_text": popup_text,
                        })

                except Exception:
                    continue

            # Check empty lines: if near an existing comment (within 75 pt in visual space), it is a pointer/arrow of that comment
            for el in empty_lines:
                el_vis = el["vis_rect"]
                near_candidate = None
                min_dist = 999999.0
                for cand in candidates:
                    d = _bbox_distance(el_vis, pymupdf.Rect(cand["x0"], cand["y0"], cand["x1"], cand["y1"]))
                    if d < min_dist:
                        min_dist = d
                        near_candidate = cand

                if near_candidate and min_dist <= 75.0:
                    # Arrow belongs to this comment; comment already captured
                    pass
                else:
                    # Isolated line or shape markup: ensure it appears!
                    candidates.append({
                        "page_num": page_num,
                        "y0": el_vis.y0,
                        "x0": el_vis.x0,
                        "y1": el_vis.y1,
                        "x1": el_vis.x1,
                        "page_width": el.get("page_width", pw),
                        "page_height": el.get("page_height", ph),
                        "author": el["author"],
                        "date_str": el["date_str"],
                        "comment_text": f"[{el['subj'] or el['type_name']} Markup]",
                        "annot_type": el["type_name"],
                        "has_popup_note": False,
                        "popup_text": "",
                    })

            raw_records.extend(candidates)

        # Sort all comments naturally by page, then visual top-to-bottom, left-to-right
        raw_records.sort(key=lambda r: (r["page_num"], r["y0"], r["x0"]))

        records: List[ExtractedComment] = []
        for idx, r in enumerate(raw_records, start=1):
            records.append(ExtractedComment(
                item_no=idx,
                page_num=r["page_num"],
                author=r["author"],
                date_str=r["date_str"],
                comment_text=r["comment_text"],
                image_bytes=None,
                image_width=0,
                image_height=0,
                render_mode="TEXT_ONLY",
                annot_type=r["annot_type"],
                has_popup_note=r["has_popup_note"],
                popup_text=r["popup_text"],
                target_y0=r["y0"],
                target_x0=r["x0"],
                target_y1=r.get("y1", r["y0"] + 25.0),
                target_x1=r.get("x1", r["x0"] + 60.0),
                page_width=r.get("page_width", 0.0),
                page_height=r.get("page_height", 0.0),
            ))

    finally:
        doc.close()

    return records
