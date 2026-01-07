
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
            text: "Aja como um scanner de elite para logística brasileira. Analise esta etiqueta de envio (pode ser Mercado Livre, Shopee ou Correios). Localize o endereço de DESTINO. Ignore nomes, CPFs, e-mails e observações. Foque em: Logradouro (Rua/Av), Número, Bairro, Cidade, Estado e CEP. Retorne APENAS o endereço formatado em uma linha. Se houver vários textos, escolha o que parece ser o destino principal. Se não encontrar nada que pareça um endereço, responda apenas: 'ERRO'.",
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

export const searchAddresses = async (query: string, contextAddress?: string): Promise<AddressCandidate[]> => {
  try {
    const prompt = `Converta este texto de etiqueta em coordenadas geográficas reais: "${query}". 
    ${contextAddress ? `Priorize resultados próximos a: ${contextAddress}.` : ""}
    O formato de resposta deve ser estritamente: 
    [Endereço Completo Oficial], LAT: [latitude], LNG: [longitude]`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
      },
    });

    const text = response.text || "";
    const candidates: AddressCandidate[] = [];
    
    const latMatch = text.match(/LAT:\s*(-?\d+\.\d+)/i);
    const lngMatch = text.match(/LNG:\s*(-?\d+\.\d+)/i);
    const addressPart = text.split(/,?\s*LAT:/i)[0].replace(/^\d+\.\s*/, '').trim();

    if (latMatch && lngMatch && addressPart) {
      candidates.push({
        address: addressPart,
        lat: parseFloat(latMatch[1]),
        lng: parseFloat(lngMatch[1])
      });
    }

    return candidates;
  } catch (error: any) {
    console.error("Erro na busca de endereço:", error);
    throw error;
  }
};
