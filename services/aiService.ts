import { GoogleGenAI, Type } from "@google/genai";
import { ChecklistItem } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateChecklistFromCSV = async (csvData: string): Promise<ChecklistItem[]> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Analise os dados CSV de uma planilha fornecida abaixo. Seu objetivo é extrair uma lista de verificação (checklist) limpa e organizada.
      
      Regras:
      1. Identifique qual coluna representa a "Categoria" (ex: Setor, Área, Grupo) e qual representa a "Pergunta" ou "Item de Verificação".
      2. Se não houver coluna de categoria, use "Geral".
      3. Ignore cabeçalhos, linhas vazias ou linhas que pareçam ser apenas títulos de relatórios.
      4. Gere um ID curto e único para cada item (ex: 'item_1', 'seg_2').
      5. O texto deve ser a pergunta ou instrução clara do checklist.

      Dados CSV:
      ${csvData}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              category: { type: Type.STRING },
              text: { type: Type.STRING }
            },
            required: ["id", "category", "text"]
          }
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) return [];
    
    const items = JSON.parse(jsonText) as ChecklistItem[];
    return items;
  } catch (error) {
    console.error("Erro ao gerar checklist com IA:", error);
    throw new Error("Falha ao processar a planilha com IA.");
  }
};