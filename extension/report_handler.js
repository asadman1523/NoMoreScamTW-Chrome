// Report Handler Logic (Message Based)
// Functions are exposed globally via importScripts in background.js

// Remove old context menus if they exist
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll();
});

// Listener moved to background.js to prevent conflicts

// AI Analysis for Government Email Verification
async function verifyGovWithAI(name, email) {
    console.log("Verifying Gov Email:", name, email);

    // ⚠️ WARNING: Exposing API Key in client-side code is not secure for production.
    const API_KEY = "YOUR_OPENAI_API_KEY";

    if (API_KEY === "YOUR_OPENAI_API_KEY") {
        return { isScam: false, confidence: 0, reason: "API Key logic not configured" };
    }

    const prompt = `
    You are a cybersecurity expert. Verify if the following sender is legitimate for the claimed government agency.
    
    Claimed Agency Name: "${name}"
    Sender Email Address: "${email}"
    
    Rule: Government agencies in Taiwan usually use ".gov.tw" domains. Public utilities (Taipower, etc.) have their own official domains (e.g. taipower.com.tw). Gmail/Yahoo/Outlook addresses are HIGHLY SUSPICIOUS for official correspondence.
    
    Respond ONLY with a valid JSON object:
    {
        "isScam": boolean (true if likely impersonation),
        "confidence": number (0-100),
        "reason": "short explanation (e.g. 'Police should not use gmail')"
    }
    `;

    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "You are a helpful assistant that verifies official emails." },
                    { role: "user", content: prompt }
                ],
                temperature: 0.1
            })
        });

        if (!response.ok) throw new Error(`API Error: ${response.status}`);

        const data = await response.json();
        const resultText = data.choices[0].message.content;
        const jsonStr = resultText.replace(/```json\n?|\n?```/g, "").trim();
        return JSON.parse(jsonStr);

    } catch (e) {
        console.error("Gov Verification Failed:", e);
        return { isScam: false, confidence: 0, reason: "Analysis Failed" };
    }
}

// 4. AI Analysis (OpenAI)
async function analyzeWithAI(content) {
    console.log("Analyzing with AI:", content);

    // ⚠️ WARNING: Exposing API Key in client-side code is not secure for production.
    const API_KEY = "YOUR_OPENAI_API_KEY";

    if (API_KEY === "YOUR_OPENAI_API_KEY") {
        console.warn("OpenAI API Key not set.");
        return { isScam: false, confidence: 0, reason: "API Key logic not configured by user" };
    }

    const prompt = `
    You are a cybersecurity expert. Analyze the following content (URL or text) and determine if it is likely a scam, phishing attempt, or fraudulent.
    
    Content: "${content}"
    
    Respond ONLY with a valid JSON object in the following format:
    {
        "isScam": boolean,
        "confidence": number (0-100),
        "type": "string (e.g., Phishing, Investment Scam, Safe, Unknown)",
        "reason": "short explanation"
    }
    `;

    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "You are a helpful assistant that detects scams." },
                    { role: "user", content: prompt }
                ],
                temperature: 0.1
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        const resultText = data.choices[0].message.content;

        // Clean markdown code blocks if present
        const jsonStr = resultText.replace(/```json\n?|\n?```/g, "").trim();
        const result = JSON.parse(jsonStr);

        return {
            content: content,
            isScam: result.isScam,
            confidence: result.confidence,
            type: result.type,
            reason: result.reason,
            timestamp: Date.now()
        };

    } catch (e) {
        console.error("AI Analysis Failed:", e);
        return { isScam: false, confidence: 0, reason: "Analysis Failed" };
    }
}

// 5. Add to Firebase
async function addReportToFirebase(reportData) {
    if (!FIREBASE_CONFIG || !FIREBASE_CONFIG.databaseURL || FIREBASE_CONFIG.databaseURL.includes('YOUR_PROJECT_ID')) {
        console.warn("Firebase not configured properly.");
        return;
    }

    const url = `${FIREBASE_CONFIG.databaseURL}/reports.json`;

    try {
        await fetch(url, {
            method: 'POST',
            body: JSON.stringify(reportData)
        });
        console.log("Report submitted to Firebase");
    } catch (e) {
        console.error("Firebase write failed", e);
    }
}
