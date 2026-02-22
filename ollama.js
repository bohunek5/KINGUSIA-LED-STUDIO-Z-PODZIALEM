/**
 * KINGUSIA LED STUDIO — Moduł Ollama
 * Komunikacja z lokalnym API Ollama (http://localhost:11434)
 */

const OllamaClient = (() => {
    const BASE_URL = 'http://localhost:11434';
    let activeModel = null;
    let isOnline = false;

    const SYSTEM_PROMPT = `Jesteś Kingusia — eksperta doradca oświetlenia LED firmy Prescot/Scharfer.
Pomagasz projektować oświetlenie LED dla pomieszczeń mieszkalnych i komercyjnych.
Odpowiadasz po polsku, konkretnie i pomocnie. Znasz się na:
- Taśmach LED (COB, SMD2835, SMD5050, RGB, RGBW)
- Profilach aluminiowych (nawierzchniowe, wpuszczane, narożne)
- Zasilaczach LED (dobór mocy, zabezpieczenia)
- Temperaturach barwowych (2700K ciepło domowe, 3000K ciepła biała, 4000K neutralna, 6500K zimna/biuro)
- Stopniach ochrony IP (IP20 suche, IP44 wilgoć, IP65 prysznic, IP67 zanurzenie)
- Kalkulacji zużycia energii i doboru zasilaczy
Gdy pytasz o pomieszczenie - sugerujesz konkretne produkty i parametry.`;

    async function checkStatus() {
        try {
            const res = await fetch(`${BASE_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
            if (!res.ok) throw new Error();
            const data = await res.json();
            const models = (data.models || []).map(m => m.name);
            isOnline = true;

            // Wybierz najlepszy dostępny model
            const preferred = ['llama3.2', 'llama3.1', 'llama3', 'gemma3', 'gemma2', 'mistral', 'phi3', 'phi'];
            activeModel = null;
            for (const pref of preferred) {
                const found = models.find(m => m.startsWith(pref));
                if (found) { activeModel = found; break; }
            }
            if (!activeModel && models.length > 0) activeModel = models[0];

            return { online: true, models, activeModel };
        } catch {
            isOnline = false;
            activeModel = null;
            return { online: false, models: [], activeModel: null };
        }
    }

    async function* streamChat(messages, onToken) {
        if (!isOnline || !activeModel) {
            throw new Error('Ollama offline');
        }

        const payload = {
            model: activeModel,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                ...messages
            ],
            stream: true,
            options: { temperature: 0.7, num_predict: 512 }
        };

        const res = await fetch(`${BASE_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(60000)
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n').filter(l => l.trim());
            for (const line of lines) {
                try {
                    const json = JSON.parse(line);
                    const token = json?.message?.content || '';
                    if (token) {
                        fullText += token;
                        if (onToken) onToken(token, fullText);
                    }
                    if (json.done) return fullText;
                } catch { /* ignore parse errors */ }
            }
        }
        return fullText;
    }

    async function chat(messages, onToken) {
        return streamChat(messages, onToken);
    }

    return {
        checkStatus,
        chat,
        getModel: () => activeModel,
        isOnline: () => isOnline
    };
})();
