"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { MappingConfig } from "@/types/crs";

export interface PDFMarkupPreview {
  item_no: number;
  page_num: number;
  author: string;
  date: string;
  comment_text: string;
  annot_type: string;
  render_mode: string;
  target_x0?: number;
  target_y0?: number;
  target_x1?: number;
  target_y1?: number;
  page_width?: number;
  page_height?: number;
  thumbnail?: string;
}

interface InteractiveSpreadsheetMapperProps {
  excelFile: File | null;
  pdfFile: File | null;
  pdfMarkups?: PDFMarkupPreview[];
  onMappingConfirmed: (config: MappingConfig) => void;
  isProcessing: boolean;
  onActiveSheetChange?: (sheetName: string) => void;
  onOpenSplitReview?: (config?: MappingConfig) => void;
  onConfigChange?: (config: MappingConfig) => void;
}

// Available mapping roles matching corporate CRS workflows
export const SPREADSHEET_FIELDS = [
  { key: "none", label: "-- Leave Blank --", shortLabel: "Blank", icon: "⚪" },
  { key: "item_no", label: "# Item (1, 2, 3...)", shortLabel: "# Item", icon: "🔢" },
  { key: "page_num", label: "Sheet / Drawing Ref", shortLabel: "Sheet / Dwg", icon: "📄" },
  { key: "spec_clause", label: "Spec Clause", shortLabel: "Spec Clause", icon: "📑" },
  { key: "comment_text", label: "Reviewer Comment (Required)", shortLabel: "Comment", icon: "💬", required: true },
  { key: "snapshot", label: "Drawing Snippet (Text-Only Mode: Bypassed)", shortLabel: "Snippet", icon: "🖼️" },
  { key: "author", label: "Reviewer Name / Org", shortLabel: "Reviewer", icon: "👤" },
  { key: "date", label: "Markup Date", shortLabel: "Date", icon: "📅" },
  { key: "contractor_response", label: "Contractor Response", shortLabel: "Response", icon: "📝" },
  { key: "status", label: "Status Flag", shortLabel: "Status", icon: "🏷️" },
];

const LOCAL_STORAGE_KEY = "icrs_excel_mapping_prefs";

