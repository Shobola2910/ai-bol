"use client";

import { useState, useRef, useCallback } from "react";
import DocumentViewer from "@/components/DocumentViewer";
import ChatPanel from "@/components/ChatPanel";
import FileUpload from "@/components/FileUpload";

export interface DateEntry {
  id: number;
  text: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  corrected?: string;
}

export interface AnalysisResult {
  dates: DateEntry[];
  docType: string;
  totalDates: number;
}

export type AppState = "idle" | "analyzing" | "ready" | "correcting";

export default function Home() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>("image/jpeg");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [selectedDate, setSelectedDate] = useState<DateEntry | null>(null);
  const [corrections, setCorrections] = useState<Map<number, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const handleFileReady = useCallback(
    async (dataUrl: string, base64: string, mime: string) => {
      setImageDataUrl(dataUrl);
      setImageBase64(base64);
      setMimeType(mime);
      setAnalysis(null);
      setCorrections(new Map());
      setSelectedDate(null);
      setError(null);
      setAppState("analyzing");

      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, mimeType: mime }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Analysis failed");
        setAnalysis(data);
        setAppState("ready");
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to analyze document");
        setAppState("idle");
      }
    },
    []
  );

  const applyCorrection = useCallback(
    (dateId: number, newDate: string) => {
      setCorrections((prev) => {
        const next = new Map(prev);
        next.set(dateId, newDate);
        return next;
      });
      setAnalysis((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          dates: prev.dates.map((d) =>
            d.id === dateId ? { ...d, corrected: newDate } : d
          ),
        };
      });
    },
    []
  );

  const reset = useCallback(() => {
    setAppState("idle");
    setImageDataUrl(null);
    setImageBase64(null);
    setAnalysis(null);
    setCorrections(new Map());
    setSelectedDate(null);
    setError(null);
  }, []);

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-sm font-bold">
            BOL
          </div>
          <div>
            <h1 className="text-white font-semibold text-lg leading-none">
              BOL Date Corrector
            </h1>
            <p className="text-gray-400 text-xs mt-0.5">FMCSA Compliance Tool</p>
          </div>
        </div>
        {appState !== "idle" && (
          <button
            onClick={reset}
            className="text-sm text-gray-400 hover:text-white transition-colors border border-gray-700 rounded-lg px-3 py-1.5"
          >
            New Document
          </button>
        )}
      </header>

      {/* Body */}
      {appState === "idle" ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-lg">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-semibold text-white mb-2">
                Upload BOL Document
              </h2>
              <p className="text-gray-400 text-sm">
                Upload a Bill of Lading (image or PDF). The AI will find all
                dates and help you correct them.
              </p>
            </div>
            <FileUpload onFileReady={handleFileReady} />
            {error && (
              <div className="mt-4 bg-red-900/40 border border-red-700 rounded-lg p-3 text-red-300 text-sm">
                {error}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden" style={{ height: "calc(100vh - 65px)" }}>
          {/* Left: Document viewer */}
          <div className="flex-1 overflow-auto bg-gray-950 p-4">
            <DocumentViewer
              imageDataUrl={imageDataUrl!}
              dates={analysis?.dates || []}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              isAnalyzing={appState === "analyzing"}
            />
          </div>

          {/* Right: Chat panel */}
          <div className="w-96 flex-shrink-0 border-l border-gray-800 flex flex-col bg-gray-900">
            <ChatPanel
              appState={appState}
              analysis={analysis}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              onApplyCorrection={applyCorrection}
              imageDataUrl={imageDataUrl}
            />
          </div>
        </div>
      )}
    </main>
  );
}
