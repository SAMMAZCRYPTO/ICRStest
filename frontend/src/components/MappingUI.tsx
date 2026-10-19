"use client";

import React, { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { MappingConfig, DetectedHeader } from "@/types/crs";
import { CheckCircle2, Layers, FileSpreadsheet, Sparkles, RefreshCw } from "lucide-react";

interface MappingUIProps {
  excelFile: File | null;
  onMappingConfirmed: (config: MappingConfig) => void;
  isProcessing: boolean;
}

const LOCAL_STORAGE_KEY = "icrs_saved_column_mapping";

const EXTRACTED_FIELDS = [
  { key: "comment_text" as const, label: "Comment Text", required: true, desc: "The textual observation or markup description." },
  { key: "snapshot" as const, label: "Snapshot Image", required: false, desc: "Leave unmapped to enable Hybrid Cell Mode (embedded with text)." },
  { key: "page_num" as const, label: "Sheet / Page Number", required: false, desc: "1-indexed drawing sheet number." },
  { key: "author" as const, label: "Reviewer / Author", required: false, desc: "Name of the person who created the annotation." },
  { key: "item_no" as const, label: "Item / Serial No", required: false, desc: "Sequential numbering for the comment items." },
  { key: "date" as const, label: "Review Date", required: false, desc: "Annotation timestamp formatted YYYY-MM-DD." },
  { key: "status" as const, label: "Resolution Status", required: false, desc: "Default 'Open' status column." },
  { key: "response" as const, label: "Contractor Response", required: false, desc: "Empty disposition column for contractor action." },
];

export default function MappingUI({
  excelFile,
  onMappingConfirmed,
  isProcessing,
}: MappingUIProps) {
  const [headers, setHeaders] = useState<DetectedHeader[]>([]);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [headerRow, setHeaderRow] = useState<number>(1);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [rawRows, setRawRows] = useState<any[][]>([]);
  const [workbookRef, setWorkbookRef] = useState<XLSX.WorkBook | null>(null);

  // Parse Excel file in the browser using SheetJS
  useEffect(() => {
    if (!excelFile) {
      setHeaders([]);
      setRawRows([]);
      setWorkbookRef(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array", sheetRows: 25 });
        setWorkbookRef(workbook);
        setSheetNames(workbook.SheetNames);

        // Find sheet that likely contains comments, or fallback to first
        const likelySheet =
          workbook.SheetNames.find((s) => {
            const low = s.toLowerCase();
            return low.includes("comment") || low.includes("crs") || low.includes("resolution") || low.includes("review");
          }) || workbook.SheetNames[0];

        setSelectedSheet(likelySheet);
        parseSheet(workbook, likelySheet);
      } catch (err) {
        console.error("SheetJS parsing error:", err);
      }
    };
    reader.readAsArrayBuffer(excelFile);
  }, [excelFile]);

  const parseSheet = (wb: XLSX.WorkBook, sheetName: string) => {
    const worksheet = wb.Sheets[sheetName];
    if (!worksheet) return;

    const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "", range: 0 });
    setRawRows(rows);

    // Auto-detect header row within first 20 rows (row with the most non-empty string cells)
    let bestRowIdx = 0;
    let maxNonEmpty = 0;

    rows.slice(0, 20).forEach((row, idx) => {
      const count = row.filter((c) => typeof c === "string" && c.trim().length > 0).length;
      if (count > maxNonEmpty) {
        maxNonEmpty = count;
        bestRowIdx = idx;
      }
    });

    const detectedHeaderRow = bestRowIdx + 1;
    setHeaderRow(detectedHeaderRow);
    extractHeadersFromRow(rows[bestRowIdx]);
  };

  const handleSheetChange = (newSheet: string) => {
    setSelectedSheet(newSheet);
    if (workbookRef) {
      parseSheet(workbookRef, newSheet);
    }
  };

  const extractHeadersFromRow = (rowCells: any[]) => {
    if (!rowCells) return;

    const detected: DetectedHeader[] = rowCells.map((val, idx) => ({
      colLetter: XLSX.utils.encode_col(idx),
      colIndex: idx + 1,
      headerText: String(val).trim() || `Column ${XLSX.utils.encode_col(idx)}`,
    }));
    setHeaders(detected);

    // Check localStorage for previously saved mappings
    let initialMapping: Record<string, string> = {};
    try {
      const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (cached) {
        initialMapping = JSON.parse(cached);
      }
    } catch (e) {
      // ignore
    }

    // Auto-match headers if not cached or incomplete
    detected.forEach((h) => {
      const low = h.headerText.toLowerCase();
      if (!initialMapping["comment_text"] && (low.includes("comment") || low.includes("remark") || low.includes("observation") || low.includes("finding"))) {
        initialMapping["comment_text"] = h.colLetter;
      }
      if (!initialMapping["snapshot"] && (low.includes("snapshot") || low.includes("visual") || low.includes("image") || low.includes("drawing reference"))) {
        initialMapping["snapshot"] = h.colLetter;
      }
      if (!initialMapping["page_num"] && (low.includes("sheet") || low.includes("page") || low.includes("dwg") || low.includes("section"))) {
        initialMapping["page_num"] = h.colLetter;
      }
      if (!initialMapping["author"] && (low.includes("author") || low.includes("reviewer") || low.includes("originator") || low.includes("by"))) {
        initialMapping["author"] = h.colLetter;
      }
      if (!initialMapping["item_no"] && (low.includes("item") || low.includes("no.") || low.includes("sr") || low.includes("id") || low === "no")) {
        initialMapping["item_no"] = h.colLetter;
      }
      if (!initialMapping["date"] && (low.includes("date") || low.includes("time"))) {
        initialMapping["date"] = h.colLetter;
      }
      if (!initialMapping["status"] && (low.includes("status") || low.includes("state"))) {
        initialMapping["status"] = h.colLetter;
      }
      if (!initialMapping["response"] && (low.includes("response") || low.includes("disposition") || low.includes("resolution") || low.includes("reply"))) {
        initialMapping["response"] = h.colLetter;
      }
    });

    setColumnMapping(initialMapping);
  };

  const handleColumnChange = (fieldKey: string, colLetter: string) => {
    const updated = { ...columnMapping, [fieldKey]: colLetter };
    if (!colLetter) {
      delete updated[fieldKey];
    }
    setColumnMapping(updated);
  };

  const handleResetToAuto = () => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    if (rawRows[headerRow - 1]) {
      extractHeadersFromRow(rawRows[headerRow - 1]);
    }
  };

  const handleConfirmAndProcess = () => {
    if (!columnMapping["comment_text"]) {
      alert("Validation Error: Please select an Excel column for 'Comment Text'.");
      return;
    }

    // Persist confirmed mapping to localStorage
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(columnMapping));
    } catch (e) {
      // ignore
    }

    const config: MappingConfig = {
      sheet_name: selectedSheet,
      header_row: headerRow,
      data_start_row: headerRow + 1,
      columns: {
        item_no: columnMapping["item_no"] || undefined,
        page_num: columnMapping["page_num"] || undefined,
        author: columnMapping["author"] || undefined,
        date: columnMapping["date"] || undefined,
        comment_text: columnMapping["comment_text"],
        snapshot: columnMapping["snapshot"] || undefined,
        status: columnMapping["status"] || undefined,
        response: columnMapping["response"] || undefined,
      },
    };

    onMappingConfirmed(config);
  };

  if (!excelFile) return null;

  const isHybridMode = !columnMapping["snapshot"];

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-7 shadow-2xl backdrop-blur-xl transition-all">
      {/* Header controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <FileSpreadsheet className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-semibold text-white">Client-Side Template Column Mapping</h3>
              <p className="text-xs text-slate-400">
                SheetJS parsed the first 20 rows of your Excel template. Map our extracted PDF fields to your columns.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {sheetNames.length > 1 && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span>Sheet:</span>
              <select
                value={selectedSheet}
                onChange={(e) => handleSheetChange(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-white text-xs"
              >
                {sheetNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span>Header Row:</span>
            <input
              type="number"
              min={1}
              max={25}
              value={headerRow}
              onChange={(e) => {
                const r = Number(e.target.value);
                setHeaderRow(r);
                if (rawRows[r - 1]) {
                  extractHeadersFromRow(rawRows[r - 1]);
                }
              }}
              className="w-14 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-white text-center text-xs"
            />
          </div>

          <button
            onClick={handleResetToAuto}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            title="Reset to auto-detection"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Hybrid Cell Mode indicator */}
      {isHybridMode ? (
        <div className="my-5 p-4 bg-amber-950/30 border border-amber-600/40 rounded-2xl flex items-start gap-3.5 text-xs text-amber-200/90 animate-fadeIn">
          <Layers className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
          <div>
            <span className="font-semibold text-amber-300">Hybrid Cell Mode Active:</span> No dedicated Snapshot column is mapped. The engine will inject <strong>BOTH</strong> the comment text and the high-resolution JPEG snapshot into the <strong>Comment Text</strong> cell, automatically adjusting row heights so markups never overlap.
          </div>
        </div>
      ) : (
        <div className="my-5 p-4 bg-blue-950/30 border border-blue-600/40 rounded-2xl flex items-start gap-3.5 text-xs text-blue-200/90 animate-fadeIn">
          <Sparkles className="w-5 h-5 shrink-0 text-blue-400 mt-0.5" />
          <div>
            <span className="font-semibold text-blue-300">Dedicated Snapshot Column Mode:</span> Snapshots will be anchored inside Column <strong>{columnMapping["snapshot"]}</strong>, and text in Column <strong>{columnMapping["comment_text"]}</strong>.
          </div>
        </div>
      )}

      {/* Grid of mapping fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-5">
        {EXTRACTED_FIELDS.map((field) => {
          const isMapped = Boolean(columnMapping[field.key]);
          return (
            <div
              key={field.key}
              className={`p-4 rounded-2xl border transition-all ${
                isMapped
                  ? "bg-slate-800/50 border-slate-700/80"
                  : field.required
                  ? "bg-red-950/10 border-red-900/30"
                  : "bg-slate-900/40 border-slate-800/80"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  {field.label}
                  {field.required && (
                    <span className="text-[10px] uppercase font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded">
                      Required
                    </span>
                  )}
                </span>
                {isMapped && (
                  <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Col {columnMapping[field.key]}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mb-2.5">{field.desc}</p>
              <select
                value={columnMapping[field.key] || ""}
                onChange={(e) => handleColumnChange(field.key, e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-xs rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              >
                <option value="">-- Do Not Map --</option>
                {headers.map((h) => (
                  <option key={h.colLetter} value={h.colLetter}>
                    Column {h.colLetter}: {h.headerText}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-between pt-5 border-t border-slate-800">
        <p className="text-xs text-slate-400">
          Settings are saved locally in your browser for future drawing reviews.
        </p>

        <button
          onClick={handleConfirmAndProcess}
          disabled={isProcessing}
          className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-medium text-xs px-6 py-3 rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-blue-500/25 cursor-pointer"
        >
          {isProcessing ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Processing In-Memory...
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              Generate Comment Resolution Sheet (.xlsx)
            </>
          )}
        </button>
      </div>
    </div>
  );
}
