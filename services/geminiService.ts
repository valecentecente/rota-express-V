
import { GoogleGenAI } from "@google/genai";

export interface AddressCandidate {
  address: string;
  lat: number;
  lng: number;
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const extractAddressFromImage = async (base64Image: string) => {
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
            text: "Extraia o endereço de DESTINO desta etiqueta. Ignore nomes e CPFs. Retorne apenas o endereço limpo em uma linha. Se não houver endereço, retorne 'ERRO'.",
          },
        ],
      },
    });
    const result = response.text?.trim() || "";
    return (result === "ERRO" || result.length < 5) ? null : result;
  } catch (error) {
    console.error("Erro OCR:", error);
    return null;
  }
};

export const searchAddresses = async (
  query: string, 
  userCoords?: { lat: number; lng: number }
): Promise<AddressCandidate[]> => {
  try {
    const prompt = `Localize este endereço: "${query}". 
    Responda no formato: [Endereço Completo], LAT: [latitude], LNG: [longitude]`;

    const config: any = {
      tools: [{ googleMaps: {} }],
    };

    if (userCoords) {
      config.toolConfig = {
        retrievalConfig: {
          latLng: {
            latitude: userCoords.lat,
            longitude: userCoords.lng
          }
        }
      };
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: config
    });

    const text = response.text || "";
    // Regex melhorada para aceitar negativos, inteiros e decimais
    const latMatch = text.match(/LAT:\s*(-?\d+(\.\d+)?)/i);
    const lngMatch = text.match(/LNG:\s*(-?\d+(\.\d+)?)/i);
    const addressPart = text.split(/,?\s*LAT:/i)[0].trim();

    if (latMatch && lngMatch && addressPart) {
      return [{
        address: addressPart,
        lat: parseFloat(latMatch[1]),
        lng: parseFloat(lngMatch[1])
      }];
    }
    
    console.warn("IA retornou formato inválido:", text);
    return [];
  } catch (error: any) {
    console.error("Erro na busca Gemini:", error);
    throw error;
  }
};
