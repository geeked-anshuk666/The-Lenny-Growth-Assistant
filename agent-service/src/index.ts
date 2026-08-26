import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });
dotenv.config(); // fallback to local directory

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

function cleanChatHistory(messages: { role: string; content: string }[]) {
    const nonHostile = messages.filter((m: any) => m.content && m.content.trim() !== '');
    const collapsed: { role: string; content: string }[] = [];
    for (const msg of nonHostile) {
        if (collapsed.length > 0 && collapsed[collapsed.length - 1].role === msg.role) {
            collapsed[collapsed.length - 1].content += "\n" + msg.content;
        } else {
            collapsed.push({ role: msg.role, content: msg.content });
        }
    }
    while (collapsed.length > 0 && collapsed[0].role !== 'user') {
        collapsed.shift();
    }
    return collapsed;
}

interface LLMResponse {
    text: string;
    providerUsed: string;
    modelUsed: string;
    rateLimited: boolean;
    fallbackModel: string | null;
}

// Setup Pi-AI mock/wrapper to support local & cloud providers cleanly
async function generateLLMResponse(
    messages: { role: string; content: string }[],
    systemPrompt: string,
    provider: string,
    isEssay: boolean,
    modelOverride?: string
): Promise<LLMResponse> {
    let activeProvider = provider;
    let apiKey = '';
    let modelName = '';
    let baseUrl = '';

    if (activeProvider === 'gemini') {
        apiKey = process.env.GEMINI_API_KEY || '';
        modelName = modelOverride || process.env.GEMINI_MODEL || 'gemini-2.0-flash-lite';
    } else if (activeProvider === 'groq') {
        apiKey = process.env.GROQ_API_KEY || '';
        modelName = modelOverride || process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
    } else {
        activeProvider = 'ollama';
        baseUrl = process.env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434';
        modelName = modelOverride || process.env.OLLAMA_MODEL || 'qwen2.5:3b';
    }

    const fallbackProvider = process.env.LLM_PROVIDER_FALLBACK || 'ollama';

    const filteredMessages = cleanChatHistory(messages);

    // Graceful fallback to fallbackProvider if API key for cloud provider is missing
    if ((activeProvider === 'gemini' || activeProvider === 'groq') && (!apiKey || apiKey.includes('placeholder') || apiKey.includes('your_'))) {
        console.warn(`API Key missing for ${activeProvider}. Falling back to ${fallbackProvider}.`);
        return generateLLMResponse(filteredMessages, systemPrompt, fallbackProvider, isEssay);
    }

    console.log(`Calling LLM using provider: ${activeProvider}, model: ${modelName}`);

    // Call the respective provider's HTTP API directly or through the Pi library interface
    // Here we use a robust direct HTTP integration to ensure 100% reliable execution regardless of network or package registry locks
    let replyText = '';
    try {
        if (activeProvider === 'gemini') {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: {
                        parts: [{ text: systemPrompt }]
                    },
                    contents: filteredMessages.map((m: any) => ({
                        role: m.role === 'assistant' ? 'model' : 'user',
                        parts: [{ text: m.content }]
                    }))
                })
            });
            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Gemini API returned status ${response.status}: ${errText}`);
            }
            const data = await response.json() as any;
            replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } else if (activeProvider === 'groq') {
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: modelName,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        ...filteredMessages
                    ],
                    temperature: 0.7
                })
            });
            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Groq API returned status ${response.status}: ${errText}`);
            }
            const data = await response.json() as any;
            replyText = data.choices?.[0]?.message?.content || '';
        } else {
            // Ollama
            let targetUrl = `${baseUrl}/api/chat`;
            let ollamaResponse;
            try {
                ollamaResponse = await fetch(targetUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: modelName,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            ...filteredMessages
                        ],
                        stream: false
                    })
                });
            } catch (fetchErr: any) {
                if (baseUrl.includes('host.docker.internal')) {
                    console.log("host.docker.internal failed, falling back to localhost for Ollama...");
                    const fallbackUrl = baseUrl.replace('host.docker.internal', 'localhost');
                    ollamaResponse = await fetch(`${fallbackUrl}/api/chat`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: modelName,
                            messages: [
                                { role: 'system', content: systemPrompt },
                                ...filteredMessages
                            ],
                            stream: false
                        })
                    });
                } else if (baseUrl.includes('localhost')) {
                    console.log("localhost failed, falling back to host.docker.internal for Ollama...");
                    const fallbackUrl = baseUrl.replace('localhost', 'host.docker.internal');
                    ollamaResponse = await fetch(`${fallbackUrl}/api/chat`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: modelName,
                            messages: [
                                { role: 'system', content: systemPrompt },
                                ...filteredMessages
                            ],
                            stream: false
                        })
                    });
                } else {
                    throw fetchErr;
                }
            }
            if (!ollamaResponse.ok) {
                const errText = await ollamaResponse.text();
                throw new Error(`Ollama API returned status ${ollamaResponse.status}: ${errText}`);
            }
            const data = await ollamaResponse.json() as any;
            replyText = data.message?.content || '';
        }
    } catch (error) {
        console.error(`Error calling ${activeProvider}:`, error);
        // Fallback to configured fallback provider if primary fails
        if (activeProvider !== fallbackProvider) {
            console.log(`Triggering fallback: attempting ${fallbackProvider}...`);
            return generateLLMResponse(filteredMessages, systemPrompt, fallbackProvider, isEssay);
        }
        throw error;
    }

    return {
        text: replyText,
        providerUsed: activeProvider,
        modelUsed: modelName,
        rateLimited: false,
        fallbackModel: null
    };
}

