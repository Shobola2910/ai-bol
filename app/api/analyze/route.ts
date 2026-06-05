import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const maxDuration = 60;

const PROMPT = `You are an expert at analyzing Bill of Lading (BOL) and Release Instructions documents for FMCSA freight compliance.

Find ALL dates in this document and return their positions as percentage coordinates (0-100) from top-left corner.

Return ONLY valid JSON, no other text:
{
  "dates": [
    {
      "id": 1,
      "text": "6/2/2026",
      "label": "Date",
      "x": 72,
      "y": 8,
      "w": 12,
      "h": 2.5
    }
  ],
  "docType": "Release Instructions",
  "totalDates": 2
}`;

export async function POST(req: NextRequest) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

  try {
    const body = await req.json();
    const { imageBase64, mimeType } = body;

    if (!imageBase64) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await model.generateContent([
      PROMPT,
      {
        inlineData: {
          data: imageBase64,
          mimeType: mimeType || "image/jpeg",
        },
      },
    ]);

    const content = result.response.text();

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Could not parse AI response", raw: content },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json(parsed);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
