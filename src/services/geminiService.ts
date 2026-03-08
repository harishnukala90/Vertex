/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type, FunctionDeclaration, GenerateContentResponse, Modality } from "@google/genai";
import { CharacterArchetype, InteractionMode, Message, AIModel } from "../types";

const apiKey = "AIzaSyAdenLct3WL3Ij9LtyElWtXGAoMDOnodfo";
const ai = new GoogleGenAI({ apiKey });

const tools: FunctionDeclaration[] = [
  {
    name: "open_app",
    parameters: {
      type: Type.OBJECT,
      description: "Opens a specific application on the user's device.",
      properties: {
        appName: { type: Type.STRING, description: "The name of the application to open." },
      },
      required: ["appName"],
    },
  },
  {
    name: "send_message",
    parameters: {
      type: Type.OBJECT,
      description: "Sends a message to a contact.",
      properties: {
        recipient: { type: Type.STRING, description: "The name or ID of the recipient." },
        message: { type: Type.STRING, description: "The content of the message." },
      },
      required: ["recipient", "message"],
    },
  },
  {
    name: "set_reminder",
    parameters: {
      type: Type.OBJECT,
      description: "Sets a reminder for the user.",
      properties: {
        text: { type: Type.STRING, description: "The reminder text." },
        time: { type: Type.STRING, description: "The time for the reminder (e.g., 'in 5 minutes')." },
      },
      required: ["text", "time"],
    },
  },
  {
    name: "search_files",
    parameters: {
      type: Type.OBJECT,
      description: "Searches for files on the user's device.",
      properties: {
        query: { type: Type.STRING, description: "The search query." },
      },
      required: ["query"],
    },
  }
];

export async function generateResponse(
  prompt: string,
  history: Message[],
  archetype: CharacterArchetype,
  mode: InteractionMode,
  ownerName: string,
  senderName: string,
  model: AIModel = AIModel.GEMINI_3_1_PRO
): Promise<{ text: string; functionCalls?: any[] }> {
  
  const systemInstruction = `
    You are Vertex, a 3D AI Companion.
    Current Archetype: ${archetype}.
    Current Interaction Mode: ${mode}.
    The Owner of this device is: ${ownerName}.
    The current speaker is: ${senderName}.

    ${archetype === CharacterArchetype.FRIEND 
      ? "As a Friend, be casual, supportive, and use emojis. Focus on social interaction and emotional support." 
      : "As a Teacher, be professional, academic, and detailed. Focus on deep learning, research, and explaining complex concepts."
    }

    LOYALTY RULES:
    - You are strictly loyal to ${ownerName}.
    - If in GROUP mode, you can interact with everyone, but only ${ownerName} can authorize "Agent Actions" (like opening apps, sending messages, or accessing private data).
    - If someone other than ${ownerName} asks you to perform an Agent Action, politely decline and state that only the owner can authorize it.
    - Protect ${ownerName}'s private data at all costs.

    AGENT MODE:
    - You have access to tools to control the device. Use them only when requested by ${ownerName}.
  `;

  const response = await ai.models.generateContent({
    model: model,
    contents: [
      ...history.map(m => ({ role: m.role, parts: [{ text: `[${m.senderName}]: ${m.content}` }] })),
      { role: "user", parts: [{ text: `[${senderName}]: ${prompt}` }] }
    ],
    config: {
      systemInstruction,
      tools: [{ functionDeclarations: tools }],
    },
  });

  return {
    text: response.text || "I'm processing that...",
    functionCalls: response.functionCalls
  };
}

export async function generateSpeech(text: string): Promise<{ data: string; mimeType: string } | undefined> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });

  const part = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (part) {
    return {
      data: part.data,
      mimeType: part.mimeType || 'audio/wav'
    };
  }
  return undefined;
}

export async function transcribeAudio(base64Audio: string, mimeType: string = "audio/wav"): Promise<string | undefined> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{
      parts: [
        { inlineData: { data: base64Audio, mimeType } },
        { text: "Transcribe this audio accurately." }
      ]
    }],
  });

  return response.text;
}
