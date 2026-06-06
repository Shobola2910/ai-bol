import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  try {
    const body = await req.json();
    const { imageBase64, mimeType, instruction, imgWidth, imgHeight } = body;

    if (!imageBase64 || !instruction) {
      return NextResponse.json({ error: "Missing image or instruction" }, { status: 400 });
    }

    const sizeInfo = imgWidth && imgHeight
      ? `The image is exactly ${imgWidth} x ${imgHeight} pixels.`
      : "";

    const prompt = `You are a precise document image editor for FMCSA Bill of Lading documents.

User instruction: "${instruction}"

${sizeInfo}

CRITICAL RULES:
1. Find ALL locations where the requested field appears (e.g. if a date appears twice at the bottom, return BOTH).
2. Preserve ALL surrounding formatting — if the text has asterisks like **06.02.2026** or stars/dots, include them in newText too.
3. Return pixel coordinates (not percentages). x, y = center of the text in pixels. w, h = size of the text area in pixels.
4. bgColor = hex background color of that area (e.g. "#FFFFFF").
5. fontFamily = "Arial" for sans-serif, "Times New Roman" for serif, "Courier New" for monospace.
6. bold = true if the text appears bold/thick.

Return ONLY valid JSON with an "edits" array (can have 1 or more items):
{
  "understood": "brief description of what you found",
  "edits": [
    {
      "oldText": "exact text currently shown (including ** or other formatting)",
      "newText": "new text with same formatting preserved (e.g. **06.01.2026**)",
      "x": 210,
      "y": 1820,
      "w": 280,
      "h": 42,
      "bold": true,
      "bgColor": "#FFFFFF",
      "fontFamily": "Arial"
    }
  ]
}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { mimeType: mimeType || "image/jpeg", data: imageBase64 } },
          ],
        },
      ],
      config: { thinkingConfig: { thinkingBudget: 0 } },
    });

    const content = response.text ?? "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Could not parse response", raw: content }, { status: 500 });
    }

    return NextResponse.json(JSON.parse(jsonMatch[0]));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
