import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are an expert at analyzing Bill of Lading (BOL) documents for FMCSA freight compliance.

Your job: find ALL dates in the BOL document and return them as structured JSON.

For each date found, estimate its position on the image as percentage coordinates from the top-left corner (0,0) to bottom-right (100,100).

IMPORTANT: Be precise about positions. The x,y values should represent the CENTER of the date text.

Return ONLY valid JSON, no other text:
{
  "dates": [
    {
      "id": 1,
      "text": "01/15/2024",
      "label": "Pickup Date",
      "x": 25.5,
      "y": 18.0,
      "w": 12,
      "h": 2.5
    }
  ],
  "docType": "Bill of Lading",
  "totalDates": 3
}`;

export async function POST(req: NextRequest) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  try {
    const body = await req.json();
    const { imageBase64, mimeType } = body;

    if (!imageBase64) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1500,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType || "image/jpeg"};base64,${imageBase64}`,
                detail: "high",
              },
            },
            {
              type: "text",
              text: "Analyze this BOL document. Find every date. Return JSON only.",
            },
          ],
        },
      ],
    });

    const content = response.choices[0].message.content || "";

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
