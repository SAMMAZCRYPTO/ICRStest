"use client";

import React, { useState, useEffect, useRef } from "react";
import { PDFMarkupPreview } from "@/components/InteractiveSpreadsheetMapper";
import { MappingConfig } from "@/types/crs";

interface SplitScreenReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfFile: File | null;
  excelFile: File | null;
  markups: PDFMarkupPreview[];
  mappingConfig?: MappingConfig | null;
  onGenerateCRS: () => void;
  isProcessing: boolean;
}

export default function SplitScreenReviewModal({
  isOpen,
  onClose,
  pdfFile,
  excelFile,
  markups,
  mappingConfig,
  onGenerateCRS,
  isProcessing,
}: SplitScreenReviewModalProps) {
  const [selectedItemNo, setSelectedItemNo] = useState<number | null>(
    markups.length > 0 ? markups[0].item_no : null
  );
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [zoomScale, setZoomScale] = useState<number>(1.2);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [isRenderingPage, setIsRenderingPage] = useState<boolean>(false);
  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);

  // Initialize selected item on open
  useEffect(() => {
    if (isOpen && markups.length > 0 && selectedItemNo === null) {
      setSelectedItemNo(markups[0].item_no);
      setCurrentPage(markups[0].page_num);
    }
  }, [isOpen, markups]);

  // Load PDF.js library dynamically from CDN
  useEffect(() => {
    if (!isOpen || !pdfFile) return;

    let isMounted = true;

    const loadPdfJs = async () => {
      try {
        if (!(window as any).pdfjsLib) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
            script.onload = () => resolve();
            script.onerror = reject;
            document.head.appendChild(script);
          });
          (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        }

        const arrayBuffer = await pdfFile.arrayBuffer();
        const loadingTask = (window as any).pdfjsLib.getDocument({ data: arrayBuffer });
        const loadedDoc = await loadingTask.promise;

        if (isMounted) {
          setPdfDoc(loadedDoc);
          setTotalPages(loadedDoc.numPages);
          if (markups.length > 0) {
            setCurrentPage(markups[0].page_num || 1);
          }
        }
      } catch (err) {
        console.error("Failed to load PDF in Split Review mode:", err);
      }
    };

    loadPdfJs();

    return () => {
      isMounted = false;
    };
  }, [isOpen, pdfFile, markups]);

  // Render current PDF page on canvas
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || currentPage < 1) return;

    let renderTask: any = null;

    const renderPage = async () => {
      setIsRenderingPage(true);
      try {
        const page = await pdfDoc.getPage(currentPage);
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const viewport = page.getViewport({ scale: zoomScale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        setCanvasDimensions({ width: viewport.width, height: viewport.height });

        renderTask = page.render({ canvasContext: ctx, viewport });
        await renderTask.promise;
      } catch (err: any) {
        if (err?.name !== "RenderingCancelledException") {
          console.error("PDF render page error:", err);
        }
      } finally {
        setIsRenderingPage(false);
      }
    };

    renderPage();

    return () => {
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [pdfDoc, currentPage, zoomScale]);

  // Auto-scroll PDF container to spotlight the active markup
  useEffect(() => {
    if (!spotlightRef.current || !pdfContainerRef.current) return;

    const timer = setTimeout(() => {
      if (spotlightRef.current && pdfContainerRef.current) {
        const spotlightTop = spotlightRef.current.offsetTop;
        const spotlightLeft = spotlightRef.current.offsetLeft;
        const container = pdfContainerRef.current;

        container.scrollTo({
          top: Math.max(0, spotlightTop - container.clientHeight / 2 + 50),
          left: Math.max(0, spotlightLeft - container.clientWidth / 2 + 100),
          behavior: "smooth",
        });
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [selectedItemNo, currentPage, zoomScale, canvasDimensions]);

  // Filter markups by search term
  const filteredMarkups = markups.filter((m) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      m.item_no.toString().includes(term) ||
      m.author.toLowerCase().includes(term) ||
      m.comment_text.toLowerCase().includes(term) ||
      m.page_num.toString().includes(term)
    );
  });

  // Active selected comment object
  const activeComment = markups.find((m) => m.item_no === selectedItemNo);

  // Compute spotlight coordinates on current canvas
  const getSpotlightStyle = () => {
    if (
      !activeComment ||
      activeComment.page_num !== currentPage ||
      !activeComment.page_width ||
      !activeComment.page_height ||
      canvasDimensions.width === 0
    ) {
      return null;
    }

    const scaleX = canvasDimensions.width / activeComment.page_width;
    const scaleY = canvasDimensions.height / activeComment.page_height;

    const x0 = activeComment.target_x0 ?? 0;
    const x1 = activeComment.target_x1 ?? x0;
    const y0 = activeComment.target_y0 ?? 0;
    const y1 = activeComment.target_y1 ?? y0;

    const xMin = Math.min(x0, x1);
    const xMax = Math.max(x0, x1);
    const yMin = Math.min(y0, y1);
    const yMax = Math.max(y0, y1);

    const left = xMin * scaleX;
    const top = yMin * scaleY;
    const width = Math.max(40, (xMax - xMin) * scaleX);
    const height = Math.max(28, (yMax - yMin) * scaleY);

    return {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
    };
  };

  const spotlightStyle = getSpotlightStyle();

  const handleSelectComment = (item: PDFMarkupPreview) => {
    setSelectedItemNo(item.item_no);
    if (item.page_num !== currentPage) {
      setCurrentPage(item.page_num);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-surface-container-lowest text-on-surface select-none animate-fadeIn">
      {/* 1. TOP HEADER & WORKSPACE TOOLBAR */}
      <header className="h-16 px-6 bg-surface border-b border-outline-variant/60 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-on-primary font-bold shadow-sm">
              <span className="material-symbols-outlined text-[18px]">splitscreen</span>
            </div>
            <div>
              <h2 className="font-bold text-sm tracking-tight text-on-surface flex items-center gap-2">
                Side-by-Side Review & Verification
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed font-semibold">
                  Live Cross-Sync
                </span>
              </h2>
              <p className="text-[11px] text-on-surface-variant">
                Click any row in the Excel resolution sheet on the left to spotlight the comment in the drawing on the right.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onGenerateCRS}
            disabled={isProcessing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm hover:shadow transition-all cursor-pointer disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[17px]">
              {isProcessing ? "sync" : "download"}
            </span>
            {isProcessing ? "Generating CRS..." : "Generate & Export CRS (.xlsx)"}
          </button>

          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-semibold transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[17px]">close</span>
            Close Review
          </button>
        </div>
      </header>

      {/* 2. SPLIT VIEW MAIN CONTAINER (50% LEFT / 50% RIGHT) */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* =========================================================================
            LEFT SCREEN: EXCEL RESOLUTION SHEET (50% WIDTH)
            ========================================================================= */}
        <div className="w-full lg:w-1/2 flex flex-col border-r border-outline-variant/60 bg-surface h-full overflow-hidden">
          {/* Left Toolbar */}
          <div className="h-14 px-4 bg-surface-container-low border-b border-outline-variant/40 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-tertiary text-[20px]">table_view</span>
              <span className="font-semibold text-xs text-on-surface">
                Excel Resolution Sheet ({filteredMarkups.length} Comments)
              </span>
            </div>

            <div className="relative w-64">
              <input
                type="text"
                placeholder="Search author, text, or item #..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md bg-surface border border-outline-variant/80 text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant absolute left-2.5 top-2 pointer-events-none">
                search
              </span>
            </div>
          </div>

          {/* Left Table Content */}
          <div className="flex-1 overflow-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-surface-container-high border-b border-outline-variant font-semibold text-on-surface">
                <tr>
                  <th className="py-2.5 px-3 w-14 text-center">Item</th>
                  <th className="py-2.5 px-3 w-16 text-center">Sheet</th>
                  <th className="py-2.5 px-3 w-28">Author</th>
                  <th className="py-2.5 px-3">Extracted Review Comment</th>
                  <th className="py-2.5 px-3 w-24 text-center">Date</th>
                  <th className="py-2.5 px-3 w-12 text-center">Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30 font-sans">
                {filteredMarkups.map((m) => {
                  const isSelected = selectedItemNo === m.item_no;
                  return (
                    <tr
                      key={m.item_no}
                      onClick={() => handleSelectComment(m)}
                      className={`transition-colors cursor-pointer group ${
                        isSelected
                          ? "bg-emerald-50/80 border-l-4 border-emerald-600 font-semibold"
                          : "hover:bg-slate-50/80 border-l-4 border-transparent"
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center font-mono text-[11px] font-semibold text-on-surface">
                        <span
                          className={`inline-block px-2 py-0.5 rounded font-mono text-[11px] font-bold ${
                            isSelected
                              ? "bg-emerald-600 text-white shadow-xs"
                              : "bg-surface-container-highest text-on-surface-variant"
                          }`}
                        >
                          #{m.item_no}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center text-on-surface-variant font-mono text-[11px]">
                        Pg {m.page_num}
                      </td>
                      <td className="py-2.5 px-3 text-on-surface truncate max-w-[110px]" title={m.author}>
                        {m.author || "Reviewer"}
                      </td>
                      <td className="py-2.5 px-3 text-on-surface leading-snug whitespace-pre-wrap">
                        {m.comment_text}
                      </td>
                      <td className="py-2.5 px-3 text-center text-on-surface-variant font-mono text-[11px] whitespace-nowrap">
                        {m.date || "--"}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`material-symbols-outlined text-[18px] transition-transform ${
                            isSelected
                              ? "text-emerald-600 scale-110 font-bold"
                              : "text-slate-400 group-hover:text-emerald-600"
                          }`}
                          title="View location in drawing"
                        >
                          crop_free
                        </span>
                      </td>
                    </tr>
                  );
                })}

                {filteredMarkups.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-on-surface-variant text-xs">
                      No comments matching your search criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* =========================================================================
            RIGHT SCREEN: ENGINEERING DRAWING PDF VIEWER (50% WIDTH)
            ========================================================================= */}
        <div className="w-full lg:w-1/2 flex flex-col bg-surface-container-highest/50 h-full overflow-hidden">
          {/* Right Toolbar */}
          <div className="h-14 px-4 bg-surface-container-low border-b border-outline-variant/40 flex items-center justify-between gap-3 shrink-0">
            {/* Page navigation */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="w-7 h-7 rounded flex items-center justify-center bg-surface hover:bg-surface-container-high text-on-surface border border-outline-variant disabled:opacity-40 cursor-pointer"
                title="Previous Page"
              >
                <span className="material-symbols-outlined text-[16px]">chevron_left</span>
              </button>
              <span className="text-xs font-mono font-medium text-on-surface px-2">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="w-7 h-7 rounded flex items-center justify-center bg-surface hover:bg-surface-container-high text-on-surface border border-outline-variant disabled:opacity-40 cursor-pointer"
                title="Next Page"
              >
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              </button>
            </div>

            {/* Active Comment Info Pill */}
            {activeComment && (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-tertiary-fixed/40 border border-tertiary/20 text-on-tertiary-fixed text-[11px] truncate max-w-[260px]">
                <span className="material-symbols-outlined text-[14px] text-tertiary">my_location</span>
                <span className="font-semibold">Item #{activeComment.item_no}</span>
                <span className="truncate text-on-surface-variant font-normal">
                  ({activeComment.author}): &ldquo;{activeComment.comment_text}&rdquo;
                </span>
              </div>
            )}

            {/* Zoom Controls */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setZoomScale((z) => Math.max(0.6, z - 0.2))}
                className="w-7 h-7 rounded flex items-center justify-center bg-surface hover:bg-surface-container-high text-on-surface border border-outline-variant cursor-pointer"
                title="Zoom Out"
              >
                <span className="material-symbols-outlined text-[16px]">zoom_out</span>
              </button>
              <span className="text-[11px] font-mono text-on-surface-variant w-12 text-center">
                {Math.round(zoomScale * 100)}%
              </span>
              <button
                onClick={() => setZoomScale((z) => Math.min(2.8, z + 0.2))}
                className="w-7 h-7 rounded flex items-center justify-center bg-surface hover:bg-surface-container-high text-on-surface border border-outline-variant cursor-pointer"
                title="Zoom In"
              >
                <span className="material-symbols-outlined text-[16px]">zoom_in</span>
              </button>
              <button
                onClick={() => setZoomScale(1.2)}
                className="px-2 py-1 text-[11px] rounded bg-surface hover:bg-surface-container-high text-on-surface border border-outline-variant cursor-pointer ml-1"
                title="Reset Zoom"
              >
                Fit
              </button>
            </div>
          </div>

          {/* Right PDF Canvas Scroll Container */}
          <div
            ref={pdfContainerRef}
            className="flex-1 overflow-auto relative p-6 flex items-start justify-center bg-[#525659]/10"
          >
            {isRenderingPage && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface/40 backdrop-blur-[1px]">
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface shadow-md text-xs font-medium text-on-surface border border-outline-variant">
                  <span className="material-symbols-outlined text-[18px] text-primary animate-spin">
                    progress_activity
                  </span>
                  Rendering Drawing Sheet...
                </div>
              </div>
            )}

            <div className="relative shadow-2xl rounded bg-white">
              <canvas ref={canvasRef} className="block rounded" />

              {/* Corner Bracket Anchor UI Style on the exact markup location */}
              {spotlightStyle && (
                <div
                  ref={spotlightRef}
                  style={spotlightStyle}
                  className="absolute pointer-events-none transition-all duration-200 z-20 flex items-start justify-start border border-emerald-500/25 bg-emerald-500/[0.03]"
                >
                  {/* Top-Left 'L' Bracket */}
                  <div className="absolute -top-[3px] -left-[3px] w-4 h-4 border-t-[3px] border-l-[3px] border-emerald-600 shadow-[0_0_6px_rgba(5,150,105,0.4)]" />

                  {/* Top-Right 'L' Bracket */}
                  <div className="absolute -top-[3px] -right-[3px] w-4 h-4 border-t-[3px] border-r-[3px] border-emerald-600 shadow-[0_0_6px_rgba(5,150,105,0.4)]" />

                  {/* Bottom-Left 'L' Bracket */}
                  <div className="absolute -bottom-[3px] -left-[3px] w-4 h-4 border-b-[3px] border-l-[3px] border-emerald-600 shadow-[0_0_6px_rgba(5,150,105,0.4)]" />

                  {/* Bottom-Right 'L' Bracket */}
                  <div className="absolute -bottom-[3px] -right-[3px] w-4 h-4 border-b-[3px] border-r-[3px] border-emerald-600 shadow-[0_0_6px_rgba(5,150,105,0.4)]" />

                  {/* Floating Metadata Tag positioned cleanly outside above & left with connector stem */}
                  <div className="absolute -top-9 -left-1 pointer-events-auto">
                    <div className="relative inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-emerald-500/70 shadow-xl text-white font-mono text-[11px] font-semibold whitespace-nowrap">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Comment #{activeComment?.item_no} • {activeComment?.author || "Reviewer"}</span>
                      {activeComment?.date && (
                        <span className="text-slate-400 font-normal">({activeComment.date})</span>
                      )}
                    </div>
                    {/* Clean connector stem leading down to the top-left bracket */}
                    <div className="w-[1.5px] h-2.5 bg-emerald-600 ml-4" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
