import { GoogleGenAI } from "@google/genai";
import { FormData } from "../types";

// W Vite używamy import.meta.env
const OLLAMA_URL = (import.meta as any).env.VITE_OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = 'llama3.2:latest';

const SYSTEM_INSTRUCTION = `
Jesteś ekspertem oświetlenia LED i fotografii architektury. Twoim zadaniem jest przekształcenie parametrów wejściowych użytkownika (w języku polskim) na JEDEN, spójny, wysoce szczegółowy prompt do generowania obrazów w języku ANGIELSKIM.

KRYTYCZNE ZASADY (STRICT RULES - NO SPOTS):
1. ABSOLUTNY ZAKAZ PUNKTÓW ŚWIETLNYCH: Nie generuj "downlights", "spotlights", "track lights", żarówek ani widocznych pojedynczych diod (dots).
2. TYLKO ŚWIATŁO LINIOWE: Całe oświetlenie musi pochodzić z ciągłych linii (linear profiles, LED strips, neon flex).
3. JEDNOLITA LINIA: Światło musi być idealnie rozproszone (diffused), bez widocznych przerw czy kropek (seamless COB effect).

Wytyczne do promptu:
- ZAWSZE używaj fraz: "continuous linear LED profiles", "seamless architectural light lines", "recessed linear lighting", "soft diffused strip light".
- Opisz światło jako idealną linię wpuszczoną w sufit/ścianę/podłogę.
- Jeśli użytkownik wybrał styl "Katalogowy", usuń wszelki bałagan i ludzi.
- Przetłumacz opis na techniczny język fotografii (np. "warm 3000K linear ambient glow").

Zwróć TYLKO treść promptu po angielsku. Bez wstępów.
`;

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

// Generate a detailed prompt using LOCAL OLLAMA
export const generateDetailedPrompt = async (formData: FormData): Promise<string> => {
    const userContent = JSON.stringify(formData, null, 2);

    try {
        const response = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: OLLAMA_MODEL,
                prompt: `${SYSTEM_INSTRUCTION}\n\nStwórz prompt na podstawie tych danych: ${userContent}\n\nWAŻNE: Wygeneruj obraz TYLKO z liniami światła, żadnych spotów (NO SPOTLIGHTS)!`,
                stream: false,
                options: { temperature: 0.6 }
            })
        });

        if (!response.ok) throw new Error(`Ollama error: ${response.status}`);
        const data = await response.json();
        return data.response.trim() || "Modern linear LED lighting in architectural space.";
    } catch (error) {
        console.error("Ollama Prompt Gen Error:", error);
        throw new Error("Nie udało się utworzyć opisu sceny przez Ollama. Upewnij się, że Ollama działa.");
    }
};

// Generate an image using GOOGLE GEMINI
export const generateImageFromPrompt = async (
    prompt: string,
    aspectRatio: string,
    _seed?: number,
    retryCount = 0
): Promise<string> => {
    const apiKey = (import.meta as any).env.VITE_GEMINI_API_KEY;

    if (!apiKey || apiKey.includes('TWÓJ_KLUCZ')) {
        throw new Error("Brak klucza API Gemini dla generowania obrazów. Dodaj go w pliku .env.");
    }

    const genAI = new GoogleGenAI(apiKey);
    // Gemini 2.0 Flash obsługuje generowanie obrazów (imagen) w niektórych regionach/wersjach SDK
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const strictPrompt = `${prompt}. The lighting must be exclusively continuous linear LED strips. Absolutely no spotlights, no downlights, no light bulbs, and no visible dots. Professional architectural photography style. High-end finish.`;

    try {
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: strictPrompt }] }],
            // @ts-ignore - Image generation configuration based on latest SDK
            generationConfig: {
                imageConfig: {
                    aspectRatio: aspectRatio === "1:1" ? "1:1" : aspectRatio === "16:9" ? "16:9" : "9:16",
                }
            }
        });

        const response = await result.response;
        const candidate = response.candidates?.[0];
        const part = candidate?.content?.parts?.find(p => p.inlineData);

        if (part?.inlineData) {
            return `data:image/png;base64,${part.inlineData.data}`;
        }

        throw new Error("Model nie zwrócił obrazu. Sprawdź czy model obsługuje generację obrazów w Twoim regionie.");

    } catch (error: any) {
        const isQuotaError = error.message?.includes("429") || error.message?.includes("quota");

        if (isQuotaError && retryCount < 1) {
            await delay(10000);
            return generateImageFromPrompt(prompt, aspectRatio, _seed, retryCount + 1);
        }
        throw error;
    }
};
