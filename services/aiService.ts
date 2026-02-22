import { GoogleGenAI } from "@google/genai";
import { FormData } from "../types";

// Konfiguracja dostawców
const OLLAMA_URL = (import.meta as any).env.VITE_OLLAMA_URL || 'http://localhost:11434';
const API_KEY = (import.meta as any).env.VITE_GEMINI_API_KEY;

const SYSTEM_INSTRUCTION = `
Jesteś ekspertem oświetlenia LED i fotografii architektury. Twoim zadaniem jest przekształcenie parametrów wejściowych użytkownika (w języku polskim) na JEDEN, spójny, wysoce szczegółowy prompt do generowania obrazów w języku ANGIELSKIM.

KRYTYCZNE ZASADY (STRICT RULES):
1. ABSOLUTNY ZAKAZ PUNKTÓW ŚWIETLNYCH: Nie generuj "downlights", "spotlights", żarówek.
2. TYLKO ŚWIATŁO LINIOWE: Całe oświetlenie musi pochodzić z ciągłych linii (linear profiles, LED strips).
3. JEDNOLITA LINIA: Światło musi być idealnie rozproszone.

Zwróć TYLKO treść promptu po angielsku. Bez wstępów.
`;

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

// Funkcja generująca prompt (Tekst)
export const generateDetailedPrompt = async (formData: FormData): Promise<string> => {
    const userContent = JSON.stringify(formData, null, 2);
    const fullPrompt = `${SYSTEM_INSTRUCTION}\n\nStwórz prompt na podstawie tych danych: ${userContent}`;

    // 1. Próba SambaNova (jeśli klucz .sc-)
    if (API_KEY && API_KEY.includes('.sc-')) {
        try {
            const response = await fetch('https://api.sambanova.ai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'Meta-Llama-3.1-70B-Instruct',
                    messages: [{ role: 'user', content: fullPrompt }],
                    temperature: 0.1
                })
            });
            if (response.ok) {
                const data = await response.json();
                return data.choices[0].message.content.trim();
            }
        } catch (e) {
            console.warn("SambaNova failed...");
        }
    }

    // 2. Próba Ollama (lokalnie)
    try {
        const response = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'llama3.2:latest', prompt: fullPrompt, stream: false })
        });
        if (response.ok) {
            const data = await response.json();
            return data.response.trim();
        }
    } catch (e) {
        console.warn("Ollama failed...");
    }

    // 3. OSTATECZNY FALLBACK: Pollinations.ai (FREE, NO API KEY REQUIRED)
    // To sprawi, że appka będzie działać "zawsze" na GitHubie bez konfiguracji
    try {
        const pollinationUrl = `https://text.pollinations.ai/${encodeURIComponent(fullPrompt)}?model=openai&json=true`;
        const response = await fetch(pollinationUrl);
        if (response.ok) {
            const data = await response.json();
            return data.choices?.[0]?.message?.content?.trim() || data.content || "Modern architectural linear LED lighting.";
        }
    } catch (e) {
        console.error("All text providers failed", e);
    }

    return "Modern architectural linear LED lighting, high-end photography, seamless light lines.";
};

// Funkcja generująca obraz
export const generateImageFromPrompt = async (
    prompt: string,
    aspectRatio: string,
    seed?: number,
    retryCount = 0
): Promise<string> => {

    // 1. Jeśli mamy klucz Gemini (nie .sc-), próbujemy Gemini
    if (API_KEY && !API_KEY.includes('.sc-') && !API_KEY.includes('TWÓJ_KLUCZ')) {
        try {
            const genAI = new GoogleGenAI(API_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
            const result = await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: `${prompt}. High resolution, continuous linear lighting.` }] }],
                // @ts-ignore
                generationConfig: { imageConfig: { aspectRatio } }
            });
            const response = await result.response;
            const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (part?.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
        } catch (error: any) {
            console.warn("Gemini Image failed...", error);
            if ((error.message?.includes("429") || error.message?.includes("quota")) && retryCount < 1) {
                await delay(5000);
                return generateImageFromPrompt(prompt, aspectRatio, seed, retryCount + 1);
            }
        }
    }

    // 2. OSTATECZNY FALLBACK DLA OBRAZÓW: Pollinations.ai (FREE, NO API KEY)
    // Flux na Pollinations jest genialny i darmowy
    const width = aspectRatio === "16:9" ? 1280 : aspectRatio === "9:16" ? 720 : 1024;
    const height = aspectRatio === "16:9" ? 720 : aspectRatio === "9:16" ? 1280 : 1024;
    const randomSeed = seed || Math.floor(Math.random() * 1000000);

    // Tryb Flux na Pollinations jest najlepszy jako darmowa alternatywa
    const imageUrl = `https://pollinations.ai/p/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${randomSeed}&model=flux&nologo=true`;

    // Sprawdzamy czy URL żyje (opcjonalne, ale Pollinations zwraca po prostu obraz)
    return imageUrl;
};
