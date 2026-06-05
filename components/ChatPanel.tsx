"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { AppState, AnalysisResult, DateEntry } from "@/app/page";

interface Message {
  role: "assistant" | "user";
  text: string;
}

interface Props {
  appState: AppState;
  analysis: AnalysisResult | null;
  selectedDate: DateEntry | null;
  onSelectDate: (date: DateEntry | null) => void;
  onApplyCorrection: (dateId: number, newDate: string) => void;
  imageDataUrl: string | null;
}

export default function ChatPanel({
  appState,
  analysis,
  selectedDate,
  onSelectDate,
  onApplyCorrection,
  imageDataUrl,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pendingDate, setPendingDate] = useState<DateEntry | null>(null);
  const [waitingForNewDate, setWaitingForNewDate] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addMessage = useCallback((role: "assistant" | "user", text: string) => {
    setMessages((prev) => [...prev, { role, text }]);
  }, []);

  // When analysis is ready, show initial message
  useEffect(() => {
    if (appState === "analyzing") {
      setMessages([]);
      return;
    }
    if (appState === "ready" && analysis) {
      const { dates, docType } = analysis;

      if (dates.length === 0) {
        addMessage(
          "assistant",
          `I analyzed the ${docType}. I could not find any dates in this document. Please make sure the image is clear and try again.`
        );
        return;
      }

      const dateList = dates
        .map((d) => `  #${d.id}  ${d.text}  (${d.label})`)
        .join("\n");

      addMessage(
        "assistant",
        `I analyzed the ${docType} and found ${dates.length} date${dates.length > 1 ? "s" : ""}:\n\n${dateList}\n\nWhich date needs to be corrected? You can click on it in the document, or type the number (e.g. "1" or "#1").`
      );
    }
  }, [appState, analysis, addMessage]);

  // When user selects a date from canvas
  useEffect(() => {
    if (selectedDate && !waitingForNewDate) {
      setPendingDate(selectedDate);
      setWaitingForNewDate(true);
      addMessage(
        "assistant",
        `You selected: "${selectedDate.text}" (${selectedDate.label})\n\nWhat should the correct date be? Please type the new date (e.g. "01/20/2024" or "January 20, 2024").`
      );
      inputRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || !analysis) return;

    addMessage("user", text);
    setInput("");

    if (waitingForNewDate && pendingDate) {
      // User typed the new date
      const newDate = text;
      onApplyCorrection(pendingDate.id, newDate);
      setPendingDate(null);
      setWaitingForNewDate(false);
      onSelectDate(null);

      // Check if there are more uncorrected dates
      const remaining = analysis.dates.filter(
        (d) => !d.corrected && d.id !== pendingDate.id
      );

      setTimeout(() => {
        if (remaining.length > 0) {
          const remainList = remaining
            .map((d) => `  #${d.id}  ${d.text}  (${d.label})`)
            .join("\n");
          addMessage(
            "assistant",
            `✅ Done! Date #${pendingDate.id} corrected to "${newDate}".\n\nThere are still ${remaining.length} more date${remaining.length > 1 ? "s" : ""} uncorrected:\n\n${remainList}\n\nWould you like to correct another one? Click on it in the document or type the number.`
          );
        } else {
          addMessage(
            "assistant",
            `✅ Date #${pendingDate.id} corrected to "${newDate}".\n\nAll dates have been corrected! Click the "⬇ Download Corrected BOL" button above the document to save your file.`
          );
        }
      }, 300);
      return;
    }

    // User is selecting a date by number
    const numberMatch = text.match(/#?(\d+)/);
    if (numberMatch) {
      const id = parseInt(numberMatch[1]);
      const found = analysis.dates.find((d) => d.id === id);
      if (found) {
        setPendingDate(found);
        setWaitingForNewDate(true);
        onSelectDate(found);
        setTimeout(() => {
          addMessage(
            "assistant",
            `You selected: "${found.text}" (${found.label})\n\nWhat should the correct date be?`
          );
        }, 100);
        return;
      }
    }

    // Fallback: check if user mentioned a date label
    const lower = text.toLowerCase();
    const foundByLabel = analysis.dates.find(
      (d) =>
        lower.includes(d.label.toLowerCase()) ||
        lower.includes(d.text.toLowerCase())
    );
    if (foundByLabel) {
      setPendingDate(foundByLabel);
      setWaitingForNewDate(true);
      onSelectDate(foundByLabel);
      setTimeout(() => {
        addMessage(
          "assistant",
          `Found: "${foundByLabel.text}" (${foundByLabel.label})\n\nWhat should the correct date be?`
        );
      }, 100);
      return;
    }

    // Unknown input
    const dateList = analysis.dates
      .filter((d) => !d.corrected)
      .map((d) => `  #${d.id}  ${d.text}  (${d.label})`)
      .join("\n");

    setTimeout(() => {
      addMessage(
        "assistant",
        `I'm not sure which date you mean. Please type the number of the date you want to correct:\n\n${dateList}\n\nOr click directly on the date in the document on the left.`
      );
    }, 100);
  }, [
    input,
    analysis,
    waitingForNewDate,
    pendingDate,
    addMessage,
    onApplyCorrection,
    onSelectDate,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <h2 className="text-white font-medium text-sm">AI Assistant</h2>
        <p className="text-gray-500 text-xs mt-0.5">
          {appState === "analyzing"
            ? "Analyzing document..."
            : appState === "ready"
            ? waitingForNewDate
              ? "Enter the correct date"
              : "Select a date to correct"
            : ""}
        </p>
      </div>

      {/* Date chips (quick selection) */}
      {analysis && analysis.dates.length > 0 && (
        <div className="px-4 py-3 border-b border-gray-800 flex flex-wrap gap-2">
          {analysis.dates.map((date) => (
            <button
              key={date.id}
              onClick={() => {
                if (!waitingForNewDate) {
                  onSelectDate(date);
                }
              }}
              className={`
                text-xs px-2.5 py-1.5 rounded-full border transition-all
                ${
                  date.corrected
                    ? "bg-green-900/40 border-green-700 text-green-400"
                    : selectedDate?.id === date.id
                    ? "bg-blue-900/40 border-blue-500 text-blue-300"
                    : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500"
                }
              `}
            >
              {date.corrected ? `✓ ${date.corrected}` : `#${date.id} ${date.text}`}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 chat-scrollbar">
        {appState === "analyzing" && (
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center text-xs flex-shrink-0">
              AI
            </div>
            <div className="bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400 text-sm">Analyzing BOL</span>
                <span className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </span>
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex items-start gap-3 ${
              msg.role === "user" ? "flex-row-reverse" : ""
            }`}
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                msg.role === "assistant"
                  ? "bg-blue-600"
                  : "bg-gray-600"
              }`}
            >
              {msg.role === "assistant" ? "AI" : "U"}
            </div>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                msg.role === "assistant"
                  ? "bg-gray-800 text-gray-100 rounded-tl-sm"
                  : "bg-blue-600 text-white rounded-tr-sm"
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {appState === "ready" && (
        <div className="p-4 border-t border-gray-800">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                waitingForNewDate
                  ? "Enter new date (e.g. 01/20/2024)..."
                  : "Type date number or click document..."
              }
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-xl px-4 py-2.5 text-sm transition-colors"
            >
              Send
            </button>
          </div>
          {waitingForNewDate && (
            <button
              onClick={() => {
                setPendingDate(null);
                setWaitingForNewDate(false);
                onSelectDate(null);
              }}
              className="mt-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}
