"use client";

import { useCallback, useRef, useState } from "react";

interface Props {
  onFileReady: (dataUrl: string, base64: string, mime: string) => void;
}

export default function FileUpload({ onFileReady }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    async (file: File) => {
      if (!file) return;

      const isImage = file.type.startsWith("image/");
      const isPDF = file.type === "application/pdf";

      if (!isImage && !isPDF) {
        alert("Please upload an image (JPG, PNG) or PDF file.");
        return;
      }

      setIsProcessing(true);

      try {
        if (isImage) {
          const reader = new FileReader();
          reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            const base64 = dataUrl.split(",")[1];
            onFileReady(dataUrl, base64, file.type);
            setIsProcessing(false);
          };
          reader.readAsDataURL(file);
        } else {
          // PDF: use PDF.js to render first page to canvas
          await renderPDFToImage(file, onFileReady);
          setIsProcessing(false);
        }
      } catch {
        alert("Failed to process file. Please try again.");
        setIsProcessing(false);
      }
    },
    [onFileReady]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`
        border-2 border-dashed rounded-2xl p-12 cursor-pointer text-center transition-all
        ${isDragging
          ? "border-blue-500 bg-blue-500/10"
          : "border-gray-700 hover:border-gray-500 bg-gray-900/50 hover:bg-gray-900"
        }
        ${isProcessing ? "pointer-events-none opacity-60" : ""}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={handleChange}
      />

      {isProcessing ? (
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Processing document...</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-gray-800 rounded-2xl flex items-center justify-center text-3xl">
            📄
          </div>
          <div>
            <p className="text-white font-medium mb-1">
              Drop your BOL here or click to browse
            </p>
            <p className="text-gray-500 text-sm">
              Supports JPG, PNG, PDF (handwritten or computer-generated)
            </p>
          </div>
          <div className="flex gap-2">
            {["JPG", "PNG", "PDF"].map((ext) => (
              <span
                key={ext}
                className="bg-gray-800 text-gray-400 text-xs px-2 py-1 rounded"
              >
                {ext}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

async function renderPDFToImage(
  file: File,
  onFileReady: (dataUrl: string, base64: string, mime: string) => void
) {
  // Dynamic import to avoid SSR issues
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);

  const scale = 2.0;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const ctx = canvas.getContext("2d")!;
  await page.render({ canvasContext: ctx, viewport }).promise;

  const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
  const base64 = dataUrl.split(",")[1];
  onFileReady(dataUrl, base64, "image/jpeg");
}
