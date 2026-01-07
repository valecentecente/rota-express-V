
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
            text: "Aja como um scanner de elite para logística brasileira. Analise esta etiqueta de envio. Localize o endereço de DESTINO. Foque em: Logradouro, Número, Bairro, Cidade e CEP. Retorne APENAS o endereço formatado em uma linha. Se não encontrar nada, responda: 'ERRO'.",
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
    const prompt = `Localize este endereço no mapa: "${query}". 
    Retorne o resultado exatamente neste formato: 
    [Endereço Completo], LAT: [latitude], LNG: [longitude]`;

    const config: any = {
      tools: [{ googleMaps: {} }],
    };

    // Adiciona o contexto geográfico do usuário para priorizar resultados locais
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
    const candidates: AddressCandidate[] = [];
    
    // Regex flexível para capturar coordenadas mesmo com pequenas variações de texto
    const latMatch = text.match(/LAT:\s*(-?\d+\.\d+)/i);
    const lngMatch = text.match(/LNG:\s*(-?\d+\.\d+)/i);
    const addressPart = text.split(/,?\s*LAT:/i)[0].trim();

    if (latMatch && lngMatch && addressPart) {
      candidates.push({
        address: addressPart,
        lat: parseFloat(latMatch[1]),
        lng: parseFloat(lngMatch[1])
      });
    } else {
      console.warn("Formato de resposta inesperado da IA:", text);
    }

    return candidates;
  } catch (error: any) {
    console.error("Erro técnico na busca Gemini:", error);
    throw error;
  }
};
