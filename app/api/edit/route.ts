import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  try {
    const body = await req.json();
    const { imageBase64, mimeType, instruction } = body;

    if (!imageBase64 || !instruction) {
      return NextResponse.json({ error: "Missing image or instruction" }, { status: 400 });
    }

    const prompt = `You are a precise document editor for FMCSA Bill of Lading documents.

User instruction: "${instruction}"

Carefully analyze this document and find the EXACT location of the text the user wants to change.

Rules for coordinates:
- x = horizontal CENTER of the text as % of image width (0=left edge, 100=right edge)
- y = vertical CENTER of the text as % of image height (0=top edge, 100=bottom edge)
- w = width of ONLY the text itself (not the whole cell or row) as % of image width
- h = height of the text line as % of image height
- Be very precise — 1% error = visible misalignment
- bgColor = the background color behind that text (hex, e.g. "#FFFFFF" for white, "#F0EDE8" for cream/off-white)
- fontFamily = best match: "Arial" for sans-serif printed, "Times New Roman" for serif, "Courier New" for monospaced

Return ONLY valid JSON, nothing else:
{
  "understood": "brief description of what you found and will change",
  "oldText": "exact current text in document",
  "newText": "new text to put in its place",
  "x": 72.5,
  "y": 8.3,
  "w": 8.0,
  "h": 1.5,
  "fontSize": 13,
  "bold": false,
  "bgColor": "#FFFFFF",
  "fontFamily": "Arial"
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
