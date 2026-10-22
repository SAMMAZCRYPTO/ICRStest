"use client";

import React, { useState, useEffect } from "react";
import FileDropzone from "@/components/FileDropzone";
import InteractiveSpreadsheetMapper, {
  PDFMarkupPreview,
} from "@/components/InteractiveSpreadsheetMapper";
import SplitScreenReviewModal from "@/components/SplitScreenReviewModal";
import { MappingConfig } from "@/types/crs";

function getBackendUrl(): string {
  if (process.env.NEXT_PUBLIC_BACKEND_URL) {
    return process.env.NEXT_PUBLIC_BACKEND_URL;
  }
  if (typeof window !== "undefined" && window.location.hostname) {
    // If accessed via standard domain (no port, or port 80/443), use same-origin relative calls
    if (!window.location.port || window.location.port === "80" || window.location.port === "443") {
      return "";
    }
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }
  return "http://localhost:8000";
}

export default function Home() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [pdfMarkupCount, setPdfMarkupCount] = useState<number | null>(null);
  const [pdfMarkups, setPdfMarkups] = useState<PDFMarkupPreview[]>([]);
  const [activeSheetName, setActiveSheetName] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSplitReviewOpen, setIsSplitReviewOpen] = useState<boolean>(false);
  const [activeMappingConfig, setActiveMappingConfig] = useState<MappingConfig | null>(null);

  // Inspect PDF when uploaded or changed
  useEffect(() => {
    if (!pdfFile) {
      setPdfMarkupCount(null);
      setPdfMarkups([]);
      return;
    }

    const inspectPdf = async () => {
      try {
        const formData = new FormData();
        formData.append("pdf_file", pdfFile);
        const res = await fetch(`${getBackendUrl()}/api/inspect-pdf`, {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          setPdfMarkupCount(data.count || 0);
          setPdfMarkups(data.previews || []);
        } else {
          setPdfMarkupCount(0);
          setPdfMarkups([]);
        }
      } catch (err) {
        console.warn("Could not inspect PDF markups in real-time:", err);
        setPdfMarkupCount(0);
        setPdfMarkups([]);
      }
    };

    inspectPdf();
  }, [pdfFile]);

  const handleProcess = async (config: MappingConfig) => {
    if (!pdfFile || !excelFile) {
      setErrorMessage("Please ensure both the PDF drawing and the Excel template are uploaded.");
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append("pdf_file", pdfFile);
      formData.append("excel_file", excelFile);
      formData.append("mapping_config", JSON.stringify(config));

      const response = await fetch(`${getBackendUrl()}/api/process`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let errorDetail = `Server processing failed (${response.status}: ${response.statusText})`;
        try {
          const text = await response.text();
          try {
            const errData = JSON.parse(text);
            errorDetail = errData.detail || text || errorDetail;
          } catch {
            if (text) errorDetail = `${errorDetail} - ${text.slice(0, 150)}`;
          }
        } catch (_) {}
        throw new Error(errorDetail);
      }

      // Extract filename from header
      const disposition = response.headers.get("content-disposition");
      let filename = "CRS_Resolved_Matrix.xlsx";
      if (disposition) {
        const filenameMatch = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, "").trim();
        }
      }
      if (!filename.toLowerCase().endsWith(".xlsx")) {
        filename = `${filename}.xlsx`;
      }

      const arrayBuffer = await response.arrayBuffer();
      const blob = new Blob([arrayBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      // Convert to Data URL (base64) to bypass browser's insecure blob:http:// download blocker on IP addresses
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = (reader.result as string) || window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          if (dataUrl.startsWith("blob:")) {
            window.URL.revokeObjectURL(dataUrl);
          }
        }, 250);
      };
      reader.readAsDataURL(blob);

    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred during processing.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-surface font-sans text-on-surface min-h-screen flex flex-col antialiased selection:bg-tertiary-fixed selection:text-on-tertiary-fixed">
      {/* =========================================================================
          1. HEADER / NAVBAR (Exact Match to design/code.html)
          ========================================================================= */}
      <header className="fixed top-0 w-full z-50 bg-surface/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-outline-variant/40">
        <div className="h-16 w-full px-margin-lg flex items-center justify-between gap-space-lg max-w-7xl mx-auto">
          <div className="flex items-center gap-space-lg">
            <div className="flex items-center gap-space-sm">
              <div className="w-8 h-8 rounded-lg bg-inverse-surface flex items-center justify-center text-inverse-on-surface font-bold text-base tracking-tight shadow-sm">
                I
              </div>
              <span className="font-bold text-base text-on-surface tracking-tight">
                ICRS Studio
              </span>
            </div>
            <div className="px-space-sm py-space-xs rounded bg-surface-container-high text-on-surface-variant font-mono text-xs">
              v2.4 Stateless
            </div>
          </div>
        </div>
      </header>

      {/* =========================================================================
          2. MAIN CONTENT AREA
          ========================================================================= */}
      <main className="w-full pt-16 flex-1 bg-surface">
        <div className="w-full px-margin-lg py-space-xl flex flex-col gap-space-2xl max-w-7xl mx-auto">
          {/* A. Hero Section Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-outline-variant/30 pb-5">
            <div className="flex flex-col gap-1.5 max-w-3xl">
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                Enterprise Document Engineering
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-on-surface tracking-tight leading-snug">
                Convert PDF Comments to Excel CRS Instantly
              </h1>
              <p className="text-sm text-on-surface-variant leading-relaxed">
                Upload your annotated PDF drawings and corporate Excel template below. Verify the auto-detected cell anchors before generating your report.
              </p>
            </div>
          </div>

          {/* B. Error Notifications */}
          {errorMessage && (
            <div className="p-4 bg-error-container/60 border border-error/40 rounded-xl flex items-center gap-3 text-xs text-on-error-container">
              <span className="material-symbols-outlined text-error text-[20px] shrink-0">
                error
              </span>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* C. Dual Upload Dock (Cards 1 & 2) */}
          <div className="flex flex-col gap-space-md">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter-lg">
              {/* Left Card: 1. Annotated PDF Drawing */}
              <FileDropzone
                stepNumber="1"
                label="Annotated PDF Drawing"
                sublabel="Upload marked-up engineering drawings with reviewer comments & callouts."
                accept=".pdf"
                file={pdfFile}
                onFileSelect={setPdfFile}
                iconType="pdf"
                extraInfo={
                  pdfMarkupCount !== null
                    ? `${pdfMarkupCount} Comments & Markups Extracted`
                    : "Comments & Markups Extracted"
                }
              />

              {/* Right Card: 2. Corporate Excel CRS Template */}
              <FileDropzone
                stepNumber="2"
                label="Corporate Excel CRS Template"
                sublabel="Upload your company's blank CRS matrix (.xlsx/.xlsm) with header row."
                accept=".xlsx,.xlsm"
                file={excelFile}
                onFileSelect={setExcelFile}
                iconType="excel"
                extraInfo={
                  activeSheetName
                    ? `Active Sheet: [${activeSheetName}]`
                    : "Active Sheet: [Sheet 1: Comment Matrix]"
                }
              />
            </div>

            {/* Helper links & Download Sample Files */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-1 text-xs text-slate-500">
              <span className="text-[11px] text-slate-400 font-medium">
                Max 500MB (PDF) · Max 100MB (Excel) · Stateless In-Memory Sandbox
              </span>
              <div className="flex items-center gap-2">
                <span className="text-slate-300 hidden sm:inline">•</span>
                <span className="font-medium text-slate-600">Need sample files?</span>
                <a
                  href="/sample_annotated_drawing.pdf"
                  download="sample_annotated_drawing.pdf"
                  className="text-blue-600 hover:text-blue-700 font-semibold inline-flex items-center gap-1 transition-colors"
                >
                  <span className="material-symbols-outlined text-[15px]">download</span>
                  Sample PDF
                </a>
                <span className="text-slate-300">•</span>
                <a
                  href="/sample_corporate_template.xlsx"
                  download="sample_corporate_template.xlsx"
                  className="text-blue-600 hover:text-blue-700 font-semibold inline-flex items-center gap-1 transition-colors"
                >
                  <span className="material-symbols-outlined text-[15px]">download</span>
                  Sample Excel
                </a>
              </div>
            </div>
          </div>

          {/* D. STEP 3: SPREADSHEET MAPPING PREVIEW */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
              <div className="flex items-center gap-2.5">
                {/* Unified Neutral Enterprise Step Badge */}
                <span className="bg-slate-100 text-slate-700 font-semibold text-xs tracking-wider px-2 py-1 rounded">
                  STEP 3
                </span>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  Spreadsheet Mapping Preview
                </h2>
              </div>
              {excelFile && (
                <span className="text-xs text-slate-500 font-medium hidden sm:inline">
                  Interactive Auto-Anchored Cell Mapper
                </span>
              )}
            </div>

            {excelFile ? (
              <InteractiveSpreadsheetMapper
                excelFile={excelFile}
                pdfFile={pdfFile}
                pdfMarkups={pdfMarkups}
                onMappingConfirmed={(cfg) => {
                  setActiveMappingConfig(cfg);
                  handleProcess(cfg);
                }}
                isProcessing={isProcessing}
                onOpenSplitReview={(cfg) => {
                  if (cfg) setActiveMappingConfig(cfg);
                  setIsSplitReviewOpen(true);
                }}
                onConfigChange={setActiveMappingConfig}
              />
            ) : (
              /* Dedicated Step 3 Preview Container (Replaces old dashed placeholder) */
              <div className="bg-white rounded-xl p-8 sm:p-12 border border-slate-200 shadow-xs text-center flex flex-col items-center justify-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
                  <span className="material-symbols-outlined text-[26px]">table_view</span>
                </div>
                <div className="flex flex-col gap-1 max-w-md">
                  <h3 className="font-bold text-sm sm:text-base text-slate-900">
                    Spreadsheet Preview & Anchor Mapping
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Upload your corporate Excel template in Step 2 above to render the live spreadsheet grid,
                    inspect auto-detected columns, and verify cell anchors before generating.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* =========================================================================
          3. FOOTER (Exact Match to design/code.html)
          ========================================================================= */}
      <footer className="w-full bg-surface-container-lowest shadow-[0_-1px_6px_rgba(0,0,0,0.02)] py-space-lg border-t border-outline-variant/40 mt-12">
        <div className="w-full px-margin-lg flex flex-col md:flex-row items-center justify-between gap-space-md text-xs text-on-surface-variant max-w-7xl mx-auto">
          <div className="flex items-center gap-space-md flex-wrap">
            <div className="flex items-center gap-space-xs">
              <span className="material-symbols-outlined text-tertiary text-[16px]">
                verified_user
              </span>
              <span className="font-semibold uppercase tracking-wider text-on-surface text-[11px]">
                ISO 27001 Compliance Verified
              </span>
            </div>
            <span className="text-outline-variant hidden sm:inline">•</span>
            <span>Volatile memory sandbox active. All buffers flushed on termination.</span>
          </div>

          <div className="flex items-center gap-space-lg">
            <span className="inline-flex items-center gap-space-xs text-on-tertiary-fixed bg-tertiary-fixed/30 px-space-sm py-space-xs rounded font-mono text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-tertiary"></span>
              Auto-Purge Ready
            </span>
            <span>© 2025 ICRS Studio Systems</span>
          </div>
        </div>
      </footer>

      {/* 4. SIDE-BY-SIDE SPLIT SCREEN REVIEW MODAL */}
      <SplitScreenReviewModal
        isOpen={isSplitReviewOpen}
        onClose={() => setIsSplitReviewOpen(false)}
        pdfFile={pdfFile}
        excelFile={excelFile}
        markups={pdfMarkups}
        mappingConfig={activeMappingConfig}
        onGenerateCRS={() => {
          if (activeMappingConfig) {
            handleProcess(activeMappingConfig);
          } else {
            handleProcess({
              sheet_name: activeSheetName || undefined,
              header_row: 10,
              data_start_row: 11,
              columns: {
                item_no: "A",
                page_num: "B",
                author: "C",
                date: "D",
                comment_text: "E",
              },
            });
          }
        }}
        isProcessing={isProcessing}
      />
    </div>
  );
}