// Rotates through available providers on failure
async function generateLLMResponseWithRotation(
    messages: { role: string; content: string }[],
    systemPrompt: string,
    initialProvider: string,
    isEssay: boolean,
    modelOverride?: string
): Promise<LLMResponse> {
    const rotationList = ['gemini', 'groq', 'ollama'];
    let startIndex = rotationList.indexOf(initialProvider);
    if (startIndex === -1) startIndex = 0;
    
    let lastError: any = null;
    for (let i = 0; i < rotationList.length; i++) {
        const currentProvider = rotationList[(startIndex + i) % rotationList.length];
        // Only use the model override for the initially requested provider; fallbacks use their defaults
        const overrideForThisProvider = currentProvider === initialProvider ? modelOverride : undefined;
        try {
            const result = await generateLLMResponse(messages, systemPrompt, currentProvider, isEssay, overrideForThisProvider);
            return {
                ...result,
                rateLimited: currentProvider !== initialProvider,
                fallbackModel: currentProvider !== initialProvider ? result.modelUsed : null
            };
        } catch (error) {
            console.warn(`Provider ${currentProvider} failed, rotating to next...`, error);
            lastError = error;
        }
    }
    throw lastError || new Error("All LLM providers failed in rotation loop.");
}

app.get('/health', (req: Request, res: Response) => {
    res.json({
        status: 'ok',
        service: 'agent-service',
        providers: {
            gemini: !!process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.includes('placeholder'),
            groq: !!process.env.GROQ_API_KEY && !process.env.GROQ_API_KEY.includes('placeholder'),
            ollama: process.env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434'
        }
    });
});

app.post('/agent/generate', async (req: Request, res: Response) => {
    const { messages, context, provider, is_essay_request, model_override } = req.body;

    try {
        let systemPrompt = '';
        if (is_essay_request) {
            systemPrompt = `You are an elite growth editor trained in the Ship 30 for 30 framework.
Your task is to write a highly polished, skimmable essay (~1,250 words) based strictly on the provided podcast context.

Follow these rules:
1. Headline Formula: A clear, hook-style headline starting with H1 or H2 answering WHO it is for, WHAT it's about, and WHY (the promise/outcome).
2. Skimmability: Use H2/H3 tags for major sections. Alternate short punchy lines with longer explanatory paragraphs. Use bullet points for lists.
3. Content Differentiation: Avoid obvious/generic advice. Push past clichés to write unique takeaways.
4. One Throughline: Organize around a single proven structure (e.g. 3 lessons, 4 mistakes, 5 steps).
5. Specific Takeaway: End with a clear, concrete call to action or memorable final thought under a dedicated closing section.
6. Citation: Cite claims with the specific guest name and YouTube citation badge in brackets (e.g., "[Brian Chesky (00:04:12)]").

Grounded Context to use:
${context}`;
        } else {
            systemPrompt = `You are the Lenny Growth Assistant. You answer questions about product growth, management, and strategy using ONLY the provided podcast transcript context.
When replying:
- Ground all facts strictly in the provided context.
- Cite the source episode title and speaker name with clickable timestamps whenever referencing a claim (e.g. "According to Brian Chesky, you need to build something that 100 people love (Brian Chesky, 00:05:12)").
- Keep responses clean, concise, and structured.
- If the context doesn't contain the answer, politely decline to answer.

Grounded Context:
${context}`;
        }

        const result = await generateLLMResponseWithRotation(messages, systemPrompt, provider || 'gemini', is_essay_request, model_override);

        // Check if an artifact needs to be extracted
        let artifact = null;
        if (is_essay_request || result.text.includes("```html") || result.text.includes("```markdown")) {
            const isHtml = result.text.includes("```html");
            const type = isHtml ? 'html' : 'markdown';
            
            // Regex to extract content inside ```html or ```markdown blocks
            const match = result.text.match(new RegExp(`\`\`\`(?:${type})?\\s*([\\s\\S]*?)\`\`\``));
            const content = match ? match[1].trim() : result.text;
            
            artifact = {
                type,
                content
            };
        }

        res.json({
            text: result.text,
            provider_used: result.providerUsed,
            model_used: result.modelUsed,
            rate_limited: result.rateLimited || false,
            fallback_model: result.fallbackModel || null,
            artifact
        });

    } catch (error: any) {
        console.error("Error generating agent response:", error);
        res.status(500).json({
            error: "Failed to generate response",
            message: error.message
        });
    }
});

