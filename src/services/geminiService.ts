import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export interface ModerationResult {
  status: 'published' | 'flagged' | 'blocked';
  reason?: string;
  tags?: string[];
}

export async function moderateContent(content: string): Promise<ModerationResult> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Moderate the following anonymous confession and extract 3-5 keywords/tags for matching similar posts.
    Check for:
    1. Banned words (hate speech, slurs).
    2. Personal data (emails, phone numbers, addresses).
    3. Harmful content (self-harm, violence, illegal acts).
    
    Output JSON with:
    - status: "published" (safe), "flagged" (suspicious/needs review), or "blocked" (harmful).
    - reason: A short explanation if not published.
    - tags: Array of 3-5 lowercase keywords representing the core themes/emotions.
    
    Confession: "${content}"`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          status: { type: Type.STRING, enum: ["published", "flagged", "blocked"] },
          reason: { type: Type.STRING },
          tags: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: "3-5 lowercase keywords for matching"
          }
        },
        required: ["status", "tags"]
      }
    }
  });

  try {
    const text = response.text || "{}";
    return JSON.parse(text);
  } catch (e) {
    return { status: 'flagged', reason: 'Moderation error' };
  }
}

export async function generateFakeConfession(realConfession: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Generate a fake, but highly believable anonymous confession. 
    It should be similar in tone, length, and theme to the following real confession, but describing a completely different (fictional) situation.
    Make it sound human, slightly messy, and emotionally resonant.
    
    Real Confession for reference: "${realConfession}"
    
    Output ONLY the fake confession text.`,
  });

  return response.text?.trim() || "I once accidentally sent a screenshot of a conversation to the person I was talking about. I still haven't recovered.";
}
