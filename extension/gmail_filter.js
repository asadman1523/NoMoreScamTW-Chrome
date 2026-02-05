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
const verifiedSenders = new Map();

// NOTE: We keep '165' and '反詐騙' in exclusion list to avoid flagging legitimate footers 
// UNLESS user strxsictly wants them triggered. The user said: 
// "如果gmail網域 信件內文偵測到政府機關關鍵字 ，則判斷寄件者是不是gov.tw"
// This implies NO exclusion. If body has '165', and sender is NOT gov.tw -> WARN.
// So I will empty the exclusion list based on strict interpretation.
const EXCLUDED_BODY_KEYWORDS = [];

// Split scanning to prevent context pollution
function scanSender() {
    scanOpenedEmail();
    scanListEmails();
}

function scanOpenedEmail() {
    // 1. Opened Email View (Single Sender)
    // Selector: span.gD[email] (Standard for opened email)
    const openedSender = document.querySelector('span.gD[email]');

    // Get Subject
    const subjectElem = document.querySelector('h2.hP');
    const subject = subjectElem ? subjectElem.innerText.replace(/ - Gmail$/, '') : '';

    if (openedSender && !openedSender.getAttribute('data-gov-checked')) {
        const name = openedSender.name || openedSender.innerText || openedSender.textContent;
        const email = openedSender.getAttribute('email');

        // Check Name OR Subject
        const govMatch = containsGovKeyword(name) || (subject ? containsGovKeyword(subject) : false);
        let bankMatch = null;
        if (typeof getBankMatch === 'function') {
            bankMatch = getBankMatch(name) || (subject ? getBankMatch(subject) : null);
        }

        // Log for debugging
        // console.log(`[NoMoreScam] Scan Opened: ${name} <${email}> | Gov: ${govMatch} | Bank: ${bankMatch}`);

        if (govMatch) {
            processGovSender(openedSender, name, email, subject, true);
        } else if (bankMatch) {
            processBankSender(openedSender, name, email, subject, bankMatch);
        }

        // Mark checked even if no match to avoid re-scanning
        if (!govMatch && !bankMatch) {
            openedSender.setAttribute('data-gov-checked', 'true');
        }
    }
}

function scanListEmails() {
    // 2. List View (Inbox Rows)
    // Selector: tr.zA span[email] (Standard for list items)
    // We STRICTLY check Name only. Subject is irrelevant/unavailable per row.
    const listSenders = document.querySelectorAll('tr.zA span[email]:not([data-gov-checked="true"])');

    listSenders.forEach(senderElem => {
        const name = senderElem.name || senderElem.innerText || senderElem.textContent;
        const email = senderElem.getAttribute('email');

        // Check Name ONLY
        const govMatch = containsGovKeyword(name);
        let bankMatch = null;
        if (typeof getBankMatch === 'function') {
            bankMatch = getBankMatch(name);
        }

        if (govMatch) {
            processGovSender(senderElem, name, email, null, true);
        } else if (bankMatch) {
            processBankSender(senderElem, name, email, null, bankMatch);
        } else {
            senderElem.setAttribute('data-gov-checked', 'true');
        }
    });
}

function processGovSender(senderElem, name, email, subject, isMatch) {
    senderElem.setAttribute('data-gov-checked', 'true');

    if (!isMatch) return;

    // Check if official domain
    let isOfficial = email.endsWith('.gov.tw');

    // Exception: Trusted Domain (e.g. ETC -> fetc.net.tw)
    if (!isOfficial && typeof isTrustedDomain === 'function') {
        if (isTrustedDomain((name + " " + (subject || "")), email)) {
            isOfficial = true;
        }
    }

    if (isOfficial) {
        // Official Gov Email - Mark Safe
        markGovAuthentic(senderElem, {
            isScam: false,
            reason: "官方網域驗證 (.gov.tw)"
        });
    } else {
        // NON-Official Domain + Gov Keyword -> SCAM
        console.log(`[NoMoreScam] IMPERSONATION DETECTED! Name: "${name}" Subject: "${subject || 'N/A'}" <${email}>`);

        // Show Warning
        markGovImpersonation(senderElem, {
            isScam: true,
            confidence: 100,
            reason: `非官方信箱寄出的政府郵件 (標題/名稱包含關鍵字)`,
            claimedName: "政府機關"
        });
    }
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
    // element is usually the sender name span
    // In opened view, the email is in a sibling .go span
    const emailPart = element.parentElement ? element.parentElement.querySelector('.go') : null;

    if (emailPart) {
        // Highlight the email part instead of the name
        emailPart.style.backgroundColor = "rgba(217, 48, 37, 0.2)";
        emailPart.style.borderBottom = "2px solid #d93025";
        emailPart.title = `⚠️ 警告：這可能不是官方郵件！理由: ${result.reason}`;
    } else {
        // Fallback: Highlight name if email part not found (e.g. list view)
        element.style.backgroundColor = "rgba(217, 48, 37, 0.2)";
        element.style.borderBottom = "2px solid #d93025";
        element.title = `⚠️ 警告：這可能不是官方郵件！理由: ${result.reason}`;
    }

    const warnBadge = document.createElement('span');
    warnBadge.innerText = " ⚠️(政府Email應為 .gov.tw)";
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
            banner.innerHTML = `
                <div>⚠️ 高度警示：此郵件宣稱來自「${result.claimedName}」但並非使用官方信箱！請勿輕信！</div>
                <button class="gov-report-fp-btn" style="margin-top: 5px; background: white; color: #d93025; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.8em;">回報非詐騙 (誤判)</button>
            `;

            // Insert after header or top of body
            emailContainer.prepend(banner);

            // Bind Report Button
            const btn = banner.querySelector('.gov-report-fp-btn');
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                reportGmailFalsePositive(btn, element);
            });
        }
    }
}