// Proxy endpoint so the frontend can discover live model lists without exposing API keys
app.get('/provider/models', async (req: Request, res: Response) => {
    const provider = req.query.provider as string;
    try {
        if (provider === 'gemini') {
            const apiKey = process.env.GEMINI_API_KEY || '';
            const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            if (!r.ok) return res.status(r.status).json({ error: 'Failed to fetch Gemini models' });
            const data = await r.json() as any;
            // Filter to only generative text models
            const models = (data.models || []).filter((m: any) => 
                m.supportedGenerationMethods?.includes('generateContent')
            ).map((m: any) => ({ id: m.name.replace('models/', ''), label: m.displayName || m.name }));
            return res.json({ models });
        } else if (provider === 'groq') {
            const apiKey = process.env.GROQ_API_KEY || '';
            const r = await fetch('https://api.groq.com/openai/v1/models', {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });
            if (!r.ok) return res.status(r.status).json({ error: 'Failed to fetch Groq models' });
            const data = await r.json() as any;
            // Filter to only LLM models (exclude whisper/safeguard/TTS)
            const models = (data.data || []).filter((m: any) => 
                !m.id.includes('whisper') && !m.id.includes('safeguard') && 
                !m.id.includes('guard') && !m.id.includes('orpheus')
            ).map((m: any) => ({ id: m.id, label: m.id }));
            return res.json({ models });
        } else if (provider === 'ollama') {
            const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
            const r = await fetch(`${baseUrl}/api/tags`).catch(() => null);
            if (!r || !r.ok) return res.json({ models: [{ id: 'qwen2.5:3b', label: 'Qwen 2.5 3B (Local)' }] });
            const data = await r.json() as any;
            const models = (data.models || []).map((m: any) => ({ id: m.name, label: m.name }));
            return res.json({ models });
        } else {
            return res.status(400).json({ error: 'Unknown provider. Use gemini, groq, or ollama.' });
        }
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});


app.listen(PORT, () => {
    console.log(`Agent Service running on port ${PORT}`);
    
    // Trigger lazy pre-load warm-up call for Ollama
    const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434';
    const ollamaModel = process.env.OLLAMA_MODEL || 'qwen2.5:3b';
    console.log(`Triggering pre-load warm-up call to Ollama model ${ollamaModel}...`);
    
    const tryWarmup = (url: string) => {
        fetch(`${url}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: ollamaModel,
                messages: [{ role: 'user', content: 'Warm up request' }],
                stream: false
            })
        }).then(res => {
            if (res.ok) console.log(`Ollama model preloaded successfully via ${url}.`);
            else console.warn(`Ollama pre-load returned status ${res.status} via ${url}.`);
        }).catch((err: any) => {
            if (url.includes('host.docker.internal')) {
                console.log(`Failed to warm up via ${url}, retrying via localhost...`);
                tryWarmup(url.replace('host.docker.internal', 'localhost'));
            } else if (url.includes('localhost')) {
                console.log(`Failed to warm up via ${url}, retrying via host.docker.internal...`);
                tryWarmup(url.replace('localhost', 'host.docker.internal'));
            } else {
                console.warn(`Failed to warm up Ollama model via ${url}:`, err.message);
            }
        });
    };
    tryWarmup(ollamaUrl);
});
