// Gmail Scam Filter
console.log("[NoMoreScam] Gmail Filter Loaded (Production v1.1)");

let checkedLinks = new Set();
let debounceTimer = null;

// Observer Setup
const observer = new MutationObserver((mutations) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        scanLinks();
        scanSender();
        scanEmailBody();
    }, 1000); // Debounce 1s
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

// Cache verified senders to avoid spamming API
const verifiedSenders = new Set();

function scanSender() {
    // Gmail sender usually has 'email' attribute. 
    // .gD is common, but we can be broader: span[email]
    const senders = document.querySelectorAll('span[email]');

    if (typeof containsGovKeyword !== 'function') {
        return;
    }

    senders.forEach(senderElem => {
        if (senderElem.getAttribute('data-gov-checked') === 'true') return;

        const name = senderElem.name || senderElem.innerText || senderElem.textContent;
        const email = senderElem.getAttribute('email');

        if (!email) return;

        // Check if name contains government agency kywords
        if (typeof containsGovKeyword === 'function' && containsGovKeyword(name)) {
            senderElem.setAttribute('data-gov-checked', 'true');

            // Check cache
            const cacheKey = `${name}|${email}`;
            if (verifiedSenders.has(cacheKey)) return;

            console.log(`[NoMoreScam] Found Gov Entity: "${name}" <${email}>. Verifying...`);

            chrome.runtime.sendMessage({
                action: 'verifyGovEmail',
                name: name,
                email: email
            }, (response) => {
                if (response && response.success) {
                    const result = response.result;
                    verifiedSenders.add(cacheKey);

                    if (result.isScam) {
                        markGovImpersonation(senderElem, result);
                    } else {
                        markGovAuthentic(senderElem, result);
                    }
                }
            });
        }
    });
}

function scanLinks() {
    // Gmail email body often has class 'a3s' or is inside 'role=main'
    // We scan all anchor tags to be robust
    const links = document.querySelectorAll('a[href]:not([data-scam-checked="true"])');

    links.forEach(link => {
        const url = link.href;
        if (!url || url.startsWith('javascript:') || url.startsWith('#')) return;

        if (checkedLinks.has(url)) {
            markLink(link, checkedLinks.get(url)); // Re-apply if dom refreshed
            link.setAttribute('data-scam-checked', 'true');
            return;
        }

        link.setAttribute('data-scam-checked', 'true'); // Optimistic mark

        try {
            chrome.runtime.sendMessage({ action: 'checkUrl', url: url }, (response) => {
                if (chrome.runtime.lastError) {
                    // Suppress "Extension context invalidated" error on reload
                    // console.warn('Runtime error:', chrome.runtime.lastError.message);
                    return;
                }
                if (response) {
                    // It is a scam/fraud site
                    console.log("[NoMoreScam] Detected in Gmail:", url, response);
                    checkedLinks.add(url);
                    markLink(link, response);
                }
            });
        } catch (e) {
            // Context invalidated
        }
    });
}

function markLink(element, fraudInfo) {
    if (element.getAttribute('data-scam-warned') === 'true') return;

    element.style.border = "2px solid #d93025";
    element.style.backgroundColor = "rgba(217, 48, 37, 0.1)";
    element.setAttribute('data-scam-warned', 'true');
    element.title = `⚠️ 警告：此連結可能為詐騙！\n來源: ${fraudInfo.name}`;

    const warnSpan = document.createElement('span');
    warnSpan.innerText = " ⚠️(詐騙)";
    warnSpan.style.color = "#d93025";
    warnSpan.style.fontWeight = "bold";
    warnSpan.style.fontSize = "12px";
    warnSpan.style.marginLeft = "4px";

    element.parentNode.insertBefore(warnSpan, element.nextSibling);

    const emailContainer = element.closest('.a3s');
    if (emailContainer && !emailContainer.getAttribute('data-scam-banner')) {
        const banner = document.createElement('div');
        banner.style.backgroundColor = "#d93025";
        banner.style.color = "white";
        banner.style.padding = "10px";
        banner.style.marginBottom = "10px";
        banner.style.borderRadius = "4px";
        banner.style.fontWeight = "bold";
        banner.style.textAlign = "center";
        banner.innerText = "⚠️ 警告：本郵件包含已知的詐騙連結，請勿點擊！";

        emailContainer.insertBefore(banner, emailContainer.firstChild);
        emailContainer.setAttribute('data-scam-banner', 'true');
    }
}

