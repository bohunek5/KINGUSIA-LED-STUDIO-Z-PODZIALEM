/**
 * KINGUSIA LED STUDIO — Moduł Ollama
 * Komunikacja z lokalnym Ollama API
 *
 * ⚠️ CORS FIX: Jeśli otwierasz z GitHub Pages (HTTPS), musisz uruchomić Ollama z:
 *   OLLAMA_ORIGINS="https://bohunek5.github.io" ollama serve
 */

const OllamaClient = (() => {
    // URL można zmienić przez localStorage (ustawienia w UI)
    let BASE_URL = localStorage.getItem('ollama-url') || 'http://localhost:11434';
    let activeModel = null;
    let isOnline = false;

    const SYSTEM_PROMPT = `Jesteś Kingusia — ekspert doradca oświetlenia LED firmy Prescot/Scharfer.
Pomagasz projektować oświetlenie LED dla pomieszczeń. Odpowiadasz po polsku, konkretnie i pomocnie.
Znasz się na: taśmach LED (COB, SMD2835, SMD5050, RGB), profilach aluminiowych,
zasilaczach LED, temperaturach barwowych (2700K-6500K), stopniach ochrony IP.
Sugerujesz konkretne produkty i parametry do pomieszczeń.`;

    function getBaseUrl() {
        return localStorage.getItem('ollama-url') || 'http://localhost:11434';
    }

    async function checkStatus() {
        BASE_URL = getBaseUrl();
        try {
            const res = await fetch(`${BASE_URL}/api/tags`, {
                signal: AbortSignal.timeout(4000),
                // Nie wysyłaj credentials - może pomagać z CORS
                mode: 'cors'
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const models = (data.models || []).map(m => m.name);
            isOnline = true;

            const preferred = ['llama3.2', 'llama3.1', 'llama3', 'gemma3', 'gemma2', 'mistral', 'phi3', 'phi', 'deepseek'];
            activeModel = null;
            for (const pref of preferred) {
                const found = models.find(m => m.startsWith(pref));
                if (found) { activeModel = found; break; }
            }
            if (!activeModel && models.length > 0) activeModel = models[0];

            return { online: true, models, activeModel };
        } catch (err) {
            isOnline = false;
            activeModel = null;
            // Wykryj typ błędu
            const isCors = err instanceof TypeError && err.message.includes('fetch');
            return { online: false, models: [], activeModel: null, corsError: isCors };
        }
    }

    async function* chat(messages, onToken) {
        BASE_URL = getBaseUrl();
        if (!isOnline || !activeModel) {
            throw new Error('OLLAMA_OFFLINE');
        }

        const payload = {
            model: activeModel,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                ...messages
            ],
            stream: true,
            options: { temperature: 0.7, num_predict: 600 }
        };

        let res;
        try {
            res = await fetch(`${BASE_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(90000),
                mode: 'cors'
            });
        } catch (err) {
            throw new Error('CORS_ERROR');
        }

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const lines = decoder.decode(value).split('\n').filter(l => l.trim());
            for (const line of lines) {
                try {
                    const json = JSON.parse(line);
                    const token = json?.message?.content || '';
                    if (token) {
                        fullText += token;
                        if (onToken) onToken(token, fullText);
                    }
                    if (json.done) { yield fullText; return; }
                } catch { /* ignoruj błędy parsowania */ }
            }
        }
        yield fullText;
    }

    return {
        checkStatus,
        chat,
        getModel: () => activeModel,
        isOnline: () => isOnline,
        getBaseUrl,
        setBaseUrl: (url) => { localStorage.setItem('ollama-url', url); BASE_URL = url; }
    };
})();
