import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const maxDuration = 60;

const PROMPT = `You are an expert at analyzing Bill of Lading (BOL) and Release Instructions documents for FMCSA freight compliance.

Your task: find ALL dates in this document. Return their approximate positions as percentage coordinates (0-100) from the top-left corner of the image.

Rules:
- x, y = center of the date text (as % of image width/height)
- w = width of date text area (as % of image width)
- h = height of date text area (as % of image height)
- Include ALL dates: header dates, vessel dates, instruction dates, handwritten dates

Return ONLY valid JSON with no extra text or markdown:
{
  "dates": [
    {
      "id": 1,
      "text": "6/2/2026",
      "label": "Date",
      "x": 72,
      "y": 8,
      "w": 10,
      "h": 2
    }
  ],
  "docType": "Release Instructions",
  "totalDates": 2
}`;

export async function POST(req: NextRequest) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  try {
    const body = await req.json();
    const { imageBase64, mimeType } = body;

    if (!imageBase64) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: PROMPT },
            {
              inlineData: {
                mimeType: mimeType || "image/jpeg",
                data: imageBase64,
              },
            },
          ],
        },
      ],
      config: {
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const content = response.text ?? "";

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