// Mark Impersonation
function markGovImpersonation(element, result) {
    element.style.backgroundColor = "rgba(217, 48, 37, 0.2)";
    element.style.borderBottom = "2px solid #d93025";
    element.title = `⚠️ 警告：這可能不是官方郵件！\nAI 判定信心: ${result.confidence}%\n理由: ${result.reason}`;

    const warnBadge = document.createElement('span');
    warnBadge.innerText = " ⚠️(偽冒??)";
    warnBadge.style.color = "#d93025";
    warnBadge.style.fontWeight = "bold";
    warnBadge.style.fontSize = "12px";
    warnBadge.style.marginLeft = "5px";

    element.parentNode.insertBefore(warnBadge, element.nextSibling);

    // Warn banner for high confidence
    if (result.confidence > 70) {
        const emailContainer = element.closest('.gs') || element.closest('.a3s');
        if (emailContainer && !emailContainer.querySelector('.gov-scam-banner')) {
            const banner = document.createElement('div');
            banner.className = 'gov-scam-banner';
            banner.style.backgroundColor = "#d93025";
            banner.style.color = "white";
            banner.style.padding = "10px";
            banner.style.margin = "10px 0";
            banner.style.borderRadius = "4px";
            banner.style.fontWeight = "bold";
            banner.style.textAlign = "center";
            banner.innerText = `⚠️ 高度警示：此郵件宣稱來自「${result.claimedName}」但非使用官方信箱！請勿輕信！`;

            // Insert after header or top of body
            emailContainer.prepend(banner);
        }
    }
}

// Mark Authentic (Optional, for reassurance)
function markGovAuthentic(element, result) {
    const safeBadge = document.createElement('span');
    safeBadge.innerText = " ✅(官方驗證)";
    safeBadge.style.color = "#188038";
    safeBadge.style.fontWeight = "bold";
    safeBadge.style.fontSize = "12px";
    safeBadge.style.marginLeft = "5px";
    safeBadge.title = `AI 判定為官方郵件 (${result.reason})`;

    element.parentNode.insertBefore(safeBadge, element.nextSibling);
}

async function scanEmailBody() {
    // Gmail open email body container usually has class 'a3s'
    const emailBodies = document.querySelectorAll('.a3s');

    for (const body of emailBodies) {
        if (body.getAttribute('data-gov-body-checked') === 'true') continue;

        // Check Quota before scanning
        try {
            const response = await chrome.runtime.sendMessage({ action: 'checkQuota', type: 'email' });
            if (!response || !response.canScan) {
                // Quota Exceeded - Stop processing this batch
                // console.log('[NoMoreScam] Email Limit Reached'); 
                return;
            }

            // Increment Quota (Count this email)
            chrome.runtime.sendMessage({ action: 'incrementQuota', type: 'email' });
        } catch (e) {
            console.error('Quota check failed', e);
        }

        body.setAttribute('data-gov-body-checked', 'true');

        const text = body.innerText;

        if (typeof containsGovKeyword === 'function' && containsGovKeyword(text)) {
            // Find the sender for this email. 
            // Structure is usually: .gs (email container) > 
            const container = body.closest('.gs');
            if (!container) continue;

            const senderElem = container.querySelector('.gD');
            if (!senderElem) continue;

            const email = senderElem.getAttribute('email');
            if (!email) continue;

            // Check if sender is gov.tw
            if (!email.endsWith('.gov.tw')) {
                console.log(`[NoMoreScam] Detected potentially fake gov email from: ${email}`);
                // Show Warning
                markGovBodyImpersonation(body, email);
            }
        }
    }
}

function markGovBodyImpersonation(bodyElement, senderEmail) {
    const container = bodyElement.closest('.gs');
    if (container && !container.querySelector('.gov-impersonation-alert')) {
        const banner = document.createElement('div');
        banner.className = 'gov-impersonation-alert';
        banner.style.backgroundColor = "#d93025";
        banner.style.color = "white";
        banner.style.padding = "15px";
        banner.style.margin = "10px 0";
        banner.style.borderRadius = "8px";
        banner.style.fontWeight = "bold";
        banner.style.textAlign = "center";
        banner.style.fontSize = "14px";
        banner.style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)";
        banner.innerHTML = `
            <div style="font-size: 1.2em; margin-bottom: 5px;">⚠️ 警告：疑似假冒政府機關郵件</div>
            <div>此郵件內容包含政府機關關鍵字，但寄件者信箱 (<strong>${senderEmail}</strong>) 並非政府官方網域 (.gov.tw)。</div>
            <div style="margin-top: 5px; font-weight: normal; font-size: 0.9em;">請小心查證，切勿直接提供個資或匯款。</div>
        `;

        // Insert before the body content
        bodyElement.parentNode.insertBefore(banner, bodyElement);
    }
}
