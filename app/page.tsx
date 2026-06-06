"use client";

import { useState, useRef, useCallback } from "react";

interface SingleEdit {
  oldText: string;
  newText: string;
  x: number;
  y: number;
  w: number;
  h: number;
  bold: boolean;
  bgColor?: string;
  fontFamily?: string;
}

interface EditResponse {
  understood: string;
  edits: SingleEdit[];
}

interface HistoryEntry {
  understood: string;
  edits: SingleEdit[];
}

interface ImgSize { w: number; h: number }

type Step = "upload" | "prompt" | "processing" | "done";

export default function Home() {
  const [step, setStep] = useState<Step>("upload");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState("image/jpeg");
  const [imgSize, setImgSize] = useState<ImgSize | null>(null);
  const [instruction, setInstruction] = useState("");
  const [editedDataUrl, setEditedDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const getImgSize = (dataUrl: string): Promise<ImgSize> =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.src = dataUrl;
    });

  const processFile = useCallback(async (file: File) => {
    const isImage = file.type.startsWith("image/");
    const isPDF = file.type === "application/pdf";
    if (!isImage && !isPDF) return;

    if (isImage) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        const size = await getImgSize(dataUrl);
        setEditedDataUrl(dataUrl);
        setImageBase64(dataUrl.split(",")[1]);
        setMimeType(file.type);
        setImgSize(size);
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
      setEditedDataUrl(dataUrl);
      setImageBase64(dataUrl.split(",")[1]);
      setMimeType("image/jpeg");
      setImgSize({ w: canvas.width, h: canvas.height });
      setStep("prompt");
      setHistory([]);
    }
  }, []);

  const applySingleEdit = useCallback(
    (baseDataUrl: string, edit: SingleEdit): Promise<string> => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0);

          const cx = edit.x;
          const cy = edit.y;
          const w = edit.w;
          const h = edit.h;

          let bgR = 255, bgG = 255, bgB = 255;
          try {
            const stripX = Math.max(0, Math.round(cx - w / 2 - 20));
            const stripY = Math.max(0, Math.round(cy - h / 2));
            const stripW = Math.min(15, canvas.width - stripX);
            const stripH = Math.max(1, Math.min(Math.round(h), canvas.height - stripY));
            if (stripW > 0 && stripH > 0) {
              const data = ctx.getImageData(stripX, stripY, stripW, stripH).data;
              let r = 0, g = 0, b = 0;
              const count = data.length / 4;
              for (let i = 0; i < data.length; i += 4) {
                r += data[i]; g += data[i + 1]; b += data[i + 2];
              }
              bgR = Math.round(r / count);
              bgG = Math.round(g / count);
              bgB = Math.round(b / count);
            }
          } catch {
            if (edit.bgColor) {
              const hex = edit.bgColor.replace("#", "");
              bgR = parseInt(hex.substring(0, 2), 16);
              bgG = parseInt(hex.substring(2, 4), 16);
              bgB = parseInt(hex.substring(4, 6), 16);
            }
          }

          const pad = 5;
          ctx.fillStyle = `rgb(${bgR},${bgG},${bgB})`;
          ctx.fillRect(
            Math.round(cx - w / 2 - pad),
            Math.round(cy - h / 2 - pad),
            Math.round(w + pad * 2),
            Math.round(h + pad * 2)
          );

          const family = edit.fontFamily ?? "Arial";
          const weight = edit.bold ? "bold" : "normal";
          let fontSizePx = h * 0.78;
          ctx.font = `${weight} ${fontSizePx}px "${family}", Arial, sans-serif`;
          const measured = ctx.measureText(edit.newText).width;
          if (measured > w * 0.92 && measured > 0) {
            fontSizePx = fontSizePx * (w * 0.92) / measured;
            ctx.font = `${weight} ${fontSizePx}px "${family}", Arial, sans-serif`;
          }

          ctx.fillStyle = "#111111";
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
      const currentBase64 = editedDataUrl
        ? editedDataUrl.split(",")[1]
        : imageBase64;

      let currentSize = imgSize;
      if (editedDataUrl) {
        currentSize = await getImgSize(editedDataUrl);
      }

      const res = await fetch("/api/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: currentBase64,
          mimeType,
          instruction,
          imgWidth: currentSize?.w,
          imgHeight: currentSize?.h,
        }),
      });

      const data: EditResponse & { error?: string } = await res.json();
      if (!res.ok || data.error) throw new Error((data as { error?: string }).error || "Failed");
      if (!data.edits || data.edits.length === 0) throw new Error("No edits returned");

      let workingUrl = editedDataUrl!;
      for (const edit of data.edits) {
        workingUrl = await applySingleEdit(workingUrl, edit);
      }

      setEditedDataUrl(workingUrl);
      setHistory((prev) => [...prev, { understood: data.understood, edits: data.edits }]);
      setInstruction("");
      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
      setStep("prompt");
    }
  }, [instruction, imageBase64, mimeType, editedDataUrl, imgSize, applySingleEdit]);

  const handleDownload = useCallback(() => {
    if (!editedDataUrl) return;
    const a = document.createElement("a");
    a.href = editedDataUrl;
    a.download = "BOL_corrected.jpg";
    a.click();
  }, [editedDataUrl]);

  const handleReset = useCallback(() => {
    setStep("upload");
    setImageBase64(null);
    setEditedDataUrl(null);
    setImgSize(null);
    setInstruction("");
    setHistory([]);
    setError(null);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
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

      {(step === "prompt" || step === "processing" || step === "done") && editedDataUrl && (
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden" style={{ minHeight: 0 }}>
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

          <div className="lg:w-80 flex-shrink-0 bg-white border-t lg:border-t-0 lg:border-l border-gray-200 flex flex-col">
            <div className="p-5 flex flex-col gap-4 flex-1">
              <h3 className="font-semibold text-gray-900">What to change?</h3>

              {history.length > 0 && (
                <div className="space-y-2">
                  {history.map((h, i) => (
                    <div key={i} className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm">
                      <p className="text-green-800 font-medium text-xs mb-1">
                        ✓ Applied ({h.edits.length} {h.edits.length === 1 ? "location" : "locations"})
                      </p>
                      {h.edits.map((e, j) => (
                        <p key={j} className="text-gray-600">
                          <span className="line-through text-red-400">{e.oldText}</span>
                          {" → "}
                          <span className="text-green-700 font-semibold">{e.newText}</span>
                        </p>
                      ))}
                      <p className="text-gray-400 text-xs mt-1">{h.understood}</p>
                    </div>
                  ))}
                </div>
              )}

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
                      ? 'e.g. "change the date to 06/06/2026"'
                      : 'Another change? e.g. "update date to 06/10/2026"'
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

              <div className="mt-auto pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-2">Examples:</p>
                <div className="flex flex-col gap-1.5">
                  {[
                    "change the date to 06/06/2026",
                    "change the date at the bottom to 06/01/2026",
                    "update all dates to 06/10/2026",
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
