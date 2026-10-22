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
        <div
          onClick={() => inputRef.current?.click()}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={`bg-surface-container-lowest rounded-xl p-space-lg shadow-sm hover:shadow-md transition-all border-2 border-dashed flex flex-col justify-between gap-space-md min-h-[175px] cursor-pointer group ${
            isDragging
              ? "border-primary bg-primary/5 ring-4 ring-primary/10 scale-[1.01]"
              : iconType === "pdf"
              ? "border-outline-variant hover:border-red-400"
              : "border-outline-variant hover:border-primary"
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-space-md">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105 ${
                  iconType === "pdf"
                    ? "bg-red-50 text-red-600 border border-red-200 shadow-sm"
                    : "bg-surface-container-high text-tertiary"
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">
                  {iconType === "pdf" ? "picture_as_pdf" : "table_view"}
                </span>
              </div>
              <div className="flex flex-col text-left">
                <span className="font-semibold text-[15px] text-on-surface">
                  {stepNumber}. {label}
                </span>
                {sublabel && (
                  <span className="text-xs text-on-surface-variant">
                    {sublabel}
                  </span>
                )}
              </div>
            </div>
            <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant text-[11px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-outline"></span>
              Awaiting File
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-on-surface-variant pt-2 border-t border-outline-variant/40">
            {/* Always retain blue color for click to browse / drop action */}
            <span className="font-medium text-primary flex items-center gap-1.5 group-hover:text-primary-hover transition-colors">
              <span className="material-symbols-outlined text-[16px]">upload_file</span>
              Click to browse or drop {iconType === "pdf" ? ".pdf" : ".xlsx/.xlsm"}
            </span>
            <span className="font-mono text-[11px] text-outline">Max {iconType === "pdf" ? "500MB" : "100MB"} · RAM-only</span>
          </div>
        </div>
      ) : (
        /* Card in Uploaded State (Exact Match to design/code.html) */
        <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between gap-space-md relative overflow-hidden text-left border border-outline-variant/50">
          <div className={`absolute top-0 left-0 w-1.5 h-full ${iconType === "pdf" ? "bg-red-500" : "bg-tertiary"}`}></div>
          
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-space-md">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  iconType === "pdf"
                    ? "bg-red-50 text-red-600 border border-red-200 shadow-sm"
                    : "bg-surface-container-high text-tertiary"
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">
                  {iconType === "pdf" ? "picture_as_pdf" : "table_view"}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-[15px] text-on-surface">
                  {stepNumber}. {label}
                </span>
                {sublabel && (
                  <span className="text-xs text-on-surface-variant">
                    {sublabel}
                  </span>
                )}
              </div>
            </div>

            <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-tertiary-fixed/40 text-on-tertiary-fixed text-[11px] font-semibold">
              <span className="material-symbols-outlined text-tertiary text-[14px]">check_circle</span>
              <span>Uploaded</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 bg-surface rounded-lg p-2.5 border border-outline-variant/40">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[13px] text-on-surface truncate max-w-[280px]">
                {file.name}
              </span>
              <span className="font-mono text-[11px] text-on-surface-variant shrink-0">
                {formatSize(file.size)}
              </span>
            </div>

            <div className="flex items-center justify-between text-on-surface-variant text-xs">
              <span className="inline-flex items-center gap-1.5 text-on-surface font-medium truncate max-w-[280px]">
                {iconType === "pdf" ? (
                  <>
                    <span className="material-symbols-outlined text-[16px] text-tertiary">layers</span>
                    {extraInfo || "PDF Drawing Package"}
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px] text-tertiary">tab</span>
                    {extraInfo || "Excel CRS Template"}
                  </>
                )}
              </span>

              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="text-[11px] font-semibold text-primary hover:underline transition-colors flex items-center gap-0.5 shrink-0 cursor-pointer"
              >
                Replace {iconType === "pdf" ? "PDF" : "Excel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
