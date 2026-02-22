import { GoogleGenAI } from "@google/genai";
import { FormData } from "../types";

// Konfiguracja dostawców
const OLLAMA_URL = (import.meta as any).env.VITE_OLLAMA_URL || 'http://localhost:11434';
const SAMBANOVA_API_KEY = (import.meta as any).env.VITE_GEMINI_API_KEY; // Używamy tego samego klucza z .env
const GEMINI_API_KEY = (import.meta as any).env.VITE_GEMINI_API_KEY;

// Wybieramy model SambaNova (Llama 3.1 70B jest świetny do promptów)
const SAMBANOVA_MODEL = 'Meta-Llama-3.1-70B-Instruct';

const SYSTEM_INSTRUCTION = `
Jesteś ekspertem oświetlenia LED i fotografii architektury. Twoim zadaniem jest przekształcenie parametrów wejściowych użytkownika (w języku polskim) na JEDEN, spójny, wysoce szczegółowy prompt do generowania obrazów w języku ANGIELSKIM.

KRYTYCZNE ZASADY:
1. ABSOLUTNY ZAKAZ PUNKTÓW ŚWIETLNYCH: Nie generuj "downlights", "spotlights", żarówek.
2. TYLKO ŚWIATŁO LINIOWE: Całe oświetlenie musi pochodzić z ciągłych linii (linear profiles, LED strips).
3. JEDNOLITA LINIA: Światło musi być idealnie rozproszone, bez widocznych kropel (seamless effect).

Zwróć TYLKO treść promptu po angielsku.
`;

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

// Funkcja generująca prompt przez SAMBANOVA (Cloud) lub OLLAMA (Local)
export const generateDetailedPrompt = async (formData: FormData): Promise<string> => {
    const userContent = JSON.stringify(formData, null, 2);
    const fullPrompt = `${SYSTEM_INSTRUCTION}\n\nStwórz prompt na podstawie tych danych: ${userContent}\n\nWAŻNE: Wygeneruj obraz TYLKO z liniami światła!`;

    // Próbujemy SambaNova (Cloud) - rozwiązuje problemy CORS na GitHub Pages
    if (SAMBANOVA_API_KEY && SAMBANOVA_API_KEY.includes('.sc-')) {
        try {
            const response = await fetch('https://api.sambanova.ai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${SAMBANOVA_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: SAMBANOVA_MODEL,
                    messages: [{ role: 'user', content: fullPrompt }],
                    temperature: 0.1
                })
            });

            if (response.ok) {
                const data = await response.json();
                return data.choices[0].message.content.trim();
            }
        } catch (e) {
            console.warn("SambaNova Cloud failed, falling back to Ollama...", e);
        }
    }

    // Fallback do lokalnej Ollamy
    try {
        const response = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama3.2:latest',
                prompt: fullPrompt,
                stream: false
            })
        });
        const data = await response.json();
        return data.response.trim();
    } catch (error) {
        throw new Error("Błąd AI: Nie udało się połączyć ani z Chmurą SambaNova, ani z lokalną Ollamą. Sprawdź klucz API lub czy Ollama działa.");
    }
};

// Generowanie obrazu przez Gemini
export const generateImageFromPrompt = async (
    prompt: string,
    aspectRatio: string,
    _seed?: number,
    retryCount = 0
): Promise<string> => {
    const apiKey = GEMINI_API_KEY;

    // Jeśli klucz to klucz SambaNova, nie zadziała w Gemini
    if (!apiKey || apiKey.includes('.sc-') || apiKey.includes('TWÓJ_KLUCZ')) {
        throw new Error("Do generowania obrazów potrzebujesz klucza API Google Gemini. Dostarczony klucz '.sc-' służy tylko do tekstu.");
    }

    const genAI = new GoogleGenAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    try {
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: `${prompt}. Architectural photography, high resolution, linear LED lighting only.` }] }],
            // @ts-ignore
            generationConfig: {
                imageConfig: { aspectRatio: aspectRatio }
            }
        });

        const response = await result.response;
        const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);

        if (part?.inlineData) {
            return `data:image/png;base64,${part.inlineData.data}`;
        }
        throw new Error("Brak obrazu w odpowiedzi Gemini.");

    } catch (error: any) {
        if ((error.message?.includes("429") || error.message?.includes("quota")) && retryCount < 1) {
            await delay(10000);
            return generateImageFromPrompt(prompt, aspectRatio, _seed, retryCount + 1);
        }
        throw error;
    }
};
