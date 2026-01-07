
import { GoogleGenAI } from "@google/genai";

export interface AddressCandidate {
  address: string;
  lat: number;
  lng: number;
}

// Helper para obter a chave de forma segura
const getApiKey = (): string | undefined => {
  try {
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
      return process.env.API_KEY;
    }
  } catch (e) {
    console.warn("Erro ao acessar variáveis de ambiente");
  }
  return undefined;
};

export const extractAddressFromImage = async (base64Image: string) => {
  const apiKey = getApiKey();
  if (!apiKey) return null;
  
  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Image,
            },
          },
          {
            text: "Extraia o endereço desta imagem. Retorne APENAS o texto do endereço.",
          },
        ],
      },
    });
    return response.text;
  } catch (error) {
    console.error("Erro OCR:", error);
    return null;
  }
};

export const searchAddresses = async (query: string, contextAddress?: string): Promise<AddressCandidate[]> => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API_KEY_MISSING");

  const ai = new GoogleGenAI({ apiKey });

  try {
    const prompt = `Localize no Google Maps: "${query}". ${contextAddress ? `Perto de: ${contextAddress}.` : ""} Forneça endereço oficial e coordenadas. Responda APENAS:
1. [Endereço], LAT: [valor], LNG: [valor]`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
      },
    });

    const text = response.text || "";
    const candidates: AddressCandidate[] = [];
    const lines = text.split('\n');

    lines.forEach(line => {
      const latMatch = line.match(/LAT:\s*(-?\d+\.\d+)/i);
      const lngMatch = line.match(/LNG:\s*(-?\d+\.\d+)/i);
      const addressPart = line.split(/,?\s*LAT:/i)[0].replace(/^\d+\.\s*/, '').trim();

      if (latMatch && lngMatch && addressPart) {
        candidates.push({
          address: addressPart,
          lat: parseFloat(latMatch[1]),
          lng: parseFloat(lngMatch[1])
        });
      }
    });

    return candidates;
  } catch (error: any) {
    console.error("Erro na busca:", error);
    throw error;
  }
};
