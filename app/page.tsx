"use client";

import { useState, useRef, useCallback } from "react";

interface EditResult {
  understood: string;
  oldText: string;
  newText: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  bold: boolean;
  bgColor?: string;
  fontFamily?: string;
}

type Step = "upload" | "prompt" | "processing" | "done";

export default function Home() {
  const [step, setStep] = useState<Step>("upload");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState("image/jpeg");
  const [instruction, setInstruction] = useState("");
  const [result, setResult] = useState<EditResult | null>(null);
  const [editedDataUrl, setEditedDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [history, setHistory] = useState<EditResult[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    const isImage = file.type.startsWith("image/");
    const isPDF = file.type === "application/pdf";
    if (!isImage && !isPDF) return;

    if (isImage) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setImageDataUrl(dataUrl);
        setEditedDataUrl(dataUrl);
        setImageBase64(dataUrl.split(",")[1]);
        setMimeType(file.type);
        setStep("prompt");
        setHistory([]);
      };
      reader.readAsDataURL(file);
    } else {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
      const ab = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 2.5 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
      const dataUrl = canvas.toDataURL("image/jpeg", 0.97);
      setImageDataUrl(dataUrl);
      setEditedDataUrl(dataUrl);
      setImageBase64(dataUrl.split(",")[1]);
      setMimeType("image/jpeg");
      setStep("prompt");
      setHistory([]);
    }
  }, []);

  const applyEditToCanvas = useCallback(
    (baseDataUrl: string, edit: EditResult): Promise<string> => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0);

          const cx = (edit.x / 100) * canvas.width;
          const cy = (edit.y / 100) * canvas.height;
          const w = (edit.w / 100) * canvas.width;
          const h = (edit.h / 100) * canvas.height;

          // Sample actual background color from document (beats hardcoded white)
          let bgColor = edit.bgColor ?? "#FFFFFF";
          try {
            const sampleX = Math.max(0, Math.min(canvas.width - 1, Math.round(cx - w / 2 - 8)));
            const sampleY = Math.max(0, Math.min(canvas.height - 1, Math.round(cy)));
            const px = ctx.getImageData(sampleX, sampleY, 1, 1).data;
            bgColor = `rgb(${px[0]},${px[1]},${px[2]})`;
          } catch {
            // fall back to Gemini-provided or white
          }

          const pad = 4;
          ctx.fillStyle = bgColor;
          ctx.fillRect(cx - w / 2 - pad, cy - h / 2 - pad, w + pad * 2, h + pad * 2);

          // Match document font
          const fontSizePx = h * 0.78;
          const weight = edit.bold ? "bold" : "normal";
          const family = edit.fontFamily ?? "Arial";
          ctx.font = `${weight} ${fontSizePx}px "${family}", Arial, sans-serif`;
          ctx.fillStyle = "#1a1a1a";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(edit.newText, cx, cy);

          resolve(canvas.toDataURL("image/jpeg", 0.97));
        };
        img.src = baseDataUrl;
      });
    },
    []
  );

  const handleApply = useCallback(async () => {
    if (!instruction.trim() || !imageBase64) return;
    setStep("processing");
    setError(null);

    try {
      // Always send the current edited image to Gemini
      const currentBase64 = editedDataUrl
        ? editedDataUrl.split(",")[1]
        : imageBase64;

      const res = await fetch("/api/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: currentBase64,
          mimeType,
          instruction,
        }),
      });

      const data: EditResult & { error?: string } = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed");

      const newDataUrl = await applyEditToCanvas(editedDataUrl!, data);
      setEditedDataUrl(newDataUrl);
      setResult(data);
      setHistory((prev) => [...prev, data]);
      setInstruction("");
      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
      setStep("prompt");
    }
  }, [instruction, imageBase64, mimeType, editedDataUrl, applyEditToCanvas]);

  const handleDownload = useCallback(() => {
    if (!editedDataUrl) return;
    const a = document.createElement("a");
    a.href = editedDataUrl;
    a.download = "BOL_corrected.jpg";
    a.click();
  }, [editedDataUrl]);

  const handleReset = useCallback(() => {
    setStep("upload");
    setImageDataUrl(null);
    setImageBase64(null);
    setEditedDataUrl(null);
    setInstruction("");
    setResult(null);
    setHistory([]);
    setError(null);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white text-sm">
            BOL
          </div>
          <div>
            <h1 className="font-semibold text-gray-900 text-lg leading-tight">BOL Date Corrector</h1>
            <p className="text-gray-500 text-xs">FMCSA Compliance Tool</p>
          </div>
        </div>
        {step !== "upload" && (
          <button
            onClick={handleReset}
            className="text-sm text-gray-500 hover:text-gray-900 border border-gray-300 rounded-lg px-3 py-1.5 transition-colors"
          >
            New Document
          </button>
        )}
      </header>

      {/* Upload step */}
      {step === "upload" && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-md text-center">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">Upload BOL</h2>
            <p className="text-gray-500 text-sm mb-8">
              JPG, PNG or PDF — handwritten or computer generated
            </p>
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-14 cursor-pointer transition-all ${
                isDragging ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-blue-400 hover:bg-gray-50"
              }`}
            >
              <div className="text-5xl mb-4">📄</div>
              <p className="text-gray-700 font-medium">Drop file here or click to browse</p>
              <p className="text-gray-400 text-sm mt-1">JPG · PNG · PDF</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Prompt / Done steps */}
      {(step === "prompt" || step === "processing" || step === "done") && editedDataUrl && (
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden" style={{ minHeight: 0 }}>
          {/* Left: Document */}
          <div className="flex-1 overflow-auto bg-gray-100 p-4 flex flex-col items-center gap-4">
            <img
              src={editedDataUrl}
              alt="BOL Document"
              className="max-w-full rounded-lg shadow-lg border border-gray-200"
              style={{ maxHeight: "calc(100vh - 200px)" }}
            />
            {step === "done" && (
              <button
                onClick={handleDownload}
                className="bg-green-600 hover:bg-green-500 text-white font-medium px-6 py-3 rounded-xl transition-colors flex items-center gap-2 shadow"
              >
                ⬇ Download Corrected BOL
              </button>
            )}
          </div>

          {/* Right: Control panel */}
          <div className="lg:w-80 flex-shrink-0 bg-white border-t lg:border-t-0 lg:border-l border-gray-200 flex flex-col">
            <div className="p-5 flex flex-col gap-4 flex-1">
              <h3 className="font-semibold text-gray-900">What to change?</h3>

              {/* History */}
              {history.length > 0 && (
                <div className="space-y-2">
                  {history.map((h, i) => (
                    <div key={i} className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm">
                      <p className="text-green-800 font-medium text-xs mb-1">✓ Applied</p>
                      <p className="text-gray-600">
                        <span className="line-through text-red-400">{h.oldText}</span>
                        {" → "}
                        <span className="text-green-700 font-semibold">{h.newText}</span>
                      </p>
                      <p className="text-gray-400 text-xs mt-1">{h.understood}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Instruction input */}
              <div className="flex flex-col gap-2">
                <textarea
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && instruction.trim()) {
                      e.preventDefault();
                      handleApply();
                    }
                  }}
                  placeholder={
                    history.length === 0
                      ? 'e.g. "put the date 06/06/2026 on the top"'
                      : "Another change? e.g. change vessel date to 06/10/2026"
                  }
                  rows={3}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 resize-none transition-colors"
                  disabled={step === "processing"}
                />

                {error && (
                  <p className="text-red-500 text-xs">{error}</p>
                )}

                <button
                  onClick={handleApply}
                  disabled={!instruction.trim() || step === "processing"}
                  className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-medium px-4 py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {step === "processing" ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Applying...
                    </>
                  ) : (
                    "Apply Change"
                  )}
                </button>
              </div>

              {/* Examples */}
              <div className="mt-auto pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-2">Examples:</p>
                <div className="flex flex-col gap-1.5">
                  {[
                    "put the date 06/06/2026 on the top",
                    "change vessel date to 05/30/2026",
                    "update delivery date to 06/10/2026",
                  ].map((ex) => (
                    <button
                      key={ex}
                      onClick={() => setInstruction(ex)}
                      className="text-left text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg px-2 py-1.5 transition-colors"
                    >
                      "{ex}"
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