// Mark Authentic (Optional, for reassurance)
function markGovAuthentic(element, result) {
    const safeBadge = document.createElement('span');
    safeBadge.innerText = " ✅(此域名已通過麥騙驗證)";
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



        body.setAttribute('data-gov-body-checked', 'true');

        const text = body.innerText;

        if (typeof containsGovKeyword === 'function' && containsGovKeyword(text)) {
            // STRICT RULE: If Body contains Gov Keyword -> Check Sender Domain
            // No exclusions applied as per user request.

            let triggerKeyword = null;
            if (typeof GOV_AGENCIES !== 'undefined') {
                for (const agency of GOV_AGENCIES) {
                    if (text.includes(agency)) {
                        triggerKeyword = agency;
                        break;
                    }
                }
            }

            // Find the sender for this email. 
            // Structure is usually: .gs (email container) > 
            const container = body.closest('.gs');
            if (!container) continue;

            const senderElem = container.querySelector('.gD');
            if (!senderElem) continue;

            const email = senderElem.getAttribute('email');
            if (!email) continue;

            // Check if sender is gov.tw
            let isAllowed = email.endsWith('.gov.tw');

            // Exception: Trusted Domain (e.g. ETC -> fetc.net.tw)
            if (!isAllowed && typeof isTrustedDomain === 'function') {
                // Check if the current trigger keyword or text implies a trusted domain
                if (isTrustedDomain(text, email)) {
                    isAllowed = true;
                }
            }

            if (!isAllowed) {
                console.log(`[NoMoreScam] Detected potentially fake gov email (Body Match): ${email}`);
                // Show Warning
                markGovBodyImpersonation(body, email, senderElem, triggerKeyword);
            }
        }
    }
}

function markGovBodyImpersonation(bodyElement, senderEmail, senderElem, keyword) {
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
            <div>此郵件內容包含政府機關關鍵字「<span style="color: #ffeb3b; text-decoration: underline;">${keyword || '未知'}</span>」，但寄件者信箱 (<strong>${senderEmail}</strong>) 並非政府官方網域 (.gov.tw)。</div>
            <div style="margin-top: 5px; font-weight: normal; font-size: 0.9em;">請小心查證，切勿直接提供個資或匯款。</div>
            <button class="gov-report-fp-btn" style="margin-top: 10px; background: white; color: #d93025; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">回報非詐騙 (誤判)</button>
        `;

        // Insert before the body content
        bodyElement.parentNode.insertBefore(banner, bodyElement);

        // Bind Report Button
        const btn = banner.querySelector('.gov-report-fp-btn');
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            reportGmailFalsePositive(btn, senderElem, bodyElement);
        });
    }
}

function reportGmailFalsePositive(btn, senderElem, bodyElem) {
    btn.disabled = true;
    btn.textContent = '回報中...';

    // Extract Info
    const senderName = senderElem ? (senderElem.name || senderElem.innerText) : 'Unknown';
    const senderEmail = senderElem ? senderElem.getAttribute('email') : 'Unknown';

    // Subject: Try to find h2.hP
    const subjectElem = document.querySelector('h2.hP');
    const subject = subjectElem ? subjectElem.innerText : document.title;

    // Snippet (First 200 chars of body)
    const snippet = bodyElem ? bodyElem.innerText.substring(0, 200) : 'No Content';

    chrome.runtime.sendMessage({
        action: 'reportFalsePositive',
        source: 'gmail',
        data: {
            sender: `${senderName} <${senderEmail}>`,
            subject: subject,
            snippet: snippet
        }
    }, (response) => {
        if (response && response.success) {
            btn.textContent = '✅ 已回報';
            btn.style.color = 'green';
            // Hide banner after delay
            setTimeout(() => {
                const banner = btn.closest('.gov-scam-banner') || btn.closest('.gov-impersonation-alert');
                if (banner) banner.style.display = 'none';
            }, 2000);
        } else {
            btn.textContent = '❌ 失敗';
            btn.disabled = false;
        }
    });
}
