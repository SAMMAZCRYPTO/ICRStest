"use client";

import React, { useRef, useState } from "react";
import { FileText, FileSpreadsheet, UploadCloud, X, CheckCircle } from "lucide-react";

interface FileDropzoneProps {
  label: string;
  sublabel?: string;
  accept: string;
  file: File | null;
  onFileSelect: (file: File | null) => void;
  iconType: "pdf" | "excel";
  stepNumber: string; // "1" or "2"
  extraInfo?: string;
}

export default function FileDropzone({
  label,
  sublabel,
  accept,
  file,
  onFileSelect,
  iconType,
  stepNumber,
  extraInfo,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      validateAndSet(droppedFile);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSet(e.target.files[0]);
    }
  };

  const validateAndSet = (f: File) => {
    const ext = f.name.toLowerCase();
    if (iconType === "pdf" && !ext.endsWith(".pdf")) {
      alert("Please upload a valid .pdf file.");
      return;
    }
    if (iconType === "pdf" && f.size > 500 * 1024 * 1024) {
      alert("PDF drawing package exceeds the 500MB size limit.");
      return;
    }
    if (iconType === "excel" && !ext.endsWith(".xlsx") && !ext.endsWith(".xlsm")) {
      alert("Please upload a valid .xlsx or .xlsm file.");
      return;
    }
    if (iconType === "excel" && f.size > 100 * 1024 * 1024) {
      alert("Excel template exceeds the 100MB size limit.");
      return;
    }
    onFileSelect(f);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="w-full">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleInputChange}
        className="hidden"
      />

      {!file ? (
        /* Awaiting File State */
        <div
          onClick={() => inputRef.current?.click()}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={`bg-white rounded-xl p-5 shadow-xs hover:shadow-sm transition-all border-2 border-dashed flex flex-col justify-between gap-4 min-h-[185px] cursor-pointer group ${
            isDragging
              ? "border-blue-500 bg-blue-50/20 ring-4 ring-blue-500/10 scale-[1.005]"
              : "border-slate-200 hover:border-slate-300"
          }`}
        >
          {/* Header Row: Icon, Step Badge & Title, Awaiting Status */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3.5">
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 shrink-0 ${
                  iconType === "pdf"
                    ? "bg-red-50 text-red-600 border border-red-200/80 shadow-2xs"
                    : "bg-emerald-50 text-emerald-600 border border-emerald-200/80 shadow-2xs"
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">
                  {iconType === "pdf" ? "picture_as_pdf" : "table_view"}
                </span>
              </div>
              <div className="flex flex-col text-left gap-1">
                <div className="flex items-center gap-2">
                  {/* Strict Unified Neutral Enterprise Step Badge */}
                  <span className="bg-slate-100 text-slate-700 font-semibold text-xs tracking-wider px-2 py-1 rounded">
                    STEP {stepNumber}
                  </span>
                  <span className="font-bold text-[15px] text-slate-900 tracking-tight">
                    {label}
                  </span>
                </div>
                {sublabel && (
                  <span className="text-xs text-slate-500 leading-relaxed">
                    {sublabel}
                  </span>
                )}
              </div>
            </div>

            {/* Strict Unified Pending State Badge with Pulsing Amber Dot */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold shrink-0">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
              <span>Awaiting File</span>
            </div>
          </div>

          {/* Subtle Top-Bordered Action Row */}
          <div className="-mx-5 -mb-5 px-5 py-3 border-t border-slate-100 bg-slate-50/50 rounded-b-xl flex items-center justify-between text-xs">
            <span className="font-medium text-blue-600 flex items-center gap-1.5 group-hover:text-blue-700 transition-colors">
              <span className="material-symbols-outlined text-[16px]">upload_file</span>
              Click to browse or drop {iconType === "pdf" ? ".pdf" : ".xlsx/.xlsm"}
            </span>
            <span className="font-mono text-[11px] text-slate-400">
              Max {iconType === "pdf" ? "500MB" : "100MB"} · RAM-only
            </span>
          </div>
        </div>
      ) : (
        /* Uploaded Success State */
        <div className="bg-white rounded-xl p-5 shadow-xs hover:shadow-sm transition-shadow flex flex-col justify-between gap-4 text-left border border-slate-200 min-h-[185px]">
          {/* Header Row: Icon, Step Badge & Title, Success Badge */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3.5">
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                  iconType === "pdf"
                    ? "bg-red-50 text-red-600 border border-red-200/80 shadow-2xs"
                    : "bg-emerald-50 text-emerald-600 border border-emerald-200/80 shadow-2xs"
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">
                  {iconType === "pdf" ? "picture_as_pdf" : "table_view"}
                </span>
              </div>
              <div className="flex flex-col text-left gap-1">
                <div className="flex items-center gap-2">
                  {/* Strict Unified Neutral Enterprise Step Badge */}
                  <span className="bg-slate-100 text-slate-700 font-semibold text-xs tracking-wider px-2 py-1 rounded">
                    STEP {stepNumber}
                  </span>
                  <span className="font-bold text-[15px] text-slate-900 tracking-tight">
                    {label}
                  </span>
                </div>
                {sublabel && (
                  <span className="text-xs text-slate-500 leading-relaxed">
                    {sublabel}
                  </span>
                )}
              </div>
            </div>

            {/* Strict Unified Success State Badge with Green Checkmark */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold shrink-0">
              <span className="material-symbols-outlined text-emerald-600 text-[14px]">check_circle</span>
              <span>Uploaded</span>
            </div>
          </div>

          {/* File summary in body */}
          <div className="flex items-center justify-between text-xs px-1">
            <span className="font-semibold text-slate-800 truncate max-w-[280px]">
              {file.name}
            </span>
            <span className="font-mono text-[11px] text-slate-400 shrink-0">
              {formatSize(file.size)}
            </span>
          </div>

          {/* Subtle Top-Bordered Action Row */}
          <div className="-mx-5 -mb-5 px-5 py-3 border-t border-slate-100 bg-slate-50/50 rounded-b-xl flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 text-slate-600 font-medium truncate max-w-[280px]">
              {iconType === "pdf" ? (
                <>
                  <span className="material-symbols-outlined text-[15px] text-slate-500">layers</span>
                  {extraInfo || "Comments & Markups Extracted"}
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[15px] text-slate-500">tab</span>
                  {extraInfo || "Corporate Template Active"}
                </>
              )}
            </span>

            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 hover:underline transition-colors flex items-center gap-0.5 shrink-0 cursor-pointer"
            >
              Replace {iconType === "pdf" ? "PDF" : "Excel"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