export default function InteractiveSpreadsheetMapper({
  excelFile,
  pdfFile,
  pdfMarkups = [],
  onMappingConfirmed,
  isProcessing,
  onActiveSheetChange,
  onOpenSplitReview,
  onConfigChange,
}: InteractiveSpreadsheetMapperProps) {
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [headerRowIdx, setHeaderRowIdx] = useState<number>(10); // 0-based
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({}); // fieldKey -> colLetter
  const [isGridExpanded, setIsGridExpanded] = useState<boolean>(false);
  const [showFilterConfig, setShowFilterConfig] = useState<boolean>(false);
  const [showAllRows, setShowAllRows] = useState<boolean>(true);

  // Active cell state for Formula Bar
  const [activeCell, setActiveCell] = useState<{ r: number; c: number; addr: string }>({
    r: 10,
    c: 3,
    addr: "D11",
  });

  const [viewMode, setViewMode] = useState<"template" | "preview">("preview");

  useEffect(() => {
    if (pdfMarkups && pdfMarkups.length > 0) {
      setViewMode("preview");
    }
  }, [pdfMarkups]);
  const [inspectedData, setInspectedData] = useState<{
    rows?: Array<Array<{
      r: number;
      c: number;
      addr: string;
      value: string;
      bg_color: string | null;
      font_color: string | null;
      bold: boolean;
      italic: boolean;
      align_h: string | null;
      align_v: string | null;
      wrap: boolean;
    }>>;
    merges?: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }>;
    header_row?: number;
    max_row?: number;
    max_col?: number;
    suggested_mapping?: Record<string, string>;
  } | null>(null);

  // 1. Client-Side Excel File Ingestion & Server High-Fidelity Inspection
  useEffect(() => {
    if (!excelFile) {
      setWorkbook(null);
      setSheetNames([]);
      setSelectedSheet("");
      setInspectedData(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const bytes = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(bytes, {
          type: "array",
          cellStyles: true,
          cellFormula: true,
          cellDates: true,
        });

        setWorkbook(wb);
        setSheetNames(wb.SheetNames);

        // Pick initial sheet (favor comments/crs/resolution sheet if present)
        const initialSheet =
          wb.SheetNames.find((s) => {
            const low = s.toLowerCase();
            return (
              low.includes("comment") ||
              low.includes("crs") ||
              low.includes("resolution") ||
              low.includes("review") ||
              low.includes("matrix")
            );
          }) || wb.SheetNames[0];

        setSelectedSheet(initialSheet);
        if (onActiveSheetChange) {
          onActiveSheetChange(initialSheet);
        }
        autoDetectHeadersAndMap(wb, initialSheet);
      } catch (err) {
        console.error("SheetJS parse error:", err);
      }
    };
    reader.readAsArrayBuffer(excelFile);

    // High-Fidelity openpyxl inspection from backend (extracts exact styles, background fills, fonts, merges)
    const inspectExcelBackend = async () => {
      try {
        const formData = new FormData();
        formData.append("excel_file", excelFile);
        const backendUrl =
          process.env.NEXT_PUBLIC_BACKEND_URL ||
          (typeof window !== "undefined" && window.location.hostname
            ? (!window.location.port || window.location.port === "80" || window.location.port === "443"
                ? ""
                : `${window.location.protocol}//${window.location.hostname}:8000`)
            : "http://localhost:8000");
        const res = await fetch(`${backendUrl}/api/inspect-excel`, {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          setInspectedData(data);
          if (data.header_row) {
            setHeaderRowIdx(data.header_row - 1);
          }
          if (data.suggested_mapping && Object.keys(data.suggested_mapping).length > 0) {
            setColumnMapping((prev) => ({
              ...data.suggested_mapping,
              ...prev,
            }));
          }
        }
      } catch (err) {
        console.warn("Backend inspect-excel unavailable, using SheetJS fallback:", err);
      }
    };
    inspectExcelBackend();
  }, [excelFile]);

  // 2. High-Accuracy Header Anchor Detection
  const autoDetectHeadersAndMap = (wb: XLSX.WorkBook, sName: string) => {
    const ws = wb.Sheets[sName];
    if (!ws) return;

    const range = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : { s: { r: 0, c: 0 }, e: { r: 15, c: 8 } };
    const maxR = Math.min(range.e.r, 30);
    const maxC = Math.max(range.e.c, 8);

    const headerCats = {
      item: /^(item|sr|sr\.|s\/n|sl|no|no\.|#|serial\s*no\.?)$/i,
      page: /(page|sheet|dwg|drawing|section|doc|document)/i,
      comment: /(comment|observation|remark|finding|details|description)/i,
      response: /(response|resolution|disposition|contractor|reply)/i,
      status: /(status|action|code|o\/c|closed|open)/i,
      author: /(author|reviewer|originator|by|commented\s*by|inspector|name)/i,
      date: /(date|time)/i,
    };

    let bestHeaderRow = 0;
    let maxMatchScore = -1;

    for (let r = 0; r <= maxR; r++) {
      const nonEmpty: string[] = [];

      for (let c = 0; c <= maxC; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (cell && cell.v !== undefined && cell.v !== null) {
          const val = String(cell.v).trim().toLowerCase();
          if (val) {
            nonEmpty.push(val);
          }
        }
      }

      // Avoid title banners that only span 1 text cell
      if (nonEmpty.length < 2) continue;

      const matchedCats = new Set<string>();
      let matchedCols = 0;

      for (const text of nonEmpty) {
        for (const [cat, pat] of Object.entries(headerCats)) {
          if (pat.test(text)) {
            matchedCats.add(cat);
            matchedCols++;
            break;
          }
        }
      }

      if (matchedCats.size >= 2 || matchedCats.has('comment')) {
        const score = matchedCats.size * 20 + matchedCols * 10;
        if (score > maxMatchScore) {
          maxMatchScore = score;
          bestHeaderRow = r;
        }
      }
    }

    setHeaderRowIdx(bestHeaderRow);
    runAutoMapping(ws, bestHeaderRow, maxC);

    // Set default active cell to comment column on the header row
    const defaultCommentCol = XLSX.utils.encode_col(3);
    setActiveCell({
      r: bestHeaderRow,
      c: 3,
      addr: `${defaultCommentCol}${bestHeaderRow + 1}`,
    });
  };

  // 3. Smart Column Mapping
  const runAutoMapping = (ws: XLSX.WorkSheet, headerRow: number, maxC: number) => {
    let mapping: Record<string, string> = {};

    for (let c = 0; c <= maxC; c++) {
      const addr = XLSX.utils.encode_cell({ r: headerRow, c });
      const cell = ws[addr];
      if (!cell || cell.v === undefined || cell.v === null) continue;

      const colLetter = XLSX.utils.encode_col(c);
      const strVal = String(cell.v).trim().toLowerCase();

      // Item #
      if (
        !mapping["item_no"] &&
        (strVal.includes("item") ||
          strVal.includes("sr.") ||
          strVal.includes("sr #") ||
          strVal.includes("s/n") ||
          strVal.includes("comment id") ||
          strVal.includes("sl. no") ||
          strVal === "no." ||
          strVal === "no" ||
          strVal === "id")
      ) {
        mapping["item_no"] = colLetter;
      }

      // Comment Text (Required)
      if (
        !mapping["comment_text"] &&
        (strVal.includes("observation") ||
          strVal.includes("comment") ||
          strVal.includes("remark") ||
          strVal.includes("finding") ||
          strVal.includes("details"))
      ) {
        mapping["comment_text"] = colLetter;
      }

      // Drawing Snippet / Snapshot
      if (
        !mapping["snapshot"] &&
        (strVal.includes("snapshot") ||
          strVal.includes("snippet") ||
          strVal.includes("visual") ||
          strVal.includes("image") ||
          strVal.includes("drawing reference") ||
          strVal.includes("markup reference"))
      ) {
        mapping["snapshot"] = colLetter;
      }

      // Sheet / Drawing
      if (
        !mapping["page_num"] &&
        (strVal.includes("drawing") ||
          strVal.includes("sheet") ||
          strVal.includes("dwg") ||
          strVal.includes("section") ||
          strVal.includes("page"))
      ) {
        mapping["page_num"] = colLetter;
      }

      // Reviewer Name / Author
      if (
        !mapping["author"] &&
        (strVal.includes("reviewer") ||
          strVal.includes("author") ||
          strVal.includes("originator") ||
          strVal.includes("inspector") ||
          strVal.includes("name") ||
          strVal === "by")
      ) {
        mapping["author"] = colLetter;
      }

      // Markup Date
      if (!mapping["date"] && (strVal.includes("date") || strVal.includes("time"))) {
        mapping["date"] = colLetter;
      }

      // Spec Clause
      if (!mapping["spec_clause"] && (strVal.includes("spec") || strVal.includes("clause"))) {
        mapping["spec_clause"] = colLetter;
      }

      // Contractor Response
      if (!mapping["contractor_response"] && (strVal.includes("response") || strVal.includes("disposition"))) {
        mapping["contractor_response"] = colLetter;
      }

      // Status Flag
      if (!mapping["status"] && (strVal.includes("status") || strVal.includes("action"))) {
        mapping["status"] = colLetter;
      }
    }

    setColumnMapping(mapping);
  };

  const handleSheetSwitch = (sName: string) => {
    setSelectedSheet(sName);
    if (onActiveSheetChange) {
      onActiveSheetChange(sName);
    }
    if (workbook) {
      autoDetectHeadersAndMap(workbook, sName);
    }
  };

  const assignFieldToCol = (colLetter: string, fieldKey: string) => {
    const updated = { ...columnMapping };
    if (fieldKey && fieldKey !== "none") {
      Object.keys(updated).forEach((k) => {
        if (updated[k] === colLetter) delete updated[k];
      });
      updated[fieldKey] = colLetter;
    } else {
      Object.keys(updated).forEach((k) => {
        if (updated[k] === colLetter) delete updated[k];
      });
    }
    setColumnMapping(updated);
  };

  // 4. Parse Active Sheet Metrics & Merges
  const sheetParsedData = useMemo(() => {
    if (!workbook || !selectedSheet || !workbook.Sheets[selectedSheet]) {
      return null;
    }

    const ws = workbook.Sheets[selectedSheet];
    const range = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : { s: { r: 0, c: 0 }, e: { r: 15, c: 8 } };

    const totalCols = inspectedData?.max_col ? Math.max(inspectedData.max_col, 9) : Math.max(range.e.c + 1, 9);
    const commentCount = pdfMarkups.length;
    const minRequiredRows = (headerRowIdx + 1) + (commentCount > 0 ? commentCount : 10) + 15;
    const baseRows = inspectedData?.rows ? inspectedData.rows.length : Math.max(range.e.r + 1, headerRowIdx + 12);
    const totalRows = Math.max(baseRows, minRequiredRows);

    // Build merge structures (favoring server openpyxl inspection)
    const mergeMap = new Map<string, { rowSpan: number; colSpan: number }>();
    const hiddenCells = new Set<string>();

    if (inspectedData?.merges && inspectedData.merges.length > 0) {
      inspectedData.merges.forEach((m) => {
        const startKey = `${m.s.r}_${m.s.c}`;
        mergeMap.set(startKey, {
          rowSpan: m.e.r - m.s.r + 1,
          colSpan: m.e.c - m.s.c + 1,
        });

        for (let r = m.s.r; r <= m.e.r; r++) {
          for (let c = m.s.c; c <= m.e.c; c++) {
            if (r !== m.s.r || c !== m.s.c) {
              hiddenCells.add(`${r}_${c}`);
            }
          }
        }
      });
    } else {
      const merges = ws["!merges"] || [];
      merges.forEach((m) => {
        const startKey = `${m.s.r}_${m.s.c}`;
        mergeMap.set(startKey, {
          rowSpan: m.e.r - m.s.r + 1,
          colSpan: m.e.c - m.s.c + 1,
        });

        for (let r = m.s.r; r <= m.e.r; r++) {
          for (let c = m.s.c; c <= m.e.c; c++) {
            if (r !== m.s.r || c !== m.s.c) {
              hiddenCells.add(`${r}_${c}`);
            }
          }
        }
      });
    }

    const colLetters: string[] = [];
    for (let c = 0; c < totalCols; c++) {
      colLetters.push(XLSX.utils.encode_col(c));
    }

    return {
      ws,
      totalCols,
      totalRows,
      colLetters,
      mergeMap,
      hiddenCells,
    };
  }, [workbook, selectedSheet, headerRowIdx, inspectedData, pdfMarkups]);

  // Inverted map for quick lookup: colLetter -> fieldKey
  const colToField = useMemo(() => {
    const map: Record<string, string> = {};
    Object.entries(columnMapping).forEach(([k, col]) => {
      if (col) map[col] = k;
    });
    return map;
  }, [columnMapping]);

  const mappedColumnCount = useMemo(() => {
    return Object.keys(columnMapping).filter((k) => Boolean(columnMapping[k])).length;
  }, [columnMapping]);

  // Active cell content formatted for formula bar
  const activeCellDisplay = useMemo(() => {
    if (!sheetParsedData) return { val: "", role: "" };
    const { ws } = sheetParsedData;

    let val = "";
    if (inspectedData?.rows?.[activeCell.r]?.[activeCell.c]) {
      val = inspectedData.rows[activeCell.r][activeCell.c].value || "";
    } else {
      const cell = ws[activeCell.addr];
      if (cell) {
        val = cell.f ? `=${cell.f}` : String(cell.w ?? cell.v ?? "");
      }
    }

    const colLetter = XLSX.utils.encode_col(activeCell.c);
    const assignedKey = colToField[colLetter];
    let role = "General Cell";
    if (activeCell.r === headerRowIdx) {
      role = `Header Cell (Row ${headerRowIdx + 1})`;
    } else if (activeCell.r < headerRowIdx) {
      role = "Title Block / Project Metadata";
    } else if (assignedKey) {
      const field = SPREADSHEET_FIELDS.find((f) => f.key === assignedKey);
      role = `Auto-mapped to ${field?.label || assignedKey}`;
    }

    return { val, role };
  }, [sheetParsedData, activeCell, headerRowIdx, colToField, inspectedData]);

  const getCurrentConfig = (): MappingConfig => {
    return {
      sheet_name: selectedSheet,
      header_row: headerRowIdx + 1,
      data_start_row: headerRowIdx + 2,
      columns: {
        item_no: columnMapping["item_no"] || undefined,
        page_num: columnMapping["page_num"] || undefined,
        author: columnMapping["author"] || undefined,
        date: columnMapping["date"] || undefined,
        comment_text: columnMapping["comment_text"] || "E",
        snapshot: columnMapping["snapshot"] || undefined,
      },
    };
  };

  useEffect(() => {
    if (selectedSheet && columnMapping["comment_text"]) {
      onConfigChange?.(getCurrentConfig());
    }
  }, [selectedSheet, headerRowIdx, columnMapping]);

  const handleConfirm = () => {
    if (!columnMapping["comment_text"]) {
      alert("Please map the 'Reviewer Comment' field to a column in your sheet.");
      return;
    }

    const config = getCurrentConfig();
    onMappingConfirmed(config);
  };

  const handleOpenGridInNewWindow = () => {
    const gridEl = document.getElementById("excel-grid-canvas-container");
    if (!gridEl) return;

    const newWin = window.open(
      "",
      "_blank",
      "width=1500,height=920,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes"
    );
    if (!newWin) {
      alert("Popup blocked! Please allow popups to open the full Excel grid in a new window.");
      return;
    }

    let styles = "";
    document.querySelectorAll("style, link[rel='stylesheet']").forEach((el) => {
      styles += el.outerHTML;
    });

    newWin.document.open();
    newWin.document.write(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Excel Grid - ${excelFile?.name || "CRS Matrix"}</title>
          <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
          ${styles}
          <style>
            body { margin: 0; padding: 0; background: #f8fafc; font-family: system-ui, -apple-system, sans-serif; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
            .header-bar { display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; background: #ffffff; border-bottom: 1px solid #e2e8f0; flex-shrink: 0; }
            .grid-container { flex: 1; overflow: auto; background: #ffffff; }
            table { border-collapse: collapse; width: 100%; min-width: 1300px; }
            th, td { border: 1px solid #cbd5e1; }
          </style>
        </head>
        <body>
          <div class="header-bar">
            <div style="display: flex; align-items: center; gap: 12px;">
              <span style="font-weight: 700; font-size: 15px; color: #0f172a;">📊 ${excelFile?.name || "Excel Grid"}</span>
              <span style="font-size: 12px; color: #475569; background: #f1f5f9; padding: 3px 8px; border-radius: 4px; font-family: monospace;">Sheet: ${selectedSheet}</span>
              <span style="font-size: 12px; color: #0284c7; background: #e0f2fe; padding: 3px 8px; border-radius: 4px; font-weight: 600;">Live Comments: ${pdfMarkups.length} items</span>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <button onclick="window.print()" style="background: #f1f5f9; border: 1px solid #cbd5e1; padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;">
                Print / Save PDF
              </button>
              <button onclick="window.close()" style="background: #0f172a; color: #ffffff; border: none; padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;">
                Close
              </button>
            </div>
          </div>
          <div class="grid-container">
            ${gridEl.innerHTML}
          </div>
        </body>
      </html>
    `);
    newWin.document.close();
  };

  if (!excelFile || !sheetParsedData) {
    return null;
  }

  const { ws, totalCols, totalRows, colLetters, mergeMap, hiddenCells } = sheetParsedData;
  const stagedRowCount = pdfMarkups.length > 0 ? pdfMarkups.length : 18;

  return (
    <div className="flex flex-col gap-4">
      {/* =========================================================================
          MAIN SPREADSHEET STUDIO CONTAINER
          ========================================================================= */}
      <div className="flex flex-col bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden border border-outline-variant/60">
        {/* =========================================================================
            1. CONSOLIDATED HORIZONTAL TOOLBAR HEADER
            ========================================================================= */}
        <div className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-surface-container/70 backdrop-blur-sm border-b border-outline-variant/50 gap-3">
          {/* Left: Workbook Telemetry & Detection Status */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                <span className="material-symbols-outlined text-[18px]">table_chart</span>
              </span>
              <div className="flex flex-col text-left">
                <span className="font-bold text-xs text-slate-900 truncate max-w-[220px] sm:max-w-[320px]" title={excelFile.name}>
                  {excelFile.name}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  Sheet: <strong className="text-slate-800 font-semibold">{selectedSheet}</strong>
                </span>
              </div>
            </div>

            <div className="h-5 w-px bg-outline-variant/50 hidden sm:block"></div>

            {/* Auto-Detection Status Chip */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-high border border-outline-variant/50 text-[11px] font-mono text-slate-800 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
              <span>Row {headerRowIdx + 1} Anchor</span>
              <span className="text-outline-variant">•</span>
              <span className="font-bold text-primary">{mappedColumnCount} Columns Mapped</span>
            </div>
          </div>

          {/* Right: Consolidated Controls (Segmented View Controller + Text Mode Pill) */}
          <div className="flex items-center gap-2.5">
            {/* Segmented View Mode Tabs */}
            <div className="inline-flex items-center bg-surface-container-high/80 p-0.5 rounded-lg border border-outline-variant/60 shadow-2xs">
              <button
                type="button"
                onClick={() => setViewMode("preview")}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === "preview"
                    ? "bg-surface-container-lowest text-tertiary shadow-2xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="Displays a preview of how PDF markups are injected into your template"
              >
                <span className="material-symbols-outlined text-[15px]">preview</span>
                <span>Live Preview</span>
                {pdfMarkups.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-tertiary-fixed text-on-tertiary-fixed font-bold">
                    {pdfMarkups.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setViewMode("template")}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === "template"
                    ? "bg-surface-container-lowest text-primary shadow-2xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="Displays original raw template values without markup injection"
              >
                <span className="material-symbols-outlined text-[15px]">table_view</span>
                <span>Template Format</span>
              </button>
            </div>

            {/* Text-Only Mode Badge */}
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-300 text-[11px] font-semibold select-none shadow-2xs"
              title="Extraction running in high-speed Text-Only Mode"
            >
              <span className="material-symbols-outlined text-[14px] text-emerald-700">text_fields</span>
              <span>Text-Only Mode</span>
            </div>
          </div>
        </div>

        {/* =========================================================================
            2. PRECISION FORMULA BAR (Interactive Excel Telemetry)
            ========================================================================= */}
        <div className="flex items-center px-4 py-1.5 bg-surface-container-low/70 border-b border-outline-variant/40 gap-2.5 text-xs font-mono">
          <div className="px-2.5 py-0.5 bg-surface-container-lowest border border-outline-variant/70 font-bold text-slate-800 text-center min-w-[56px] rounded shadow-2xs">
            {activeCell.addr}
          </div>
          <div className="text-outline font-bold select-none text-[13px] italic">fx</div>
          <div className="flex-1 bg-surface-container-lowest border border-outline-variant/60 px-3 py-1 text-slate-800 truncate rounded shadow-2xs text-xs font-normal">
            {activeCellDisplay.val || <span className="text-slate-400 italic">(Empty Cell)</span>}
          </div>
          <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container text-slate-700 text-[11px] border border-outline-variant/40">
            <span className="w-1.5 h-1.5 rounded-full bg-tertiary"></span>
            <span className="truncate max-w-[220px] font-medium">{activeCellDisplay.role}</span>
          </div>
        </div>

        {/* =========================================================================
            3. BOUNDED EXCEL GRID CANVAS CONTAINER
            ========================================================================= */}
        <div
          id="excel-grid-canvas-container"
          className="w-full overflow-x-auto overflow-y-auto bg-surface border-b border-outline-variant/60 select-none max-h-[520px] relative scroll-smooth"
        >
          <table className="w-full border-collapse text-xs font-sans min-w-[1250px]">
            {/* A. Excel Column Letter Bar */}
            <thead>
              <tr className="bg-surface-container-high text-slate-600 font-mono text-center border-b border-outline-variant/60 sticky top-0 z-30 h-7">
                <th className="w-12 min-w-[48px] py-1 px-1 bg-surface-container border-r border-outline-variant/60 font-semibold text-[11px] text-slate-500"></th>
                {colLetters.map((col) => (
                  <th key={col} className="min-w-[120px] py-1 px-2 border-r border-outline-variant/60 font-semibold text-[11px] text-slate-700">
                    {col}
                  </th>
                ))}
              </tr>

              {/* B. AI MAPPING PILL ROW (Interactive Overheads directly on columns) */}
              <tr className="bg-tertiary-fixed/20 border-b border-tertiary/30 sticky top-[28px] z-20 h-9">
                <td className="bg-surface-container-high text-center font-mono text-[10px] text-tertiary font-bold border-r border-outline-variant/60 py-1">
                  MAP
                </td>
                {colLetters.map((col) => {
                  const assignedKey = colToField[col];
                  const isMapped = Boolean(assignedKey && assignedKey !== "none");
                  const currentField = SPREADSHEET_FIELDS.find((f) => f.key === assignedKey);

                  return (
                    <td key={`map-${col}`} className="p-1 border-r border-tertiary/30 text-center">
                      <div
                        className={`relative rounded-md shadow-2xs px-2 py-0.5 flex items-center justify-between text-[11px] font-semibold transition-all ${
                          isMapped
                            ? "bg-white border-2 border-primary text-primary"
                            : "bg-surface-container-low border border-outline-variant/70 text-slate-700"
                        }`}
                      >
                        <select
                          value={assignedKey || "none"}
                          onChange={(e) => assignFieldToCol(col, e.target.value)}
                          className="appearance-none bg-transparent w-full text-[11px] font-semibold focus:outline-none cursor-pointer truncate pr-4.5"
                        >
                          {SPREADSHEET_FIELDS.map((f) => (
                            <option key={f.key} value={f.key} className="text-slate-900 bg-white text-left font-normal">
                              {f.label}
                            </option>
                          ))}
                        </select>
                        <span
                          className={`material-symbols-outlined text-[14px] shrink-0 pointer-events-none absolute right-1.5 ${
                            isMapped ? "text-primary" : "text-slate-400"
                          }`}
                        >
                          expand_more
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            </thead>

            {/* C. Spreadsheet Rows */}
            <tbody>
              {Array.from({ length: totalRows }).map((_, rIdx) => {
                const isHeaderRow = rIdx === headerRowIdx;
                const isTitleBlockRow = rIdx < headerRowIdx;
                const isDataRow = rIdx > headerRowIdx;

                // Row 1-10: Title Block Rendering (faithfully renders user's Excel)
                if (isTitleBlockRow) {
                  return (
                    <tr
                      key={`row-${rIdx}`}
                      className="border-b border-outline-variant/40 bg-surface-container-lowest hover:bg-surface-container-low/50 transition-colors"
                    >
                      <td className="bg-surface-container-high text-center font-mono text-[11px] text-slate-600 border-r border-outline-variant/60 py-1 font-semibold">
                        {rIdx + 1}
                      </td>

                      {colLetters.map((col, cIdx) => {
                        const cellKey = `${rIdx}_${cIdx}`;
                        if (hiddenCells.has(cellKey)) {
                          return null; // Merged into previous cell
                        }

                        const merge = mergeMap.get(cellKey);
                        const addr = XLSX.utils.encode_cell({ r: rIdx, c: cIdx });
                        const cell = ws[addr];
                        const inspectedCell = inspectedData?.rows?.[rIdx]?.[cIdx];
                        const val = inspectedCell?.value ?? (cell?.w ?? (cell?.v !== undefined ? String(cell.v) : ""));

                        const isSelected = activeCell.addr === addr;

                        const cellStyle: React.CSSProperties = {};
                        if (inspectedCell?.bg_color) cellStyle.backgroundColor = inspectedCell.bg_color;
                        if (inspectedCell?.font_color) cellStyle.color = inspectedCell.font_color;
                        if (inspectedCell?.bold) cellStyle.fontWeight = "bold";
                        if (inspectedCell?.italic) cellStyle.fontStyle = "italic";
                        if (inspectedCell?.align_h) cellStyle.textAlign = inspectedCell.align_h as any;

                        return (
                          <td
                            key={cellKey}
                            rowSpan={merge?.rowSpan}
                            colSpan={merge?.colSpan}
                            onClick={() => setActiveCell({ r: rIdx, c: cIdx, addr })}
                            style={cellStyle}
                            className={`p-2 border-r border-outline-variant/50 align-middle text-slate-800 text-xs cursor-pointer transition-colors ${
                              isSelected ? "ring-2 ring-primary ring-inset bg-blue-50/50" : ""
                            } ${merge && merge.colSpan > 2 && rIdx === 0 && !inspectedCell?.bg_color ? "font-bold text-sm bg-surface-container-low" : ""}`}
                          >
                            <div className="truncate max-w-[420px]" title={val}>
                              {val}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                }

                // Row: Detected Corporate Table Header Row
                if (isHeaderRow) {
                  return (
                    <tr
                      key={`header-row-${rIdx}`}
                      className="font-semibold text-xs border-b-2 border-primary sticky top-[64px] z-10 shadow-sm"
                    >
                      <td className="bg-slate-200 text-center font-mono text-xs text-slate-900 font-bold border-r border-outline-variant/60 py-2">
                        <div className="flex flex-col items-center justify-center leading-none">
                          <span>{rIdx + 1}</span>
                        </div>
                      </td>

                      {colLetters.map((col, cIdx) => {
                        const cellKey = `${rIdx}_${cIdx}`;
                        if (hiddenCells.has(cellKey)) return null;

                        const merge = mergeMap.get(cellKey);
                        const addr = XLSX.utils.encode_cell({ r: rIdx, c: cIdx });
                        const cell = ws[addr];
                        const inspectedCell = inspectedData?.rows?.[rIdx]?.[cIdx];
                        const val = inspectedCell?.value ?? (cell?.w ?? (cell?.v !== undefined ? String(cell.v) : ""));
                        const isSelected = activeCell.addr === addr;
                        const assignedKey = colToField[col];

                        const headerBg = inspectedCell?.bg_color || "#003ea8";
                        const headerFg = inspectedCell?.font_color || "#ffffff";

                        return (
                          <td
                            key={`hdr-${col}`}
                            rowSpan={merge?.rowSpan}
                            colSpan={merge?.colSpan}
                            onClick={() => setActiveCell({ r: rIdx, c: cIdx, addr })}
                            style={{ backgroundColor: headerBg, color: headerFg }}
                            className={`px-3 py-2 border-r border-white/20 truncate cursor-pointer transition-colors text-xs font-bold ${
                              isSelected ? "ring-2 ring-white ring-inset opacity-95" : ""
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="truncate">{val || `(Col ${col})`}</span>
                              {assignedKey && (
                                <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-tertiary-fixed text-on-tertiary-fixed shrink-0">
                                  ✓
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                }

                // Data Rows: Render Actual Template Format OR Live Markup Preview
                if (isDataRow) {
                  // Mode 1: ACTUAL TEMPLATE FORMAT
                  if (viewMode === "template") {
                    return (
                      <tr
                        key={`data-${rIdx}`}
                        className="border-b border-outline-variant/40 hover:bg-surface-container-low/50 transition-colors"
                      >
                        <td className="bg-surface-container-high text-center font-mono text-[11px] text-slate-600 border-r border-outline-variant/60 py-1.5 font-semibold">
                          {rIdx + 1}
                        </td>
                        {colLetters.map((col, cIdx) => {
                          const cellKey = `${rIdx}_${cIdx}`;
                          if (hiddenCells.has(cellKey)) return null;

                          const merge = mergeMap.get(cellKey);
                          const addr = XLSX.utils.encode_cell({ r: rIdx, c: cIdx });
                          const cell = ws[addr];
                          const inspectedCell = inspectedData?.rows?.[rIdx]?.[cIdx];
                          const val = inspectedCell?.value ?? (cell?.w ?? (cell?.v !== undefined ? String(cell.v) : ""));
                          const isSelected = activeCell.addr === addr;

                          const cellStyle: React.CSSProperties = {};
                          if (inspectedCell?.bg_color) cellStyle.backgroundColor = inspectedCell.bg_color;
                          if (inspectedCell?.font_color) cellStyle.color = inspectedCell.font_color;
                          if (inspectedCell?.bold) cellStyle.fontWeight = "bold";
                          if (inspectedCell?.italic) cellStyle.fontStyle = "italic";
                          if (inspectedCell?.align_h) cellStyle.textAlign = inspectedCell.align_h as any;

                          return (
                            <td
                              key={cellKey}
                              rowSpan={merge?.rowSpan}
                              colSpan={merge?.colSpan}
                              onClick={() => setActiveCell({ r: rIdx, c: cIdx, addr })}
                              style={cellStyle}
                              className={`p-2 border-r border-outline-variant/50 align-top text-slate-800 text-xs cursor-pointer transition-colors ${
                                isSelected ? "ring-2 ring-primary ring-inset bg-blue-50/50" : ""
                              }`}
                            >
                              <div className="truncate max-w-[420px]" title={val}>
                                {val || <span className="text-slate-300 select-none">&nbsp;</span>}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  }

                  // Mode 2: LIVE MARKUP PREVIEW
                  const relativeDataIdx = rIdx - headerRowIdx - 1;
                  const stagedList: PDFMarkupPreview[] = pdfMarkups;

                  if (stagedList.length > 0 && relativeDataIdx < stagedList.length) {
                    const markup = stagedList[relativeDataIdx];
                    const itemTag = String(markup.item_no);

                    return (
                      <tr
                        key={`preview-${rIdx}`}
                        className="border-b border-outline-variant/40 bg-white hover:bg-surface-container-low transition-colors"
                      >
                        <td className="bg-surface-container-high text-center font-mono text-[11px] text-slate-600 border-r border-outline-variant/60 py-2 font-semibold">
                          {rIdx + 1}
                        </td>

                        {colLetters.map((col, cIdx) => {
                          const addr = XLSX.utils.encode_cell({ r: rIdx, c: cIdx });
                          const assignedKey = colToField[col];
                          const isSelected = activeCell.addr === addr;
                          const cell = ws[addr];
                          const inspectedCell = inspectedData?.rows?.[rIdx]?.[cIdx];

                          let content: React.ReactNode = "";

                          if (assignedKey === "item_no") {
                            content = <span className="font-mono font-bold text-primary text-xs">{itemTag}</span>;
                          } else if (assignedKey === "page_num") {
                            content = (
                              <div className="font-mono text-xs text-center">
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 font-medium">
                                  p. {markup.page_num}
                                </span>
                              </div>
                            );
                          } else if (assignedKey === "comment_text") {
                            content = (
                              <div className="text-slate-900 leading-relaxed max-w-[550px] min-w-[280px]">
                                <span className="font-normal text-xs whitespace-pre-wrap select-text">{markup.comment_text}</span>
                              </div>
                            );
                          } else if (assignedKey === "snapshot") {
                            content = (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-100 text-zinc-700 border border-zinc-300">
                                Text-Only
                              </span>
                            );
                          } else if (assignedKey === "author") {
                            content = <span className="text-slate-800 font-semibold text-xs">{markup.author}</span>;
                          } else if (assignedKey === "date") {
                            content = <span className="font-mono text-xs text-slate-600 font-medium">{markup.date}</span>;
                          } else if (assignedKey === "contractor_response") {
                            content = (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-300">
                                Pending Response
                              </span>
                            );
                          } else if (assignedKey === "status") {
                            content = (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-300">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                                OPEN
                              </span>
                            );
                          } else {
                            // Render real cell from user's Excel template
                            content = inspectedCell?.value ?? (cell?.w ?? (cell?.v !== undefined ? String(cell.v) : ""));
                          }

                          return (
                            <td
                              key={addr}
                              onClick={() => setActiveCell({ r: rIdx, c: cIdx, addr })}
                              className={`px-3 py-2 border-r border-outline-variant/60 align-top text-slate-800 text-xs cursor-pointer ${
                                isSelected ? "ring-2 ring-primary ring-inset bg-blue-50/50" : ""
                              }`}
                            >
                              {content}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  }

                  // Beyond staged rows in preview mode: show shifted footer cells if available
                  const templateDataStart = headerRowIdx + 1;
                  const origRowIdx = templateDataStart + (relativeDataIdx - stagedList.length);
                  const hasTemplateRow = Boolean(inspectedData?.rows && origRowIdx < inspectedData.rows.length);
                  const sourceRowIdx = (stagedList.length > 0 && hasTemplateRow) ? origRowIdx : rIdx;

                  return (
                    <tr
                      key={`template-rest-${rIdx}`}
                      className="border-b border-outline-variant/40 hover:bg-surface-container-low/50 transition-colors"
                    >
                      <td className="bg-surface-container-high text-center font-mono text-[11px] text-slate-600 border-r border-outline-variant/60 py-1.5 font-semibold">
                        {rIdx + 1}
                      </td>
                      {colLetters.map((col, cIdx) => {
                        const cellKey = `${sourceRowIdx}_${cIdx}`;
                        if (hiddenCells.has(cellKey)) return null;

                        const merge = mergeMap.get(cellKey);
                        const addr = XLSX.utils.encode_cell({ r: sourceRowIdx, c: cIdx });
                        const cell = ws[addr];
                        const inspectedCell = inspectedData?.rows?.[sourceRowIdx]?.[cIdx];
                        const val = inspectedCell?.value ?? (cell?.w ?? (cell?.v !== undefined ? String(cell.v) : ""));
                        const isSelected = activeCell.addr === addr;

                        const cellStyle: React.CSSProperties = {};
                        if (inspectedCell?.bg_color) cellStyle.backgroundColor = inspectedCell.bg_color;
                        if (inspectedCell?.font_color) cellStyle.color = inspectedCell.font_color;
                        if (inspectedCell?.bold) cellStyle.fontWeight = "bold";
                        if (inspectedCell?.italic) cellStyle.fontStyle = "italic";
                        if (inspectedCell?.align_h) cellStyle.textAlign = inspectedCell.align_h as any;

                        return (
                          <td
                            key={cellKey}
                            rowSpan={merge?.rowSpan}
                            colSpan={merge?.colSpan}
                            onClick={() => setActiveCell({ r: sourceRowIdx, c: cIdx, addr })}
                            style={cellStyle}
                            className={`p-2 border-r border-outline-variant/50 align-top text-slate-800 text-xs cursor-pointer transition-colors ${
                              isSelected ? "ring-2 ring-primary ring-inset bg-blue-50/50" : ""
                            }`}
                          >
                            <div className="truncate max-w-[420px]" title={val}>
                              {val || <span className="text-slate-300 select-none">&nbsp;</span>}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                }

                return null;
              })}
            </tbody>
          </table>
        </div>

        {/* =========================================================================
            4. AUTHENTIC EXCEL SHEET NAVIGATION BAR (Sheet tabs at bottom)
            ========================================================================= */}
        <div className="px-4 py-2 bg-surface-container-high/90 flex flex-wrap items-center justify-between text-on-surface-variant font-mono text-xs border-t border-outline-variant/60 gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
            <div className="flex items-center bg-surface-container-lowest rounded-md border border-outline-variant/60 p-0.5 shadow-2xs">
              <button
                type="button"
                className="w-6 h-6 flex items-center justify-center hover:bg-surface-container-high rounded text-slate-700 transition-colors cursor-pointer"
                title="First Sheet"
              >
                <span className="material-symbols-outlined text-[16px]">first_page</span>
              </button>
              <button
                type="button"
                className="w-6 h-6 flex items-center justify-center hover:bg-surface-container-high rounded text-slate-700 transition-colors cursor-pointer"
                title="Previous Sheet"
              >
                <span className="material-symbols-outlined text-[16px]">chevron_left</span>
              </button>
              <button
                type="button"
                className="w-6 h-6 flex items-center justify-center hover:bg-surface-container-high rounded text-slate-700 transition-colors cursor-pointer"
                title="Next Sheet"
              >
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              </button>
              <button
                type="button"
                className="w-6 h-6 flex items-center justify-center hover:bg-surface-container-high rounded text-slate-700 transition-colors cursor-pointer"
                title="Last Sheet"
              >
                <span className="material-symbols-outlined text-[16px]">last_page</span>
              </button>
            </div>

            <div className="h-5 w-px bg-outline-variant/60 mx-1"></div>

            {sheetNames.map((s) => {
              const isActive = s === selectedSheet;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSheetSwitch(s)}
                  className={`px-3 py-1.5 rounded-t-md flex items-center gap-1.5 transition-colors cursor-pointer text-xs font-semibold ${
                    isActive
                      ? "bg-surface-container-lowest text-primary shadow-xs border-t-2 border-primary"
                      : "hover:bg-surface-container text-slate-600 bg-surface-container-low/60"
                  }`}
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {isActive ? "grid_on" : "article"}
                  </span>
                  <span>{s}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 text-[11px] flex-wrap">
            <span className="font-medium text-slate-700">
              <strong className="font-bold text-slate-900">Row {headerRowIdx + 1}:</strong> Header Anchor
            </span>
            <span className="text-outline-variant">•</span>
            <span className="text-slate-700">
              <strong className="font-bold text-slate-900">{stagedRowCount} Rows</strong> Staged
            </span>
            <span className="text-outline-variant">•</span>
            <span className="text-tertiary font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-tertiary"></span>
              100% In-Memory Parsing
            </span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          5. STEP 4: ELEVATED BOTTOM ACTION RIBBON
          ========================================================================= */}
      <div className="w-full bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="bg-slate-100 text-slate-700 font-semibold text-xs tracking-wider px-2 py-1 rounded shrink-0">
            STEP 4
          </span>
          <div className="flex flex-col text-left">
            <span className="font-bold text-sm text-slate-900">
              Generate Resolution Sheet
            </span>
            <span className="text-xs text-slate-500">
              Locked title blocks, formula chains, and formatting 100% preserved.
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <button
            type="button"
            onClick={() => autoDetectHeadersAndMap(workbook!, selectedSheet)}
            className="px-4 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
          >
            Modify Mappings
          </button>

          {onOpenSplitReview && (
            <button
              type="button"
              onClick={() => onOpenSplitReview?.(getCurrentConfig())}
              className="px-4 py-2.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 font-semibold text-xs transition-all flex items-center gap-1.5 cursor-pointer"
              title="Open side-by-side split screen linking Excel comments to the PDF drawing"
            >
              <span className="material-symbols-outlined text-[17px]">splitscreen</span>
              <span>Review</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleConfirm}
            disabled={isProcessing}
            className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs tracking-wide transition-all shadow-sm hover:shadow flex items-center gap-2 group cursor-pointer disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <span className="material-symbols-outlined text-[18px] animate-spin">refresh</span>
                <span>Generating Resolution Sheet...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">bolt</span>
                <span>Generate Resolution Sheet</span>
                <span className="material-symbols-outlined text-[18px] transition-transform group-hover:translate-x-1">
                  arrow_forward
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
