"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { DateEntry } from "@/app/page";

interface Props {
  imageDataUrl: string;
  dates: DateEntry[];
  selectedDate: DateEntry | null;
  onSelectDate: (date: DateEntry | null) => void;
  isAnalyzing: boolean;
}

export default function DocumentViewer({
  imageDataUrl,
  dates,
  selectedDate,
  onSelectDate,
  isAnalyzing,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 1100 });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    dates.forEach((date) => {
      const x = (date.x / 100) * canvas.width;
      const y = (date.y / 100) * canvas.height;
      const w = (date.w / 100) * canvas.width;
      const h = (date.h / 100) * canvas.height;

      const isSelected = selectedDate?.id === date.id;
      const hasCorrected = Boolean(date.corrected);

      // Draw box around the date
      ctx.strokeStyle = hasCorrected
        ? "#22c55e"
        : isSelected
        ? "#3b82f6"
        : "#f59e0b";
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
      ctx.strokeRect(x - w / 2, y - h / 2, w, h);

      // Fill overlay
      if (hasCorrected) {
        // White-out the old date
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.fillRect(x - w / 2, y - h / 2, w, h);

        // Write new date
        const fontSize = Math.max(10, h * 0.65);
        ctx.fillStyle = "#166534";
        ctx.font = `bold ${fontSize}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(date.corrected!, x, y);
      } else if (isSelected) {
        ctx.fillStyle = "rgba(59,130,246,0.15)";
        ctx.fillRect(x - w / 2, y - h / 2, w, h);
      }

      // Label badge
      const labelY = y - h / 2 - 14;
      const label = date.corrected
        ? `✓ ${date.corrected}`
        : `#${date.id}`;
      const fontSize2 = 10;
      ctx.font = `${fontSize2}px sans-serif`;
      const labelW = ctx.measureText(label).width + 8;

      ctx.fillStyle = hasCorrected ? "#166534" : isSelected ? "#1d4ed8" : "#92400e";
      ctx.fillRect(x - labelW / 2, labelY - fontSize2, labelW, fontSize2 + 4);

      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(label, x, labelY - fontSize2 + 2);
    });
  }, [dates, selectedDate]);

  // Load image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const maxW = 900;
      const scale = Math.min(1, maxW / img.naturalWidth);
      setCanvasSize({
        w: img.naturalWidth * scale,
        h: img.naturalHeight * scale,
      });
    };
    img.src = imageDataUrl;
  }, [imageDataUrl]);

  // Redraw when dates/selection change
  useEffect(() => {
    draw();
  }, [draw, canvasSize]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || dates.length === 0) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const clickX = (e.clientX - rect.left) * scaleX;
      const clickY = (e.clientY - rect.top) * scaleY;

      // Find clicked date
      const clicked = dates.find((date) => {
        const x = (date.x / 100) * canvas.width;
        const y = (date.y / 100) * canvas.height;
        const w = (date.w / 100) * canvas.width;
        const h = (date.h / 100) * canvas.height;
        return (
          clickX >= x - w / 2 - 5 &&
          clickX <= x + w / 2 + 5 &&
          clickY >= y - h / 2 - 5 &&
          clickY <= y + h / 2 + 5
        );
      });

      onSelectDate(clicked || null);
    },
    [dates, onSelectDate]
  );

  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "BOL_corrected.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center justify-between w-full max-w-4xl">
        <h3 className="text-gray-400 text-sm">
          {isAnalyzing ? (
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin inline-block" />
              Analyzing document...
            </span>
          ) : (
            <span>
              {dates.length > 0
                ? `${dates.length} date${dates.length > 1 ? "s" : ""} found — click to select`
                : "Document loaded"}
            </span>
          )}
        </h3>
        {dates.some((d) => d.corrected) && (
          <button
            onClick={handleDownload}
            className="bg-green-700 hover:bg-green-600 text-white text-sm px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
            ⬇ Download Corrected BOL
          </button>
        )}
      </div>

      <div className="relative rounded-xl overflow-hidden border border-gray-800 shadow-2xl">
        {isAnalyzing && (
          <div className="absolute inset-0 bg-gray-950/70 flex items-center justify-center z-10">
            <div className="text-center">
              <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-300 text-sm">AI is analyzing your BOL...</p>
            </div>
          </div>
        )}
        <canvas
          ref={canvasRef}
          width={canvasSize.w}
          height={canvasSize.h}
          onClick={handleCanvasClick}
          className="block cursor-crosshair max-w-full"
          style={{ maxHeight: "calc(100vh - 200px)", objectFit: "contain" }}
        />
      </div>
    </div>
  );
}
