// Gmail Scam Filter
console.log("[NoMoreScam] Gmail Filter Loaded (Production v1.1)");

const GMAIL_DAILY_RISK_DISMISSALS_KEY = 'dailyRiskDismissals';
const GMAIL_UPGRADE_URL = 'https://nomorescamtw.web.app/';
let checkedLinks = new Map();
let debounceTimer = null;
let dailyRiskDismissalsCache = { gmailEmails: {}, gmailDomains: {} };

function getGmailLocalDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function normalizeEmail(email) {
    return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function getEmailDomain(email) {
    const normalized = normalizeEmail(email);
    const atIndex = normalized.lastIndexOf('@');
    return atIndex > 0 ? normalized.substring(atIndex + 1) : '';
}

function emailWhitelistIncludes(list, email) {
    const normalizedEmail = normalizeEmail(email);
    const domain = getEmailDomain(normalizedEmail);
    return Array.isArray(list) && list.some(item => {
        const normalizedItem = normalizeEmail(item);
        if (normalizedItem.startsWith('*@')) {
            return domain === normalizedItem.substring(2);
        }
        return normalizedItem === normalizedEmail;
    });
}

function updateDailyRiskCache(stored) {
    const source = stored && typeof stored === 'object' ? stored : {};
    dailyRiskDismissalsCache = {
        gmailEmails: source.gmailEmails && typeof source.gmailEmails === 'object'
            ? source.gmailEmails
            : {},
        gmailDomains: source.gmailDomains && typeof source.gmailDomains === 'object'
            ? source.gmailDomains
            : {}
    };
}

function isGmailRiskDismissedSync(email) {
    const normalizedEmail = normalizeEmail(email);
    const domain = getEmailDomain(normalizedEmail);
    const today = getGmailLocalDateKey();
    return Boolean(
        normalizedEmail &&
        (
            dailyRiskDismissalsCache.gmailEmails[normalizedEmail] === today ||
            (domain && dailyRiskDismissalsCache.gmailDomains[domain] === today)
        )
    );
}

function checkGmailRiskDismissed(email, callback) {
    chrome.storage.local.get(GMAIL_DAILY_RISK_DISMISSALS_KEY, (result) => {
        if (chrome.runtime.lastError) {
            callback(false);
            return;
        }
        updateDailyRiskCache(result[GMAIL_DAILY_RISK_DISMISSALS_KEY]);
        callback(isGmailRiskDismissedSync(email));
    });
}

chrome.storage.local.get(GMAIL_DAILY_RISK_DISMISSALS_KEY, (result) => {
    if (!chrome.runtime.lastError) {
        updateDailyRiskCache(result[GMAIL_DAILY_RISK_DISMISSALS_KEY]);
    }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[GMAIL_DAILY_RISK_DISMISSALS_KEY]) {
        updateDailyRiskCache(changes[GMAIL_DAILY_RISK_DISMISSALS_KEY].newValue);
    }
});

function getSenderElementForNode(node) {
    const container = node && node.closest ? node.closest('.gs') : null;
    return (container && container.querySelector('.gD[email]')) ||
        document.querySelector('span.gD[email]');
}

function removeGmailWarningsForSender(email, scope = 'email') {
    const normalizedEmail = normalizeEmail(email);
    const selectedDomain = getEmailDomain(normalizedEmail);
    document.querySelectorAll('.gD[email]').forEach(sender => {
        const senderEmail = normalizeEmail(sender.getAttribute('email'));
        const matches = scope === 'domain'
            ? getEmailDomain(senderEmail) === selectedDomain
            : senderEmail === normalizedEmail;
        if (!matches) return;
        const container = sender.closest('.gs');
        if (!container) return;

        container.querySelectorAll(
            '.blacklist-alert, .gov-scam-banner, .gov-impersonation-alert, .scam-link-alert'
        ).forEach(element => element.remove());
        container.querySelectorAll('.gov-warn-badge, .scam-link-badge')
            .forEach(element => element.remove());
        container.querySelectorAll('[data-scam-warned="true"]').forEach(link => {
            link.style.border = '';
            link.style.backgroundColor = '';
            link.title = '';
            link.removeAttribute('data-scam-warned');
        });
        container.querySelectorAll('[data-scam-banner]').forEach(body => {
            body.removeAttribute('data-scam-banner');
        });

        const emailPart = sender.parentElement ? sender.parentElement.querySelector('.go') : null;
        [sender, emailPart].filter(Boolean).forEach(element => {
            element.style.backgroundColor = '';
            element.style.borderBottom = '';
            element.title = '';
        });
    });
}

function showGmailNotice(senderElem, message) {
    const container = senderElem && senderElem.closest
        ? senderElem.closest('.gs')
        : null;
    if (!container) return;

    const oldNotice = container.querySelector('.nms-gmail-notice');
    if (oldNotice) oldNotice.remove();

    const notice = document.createElement('div');
    notice.className = 'nms-gmail-notice';
    notice.textContent = message;
    notice.style.background = '#e6f4ea';
    notice.style.color = '#137333';
    notice.style.border = '1px solid #a8dab5';
    notice.style.padding = '10px';
    notice.style.margin = '8px 0';
    notice.style.borderRadius = '6px';
    notice.style.fontWeight = '500';
    container.prepend(notice);
    setTimeout(() => {
        if (notice.isConnected) notice.remove();
    }, 8000);
}

function showGmailScopeChooser(button, email, title, onSelect) {
    const normalizedEmail = normalizeEmail(email);
    const domain = getEmailDomain(normalizedEmail);
    if (!button || !normalizedEmail || !domain) return;

    const parent = button.parentElement;
    const existing = parent.querySelector('.nms-scope-chooser');
    if (existing) existing.remove();

    const chooser = document.createElement('div');
    chooser.className = 'nms-scope-chooser';
    chooser.style.marginTop = '10px';
    chooser.style.padding = '10px';
    chooser.style.background = 'rgba(255,255,255,.96)';
    chooser.style.color = '#202124';
    chooser.style.borderRadius = '6px';
    chooser.style.fontWeight = 'normal';

    const label = document.createElement('div');
    label.textContent = title;
    label.style.fontWeight = 'bold';
    label.style.marginBottom = '8px';
    chooser.appendChild(label);

    const choices = [
        { scope: 'email', text: `僅此寄件者：${normalizedEmail}` },
        { scope: 'domain', text: `整個寄件網域：@${domain}` }
    ];
    choices.forEach(choice => {
        const choiceButton = document.createElement('button');
        choiceButton.textContent = choice.text;
        choiceButton.style.display = 'block';
        choiceButton.style.width = '100%';
        choiceButton.style.margin = '5px 0';
        choiceButton.style.padding = '7px';
        choiceButton.addEventListener('click', (event) => {
            event.stopPropagation();
            chooser.remove();
            onSelect(choice.scope);
        });
        chooser.appendChild(choiceButton);
    });

    const cancelButton = document.createElement('button');
    cancelButton.textContent = '取消';
    cancelButton.style.marginTop = '5px';
    cancelButton.addEventListener('click', (event) => {
        event.stopPropagation();
        chooser.remove();
    });
    chooser.appendChild(cancelButton);
    parent.appendChild(chooser);
}

function dismissGmailRiskToday(email, scope, callback) {
    const normalizedEmail = normalizeEmail(email);
    const domain = getEmailDomain(normalizedEmail);
    chrome.runtime.sendMessage({
        action: 'dismissRiskToday',
        scope: scope === 'domain' ? 'gmail_domain' : 'gmail_email',
        value: scope === 'domain' ? domain : normalizedEmail
    }, (response) => {
        if (response && response.success) {
            const today = getGmailLocalDateKey();
            if (scope === 'domain') dailyRiskDismissalsCache.gmailDomains[domain] = today;
            else dailyRiskDismissalsCache.gmailEmails[normalizedEmail] = today;
            callback(true);
        } else {
            callback(false);
        }
    });
}

function showGmailUpgrade(container, message, upgradeUrl = GMAIL_UPGRADE_URL) {
    let status = container.querySelector('.nms-action-status');
    if (!status) {
        status = document.createElement('div');
        status.className = 'nms-action-status';
        container.appendChild(status);
    }
    status.textContent = message;
    status.style.marginTop = '10px';
    status.style.padding = '8px';
    status.style.background = '#fce8e6';
    status.style.color = '#b3261e';
    status.style.borderRadius = '4px';

    const upgradeButton = document.createElement('button');
    upgradeButton.textContent = '升級年費 NT$499';
    upgradeButton.style.display = 'block';
    upgradeButton.style.margin = '8px auto 0';
    upgradeButton.addEventListener('click', (event) => {
        event.stopPropagation();
        window.open(upgradeUrl, '_blank', 'noopener');
    });
    status.appendChild(upgradeButton);
}

function addGmailWhitelistEntry(senderElem, scope, button) {
    const email = normalizeEmail(senderElem && senderElem.getAttribute('email'));
    const domain = getEmailDomain(email);
    if (!email || !domain) return;
    if (button) {
        button.disabled = true;
        button.textContent = '加入中...';
    }

    chrome.runtime.sendMessage({
        action: 'addUserWhitelistEntry',
        entryType: scope === 'domain' ? 'email_domain' : 'email',
        value: scope === 'domain' ? domain : email
    }, (response) => {
        if (response && response.success) {
            removeGmailWarningsForSender(email, scope);
            showGmailNotice(
                senderElem,
                scope === 'domain'
                    ? `已永久加入寄件網域白名單：@${domain}`
                    : `已永久加入寄件者白名單：${email}`
            );
            return;
        }

        if (response && response.status === 'limit_reached') {
            showGmailUpgrade(
                button.parentElement,
                response.message,
                response.upgradeUrl
            );
        } else {
            const status = button.parentElement.querySelector('.nms-action-status') ||
                document.createElement('div');
            status.className = 'nms-action-status';
            status.textContent = '白名單儲存失敗，請稍後重試。';
            status.style.marginTop = '8px';
            if (!status.parentElement) button.parentElement.appendChild(status);
        }
        if (button) {
            button.disabled = false;
            button.textContent = '永久加入白名單';
        }
    });
}

function attachGmailWarningActions(banner, senderElem, bodyElem = null) {
    if (!banner || banner.querySelector('.nms-gmail-actions')) return;
    const email = normalizeEmail(senderElem && senderElem.getAttribute('email'));
    if (!email || isGmailRiskDismissedSync(email)) {
        if (banner) banner.remove();
        return;
    }

    const actions = document.createElement('div');
    actions.className = 'nms-gmail-actions';
    actions.style.marginTop = '10px';

    const skipButton = document.createElement('button');
    skipButton.textContent = '略過（今日不再提示）';
    skipButton.style.margin = '4px';
    skipButton.addEventListener('click', (event) => {
        event.stopPropagation();
        showGmailScopeChooser(skipButton, email, '選擇今日略過範圍', (scope) => {
            dismissGmailRiskToday(email, scope, (saved) => {
                if (saved) {
                    removeGmailWarningsForSender(email, scope);
                    showGmailNotice(
                        senderElem,
                        scope === 'domain'
                            ? `今日不再提示寄件網域 @${getEmailDomain(email)} 的風險；若要永久避免，請加入白名單。`
                            : `今日不再提示寄件者 ${email} 的風險；若要永久避免，請加入白名單。`
                    );
                } else {
                    showGmailNotice(senderElem, '僅略過本次；今日略過設定未能保存。');
                    banner.remove();
                }
            });
        });
    });

    const reportButton = document.createElement('button');
    reportButton.textContent = '回報非詐騙';
    reportButton.style.margin = '4px';
    reportButton.addEventListener('click', (event) => {
        event.stopPropagation();
        showGmailScopeChooser(reportButton, email, '選擇回報成功後的今日略過範圍', (scope) => {
            reportGmailFalsePositive(reportButton, senderElem, bodyElem, scope);
        });
    });

    const whitelistButton = document.createElement('button');
    whitelistButton.textContent = '永久加入白名單';
    whitelistButton.style.margin = '4px';
    whitelistButton.addEventListener('click', (event) => {
        event.stopPropagation();
        showGmailScopeChooser(whitelistButton, email, '選擇永久白名單範圍', (scope) => {
            addGmailWhitelistEntry(senderElem, scope, whitelistButton);
        });
    });

    actions.append(skipButton, reportButton, whitelistButton);
    banner.appendChild(actions);
}

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

// Local cache for Brand Rules (fetched from storage)
let brandRules = [];

// Initialize rules from storage
chrome.storage.local.get('brandRules', (res) => {
    if (res.brandRules) {
        brandRules = res.brandRules;
        console.log('[NoMoreScam] Brand Rules Loaded:', brandRules.length);
    }
});

// NOTE: We keep '165' and '反詐騙' in exclusion list to avoid flagging legitimate footers 
// UNLESS user strxsictly wants them triggered. The user said: 
// "如果gmail網域 信件內文偵測到政府機關關鍵字 ，則判斷寄件者是不是gov.tw"
// This implies NO exclusion. If body has '165', and sender is NOT gov.tw -> WARN.
// So I will empty the exclusion list based on strict interpretation.
const EXCLUDED_BODY_KEYWORDS = [];
const MAX_REPORT_BODY_LENGTH = 4000;

function getCurrentOpenedEmailReportData() {
    const openedSender = document.querySelector('span.gD[email]');
    const subjectElem = document.querySelector('h2.hP');
    const bodyElem = document.querySelector('.a3s.aiL') || document.querySelector('.a3s');

    const email = openedSender ? openedSender.getAttribute('email') : '';
    const senderName = openedSender ? (openedSender.name || openedSender.innerText || openedSender.textContent || '') : '';
    const subject = subjectElem ? (subjectElem.innerText || subjectElem.textContent || '') : '';
    const body = bodyElem ? (bodyElem.innerText || bodyElem.textContent || '') : '';

    return {
        email: email ? email.trim().toLowerCase() : '',
        senderName: senderName.trim(),
        subject: subject.trim(),
        body: body.trim().slice(0, MAX_REPORT_BODY_LENGTH)
    };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getCurrentGmailReportData') {
        sendResponse(getCurrentOpenedEmailReportData());
        return false;
    }
});

// Split scanning to prevent context pollution
function scanSender() {
    scanOpenedEmail();
    // scanListEmails(); // Disabled per user request (Don't scan in Inbox)
}

function scanOpenedEmail() {
    // 1. Opened Email View (Single Sender)
    // Selector: span.gD[email] (Standard for opened email)
    const openedSender = document.querySelector('span.gD[email]');

    // Get Subject
    const subjectElem = document.querySelector('h2.hP');
    const subject = subjectElem ? subjectElem.innerText.replace(/ - Gmail$/, '') : '';

    if (openedSender) {
        const email = normalizeEmail(openedSender.getAttribute('email'));
        if (!email) return;

        // Daily dismissals must be checked before quota is consumed.
        checkGmailRiskDismissed(email, (isDismissed) => {
            if (isDismissed) {
                openedSender.setAttribute('data-gov-checked', 'true');
                removeGmailWarningsForSender(email);
                return;
            }

        // Logic: Check Quota -> If allowed -> Increment (if new) -> Scan
        chrome.runtime.sendMessage({ action: 'checkQuota', type: 'email' }, (response) => {
            if (chrome.runtime.lastError || !response || !response.canScan) {
                // Quota Exceeded -> Show Promo Banner
                showQuotaExceededBanner(openedSender);
                return; // Quota exceeded or error
            }

            // Increment Quota (Once per email view)
            if (!openedSender.getAttribute('data-quota-counted')) {
                openedSender.setAttribute('data-quota-counted', 'true');
                try {
                    chrome.runtime.sendMessage({ action: 'incrementQuota', type: 'email' });
                } catch (e) {
                    // Context invalidated
                }
            }

            if (!openedSender.getAttribute('data-gov-checked')) {
                const name = openedSender.name || openedSender.innerText || openedSender.textContent;

                // 1. Check Whitelist (Local + Sync) first!
                checkUserWhitelist(email, (isWhitelisted) => {
                    if (isWhitelisted) {
                        return;
                    }

                    // 2. Check Remote Blacklist
                    checkRemoteBlacklist(email, (isBlacklisted) => {
                        if (isBlacklisted) {
                            console.log(`[NoMoreScam] Blacklisted Email Detected: ${email}`);
                            markBlacklistedSender(openedSender, email);
                            openedSender.setAttribute('data-gov-checked', 'true');
                            return;
                        }

                        // Check Name OR Subject
                        const govMatch = containsGovKeyword(name) || (subject ? containsGovKeyword(subject) : false);
                        let bankMatch = null;
                        if (typeof getBankMatch === 'function') {
                            bankMatch = getBankMatch(name) || (subject ? getBankMatch(subject) : null);
                        }
                        let brandMatch = null;
                        if (typeof getBrandMatch === 'function') {
                            brandMatch = getBrandMatch(name) || (subject ? getBrandMatch(subject) : null);
                        }

                        if (govMatch) {
                            processGovSender(openedSender, name, email, subject, true);
                        } else if (bankMatch) {
                            processBankSender(openedSender, name, email, subject, bankMatch);
                        } else if (brandMatch) {
                            processBrandSender(openedSender, name, email, subject, brandMatch);
                        }

                        // Mark checked even if no match to avoid re-scanning
                        if (!govMatch && !bankMatch && !brandMatch) {
                            openedSender.setAttribute('data-gov-checked', 'true');
                        }
                    });
                });
            }
        });
        });
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

        checkUserWhitelist(email, (isWhitelisted) => {
            if (isWhitelisted) {
                senderElem.setAttribute('data-gov-checked', 'true');
                return;
            }

            checkRemoteBlacklist(email, (isBlacklisted) => {
                if (isBlacklisted) {
                    markBlacklistedSender(senderElem, email, true); // true for list view mode (less intrusive?)
                    senderElem.setAttribute('data-gov-checked', 'true');
                    return;
                }

                // Check Name ONLY
                const govMatch = containsGovKeyword(name);
                let bankMatch = null;
                if (typeof getBankMatch === 'function') {
                    bankMatch = getBankMatch(name);
                }
                let brandMatch = null;
                if (typeof getBrandMatch === 'function') {
                    brandMatch = getBrandMatch(name);
                }

                if (govMatch) {
                    processGovSender(senderElem, name, email, null, true);
                } else if (bankMatch) {
                    processBankSender(senderElem, name, email, null, bankMatch);
                } else if (brandMatch) {
                    processBrandSender(senderElem, name, email, null, brandMatch);
                } else {
                    senderElem.setAttribute('data-gov-checked', 'true');
                }
            });
        });
    });
}

function processGovSender(senderElem, name, email, subject, isMatch) {
    senderElem.setAttribute('data-gov-checked', 'true');

    if (!isMatch || isGmailRiskDismissedSync(email)) return;

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

        // Notify Background: Warning + Badge
        chrome.runtime.sendMessage({ action: 'incrementStat', statName: 'total_warnings' });
        chrome.runtime.sendMessage({ action: 'updateBadge', text: '1', color: '#d93025' });
    }
}

function processBrandSender(senderElem, name, email, subject, brandInfo) {
    senderElem.setAttribute('data-gov-checked', 'true');

    if (!brandInfo || isGmailRiskDismissedSync(email)) return;

    const emailDomain = email.split('@')[1];
    if (!emailDomain) return;

    let isOfficial = brandInfo.official_domains.some(domain => {
        return emailDomain === domain || emailDomain.endsWith('.' + domain);
    });

    if (isOfficial) {
        markGovAuthentic(senderElem, {
            isScam: false,
            reason: `品牌官方網域驗證 (${brandInfo.official_domains[0]})`
        });
    } else {
        console.log(`[NoMoreScam] BRAND IMPERSONATION DETECTED! Name: "${name}" <${email}>`);

        markGovImpersonation(senderElem, {
            isScam: true,
            confidence: 100,
            reason: `非官方信箱寄出的品牌郵件 (包含關鍵字「${brandInfo.keyword}」)`,
            claimedName: brandInfo.name
        });

        chrome.runtime.sendMessage({ action: 'incrementStat', statName: 'total_warnings' });
        chrome.runtime.sendMessage({ action: 'updateBadge', text: '1', color: '#d93025' });
    }
}

/**
 * Checks if text matches any brand keywords from remote config.
 */
function getBrandMatch(text) {
    if (!text || !brandRules || brandRules.length === 0) return null;
    const lowerText = text.toLowerCase();

    for (const rule of brandRules) {
        if (lowerText.includes(rule.keyword.toLowerCase())) {
            return rule;
        }
    }
    return null;
}

function scanLinks() {
    // Gmail email body often has class 'a3s' or is inside 'role=main'
    // We scan all anchor tags to be robust
    const links = document.querySelectorAll('a[href]:not([data-scam-checked="true"])');

    links.forEach(link => {
        const url = link.href;
        if (!url || url.startsWith('javascript:') || url.startsWith('#')) return;
        const senderElem = getSenderElementForNode(link);
        const senderEmail = normalizeEmail(senderElem && senderElem.getAttribute('email'));

        const scanLink = () => {
            if (checkedLinks.has(url)) {
                markLink(link, checkedLinks.get(url));
                link.setAttribute('data-scam-checked', 'true');
                return;
            }

            link.setAttribute('data-scam-checked', 'true');

            try {
                chrome.runtime.sendMessage({ action: 'checkUrl', url: url }, (response) => {
                    if (chrome.runtime.lastError) return;
                    if (response) {
                        console.log("[NoMoreScam] Detected in Gmail:", url, response);
                        checkedLinks.set(url, response);
                        markLink(link, response);
                    }
                });
            } catch (e) {
                // Context invalidated
            }
        };

        if (!senderEmail) {
            scanLink();
            return;
        }
        checkGmailRiskDismissed(senderEmail, (isDismissed) => {
            if (!isDismissed) scanLink();
        });
    });
}

function markLink(element, fraudInfo) {
    if (element.getAttribute('data-scam-warned') === 'true') return;
    const senderElem = getSenderElementForNode(element);
    const senderEmail = normalizeEmail(senderElem && senderElem.getAttribute('email'));
    if (senderEmail && isGmailRiskDismissedSync(senderEmail)) return;

    element.style.border = "2px solid #d93025";
    element.style.backgroundColor = "rgba(217, 48, 37, 0.1)";
    element.setAttribute('data-scam-warned', 'true');
    element.title = `⚠️ 警告：此連結可能為詐騙！\n來源: ${fraudInfo.name}`;

    const warnSpan = document.createElement('span');
    warnSpan.className = 'scam-link-badge';
    warnSpan.innerText = " ⚠️(詐騙)";
    warnSpan.style.color = "#d93025";
    warnSpan.style.fontWeight = "bold";
    warnSpan.style.fontSize = "12px";
    warnSpan.style.marginLeft = "4px";

    element.parentNode.insertBefore(warnSpan, element.nextSibling);

    const emailContainer = element.closest('.a3s');
    if (emailContainer && !emailContainer.getAttribute('data-scam-banner')) {
        const banner = document.createElement('div');
        banner.className = 'scam-link-alert';
        banner.style.backgroundColor = "#d93025";
        banner.style.color = "white";
        banner.style.padding = "10px";
        banner.style.marginBottom = "10px";
        banner.style.borderRadius = "4px";
        banner.style.fontWeight = "bold";
        banner.style.textAlign = "center";
        const warningText = document.createElement('div');
        warningText.textContent = "⚠️ 警告：本郵件包含已知的詐騙連結，請勿點擊！";
        banner.appendChild(warningText);
        attachGmailWarningActions(banner, senderElem, emailContainer);

        emailContainer.insertBefore(banner, emailContainer.firstChild);
        emailContainer.setAttribute('data-scam-banner', 'true');
    }
}

function markBlacklistedSender(element, email, isListView = false) {
    const normalizedEmail = normalizeEmail(email);
    if (isGmailRiskDismissedSync(normalizedEmail)) return;

    // Highlight the sender
    const emailPart = element.parentElement ? element.parentElement.querySelector('.go') : null;
    const target = emailPart || element;

    target.style.backgroundColor = "rgba(217, 48, 37, 0.2)";
    target.style.borderBottom = "2px solid #d93025";
    target.title = `⚠️ 危險：此信箱 (${email}) 已被標記為惡意/詐騙來源！`;

    const warnBadge = document.createElement('span');
    warnBadge.className = 'gov-warn-badge';
    warnBadge.innerText = " ⛔(黑名單)";
    warnBadge.style.color = "#d93025";
    warnBadge.style.fontWeight = "bold";
    warnBadge.style.fontSize = "12px";
    warnBadge.style.marginLeft = "5px";

    element.parentNode.insertBefore(warnBadge, element.nextSibling);

    if (!isListView) {
        // Show Full Banner in Email View
        const emailContainer = element.closest('.gs') || element.closest('.a3s');
        if (emailContainer && !emailContainer.querySelector('.blacklist-alert')) {
            const banner = document.createElement('div');
            banner.className = 'blacklist-alert';
            banner.style.backgroundColor = "#d93025";
            banner.style.color = "white";
            banner.style.padding = "10px";
            banner.style.margin = "10px 0";
            banner.style.borderRadius = "4px";
            banner.style.fontWeight = "bold";
            banner.style.textAlign = "center";
            banner.innerHTML = `
                 <div style="font-size: 1.2em; margin-bottom: 5px;">⛔ 嚴重警告：此發件人 (${email}) 位於黑名單中！</div>
                 <div>此信箱已被確認為惡意或詐騙來源，請立即刪除此郵件，切勿點擊連結或回覆。</div>
             `;

            // Insert after header or top of body
            emailContainer.prepend(banner);
            attachGmailWarningActions(banner, element);
        }
    }
}

// Mark Impersonation
function markGovImpersonation(element, result) {
    const senderEmail = normalizeEmail(element && element.getAttribute('email'));
    if (isGmailRiskDismissedSync(senderEmail)) return;

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
    warnBadge.className = 'gov-warn-badge'; // Marked for removal
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
            `;

            // Insert after header or top of body
            emailContainer.prepend(banner);
            attachGmailWarningActions(banner, element);
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
    const openedSender = document.querySelector('span.gD[email]');
    const openedEmail = normalizeEmail(openedSender && openedSender.getAttribute('email'));
    if (!openedEmail || emailBodies.length === 0) return;

    checkGmailRiskDismissed(openedEmail, (isDismissed) => {
        if (isDismissed) {
            removeGmailWarningsForSender(openedEmail);
            return;
        }

    // Check Quota after daily dismissal.
    chrome.runtime.sendMessage({ action: 'checkQuota', type: 'email' }, (response) => {
        if (chrome.runtime.lastError || !response || !response.canScan) {
            // Quota Exceeded -> Show Promo Banner
            showQuotaExceededBanner(emailBodies[0]); // Only show once per body scan batch
            return;
        }

        for (const body of emailBodies) {
            if (body.getAttribute('data-gov-body-checked') === 'true') continue;

            body.setAttribute('data-gov-body-checked', 'true');
            // ... (rest of logic unchanged) ...

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

                // Check Blacklist first, then Whitelist
                checkUserWhitelist(email, (isWhitelisted) => {
                    if (isWhitelisted) {
                        // console.log(`[NoMoreScam] Whitelisted sender (Body Scan): ${email}`);
                        return;
                    }

                    checkRemoteBlacklist(email, (isBlacklisted) => {
                        if (isBlacklisted) {
                            markBlacklistedSender(body, email, true); // Use body warning
                            return;
                        }

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
                    });
                });
            }
        }
    });
    });
}

// Show Quota Exceeded Banner (New Function)
function showQuotaExceededBanner(anchorElement) {
    if (!anchorElement) return;

    // Use .gs (email container) or .a3s (body) or fallback
    const emailContainer = anchorElement.closest('.gs') || anchorElement.closest('.a3s');
    if (!emailContainer) return;

    if (emailContainer.querySelector('.quota-limit-banner')) return; // Already shown

    const banner = document.createElement('div');
    banner.className = 'quota-limit-banner';
    banner.style.backgroundColor = "#e8f0fe"; // Light blue
    banner.style.color = "#1967d2";
    banner.style.border = "1px solid #d2e3fc";
    banner.style.padding = "10px 15px";
    banner.style.margin = "10px 0";
    banner.style.borderRadius = "8px";
    banner.style.display = "flex";
    banner.style.alignItems = "center";
    banner.style.justifyContent = "space-between";
    banner.style.fontSize = "14px";
    banner.style.boxShadow = "0 1px 3px rgba(0,0,0,0.1)";

    banner.innerHTML = `
        <div style="display: flex; align-items: center;">
            <span style="font-size: 1.2em; margin-right: 8px;">🛡️</span>
            <div>
                <strong>麥騙 - 今日 Email 掃描額度已滿</strong>
                <div style="font-size: 0.9em; margin-top: 2px; color: #5f6368;">升級進階版，享受無限量 AI 偵測與完整白名單功能。</div>
            </div>
        </div>
        <button class="upgrade-btn" style="background: #1a73e8; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: 500;">
            立即升級
        </button>
    `;

    // Insert at the top
    emailContainer.prepend(banner);

    // Bind Button
    const btn = banner.querySelector('.upgrade-btn');
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.open('https://nomorescamtw.web.app/', '_blank');
    });
}

function markGovBodyImpersonation(bodyElement, senderEmail, senderElem, keyword) {
    if (isGmailRiskDismissedSync(senderEmail)) return;
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
        `;

        // Insert before the body content
        bodyElement.parentNode.insertBefore(banner, bodyElement);

        attachGmailWarningActions(banner, senderElem, bodyElement);
    }
}

function reportGmailFalsePositive(btn, senderElem, bodyElem, dismissalScope) {
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
            dismissGmailRiskToday(senderEmail, dismissalScope, (saved) => {
                if (saved) {
                    removeGmailWarningsForSender(senderEmail, dismissalScope);
                    showGmailNotice(
                        senderElem,
                        dismissalScope === 'domain'
                            ? `已收到回報。今日不再提示寄件網域 @${getEmailDomain(senderEmail)} 的風險。`
                            : `已收到回報。今日不再提示寄件者 ${normalizeEmail(senderEmail)} 的風險。`
                    );
                } else {
                    btn.textContent = '✅ 已回報，但略過設定儲存失敗';
                    btn.disabled = false;
                }
            });
        } else {
            btn.textContent = '❌ 回報失敗，請重試';
            btn.disabled = false;
        }
    });
}

// --- Whitelist Helper Functions ---

function checkRemoteBlacklist(email, callback) {
    if (!email) { callback(false); return; }
    const emailDomain = email.split('@')[1];

    chrome.storage.local.get(['remoteEmailBlacklist'], (res) => {
        const list = res.remoteEmailBlacklist;
        if (list && Array.isArray(list)) {
            const isBlacklisted = list.some(rule => {
                try {
                    // 1. 如果是標準的正則表示式 (例如 "/.*\\.kr$/i" 或 "/.*\\.kr$/")
                    if (rule.startsWith('/')) {
                        const match = rule.match(/^\/(.+)\/([a-z]*)$/);
                        if (match) {
                            const regex = new RegExp(match[1], match[2] || 'i');
                            return regex.test(email);
                        }
                    }

                    // 2. 支援萬用字元轉換 (例如 "*.kr" 或 "admin@*.com")
                    // 將 . 等特殊字元轉義，並將 * 轉換為 .*
                    const escapedRule = rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
                    const regexStr = "^" + escapedRule.replace(/\*/g, '.*') + "$";
                    const regex = new RegExp(regexStr, 'i');

                    // 測試完整 email 或 domain
                    return regex.test(email) || (emailDomain && regex.test(emailDomain));
                } catch (e) {
                    console.error("[NoMoreScam] Invalid email blacklist rule:", rule, e);
                    // 退回普通的字串包含比對作為容錯
                    return email.includes(rule);
                }
            });
            callback(isBlacklisted);
        } else {
            callback(false);
        }
    });
}

/**
 * Checks if email is in user whitelist (Local or Sync).
 */
function checkUserWhitelist(email, callback) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) { callback(false); return; }

    // 1. Check Local (User Whitelist & Remote Whitelists)
    chrome.storage.local.get(['userWhitelist', 'remoteWhitelist', 'remoteEmailWhitelist'], (localRes) => {
        // User Whitelist
        if (emailWhitelistIncludes(localRes.userWhitelist, normalizedEmail)) {
            callback(true);
            return;
        }

        // Remote Email Whitelist
        if (emailWhitelistIncludes(localRes.remoteEmailWhitelist, normalizedEmail)) {
            // console.log(`[NoMoreScam] Whitelisted by Remote Email List: ${email}`);
            callback(true);
            return;
        }

        // Remote Domain Whitelist
        if (localRes.remoteWhitelist && Array.isArray(localRes.remoteWhitelist)) {
            const domain = getEmailDomain(normalizedEmail);
            if (domain) {
                const isRemoteWhitelisted = localRes.remoteWhitelist.some(allowed =>
                    domain === String(allowed).toLowerCase() ||
                    domain.endsWith('.' + String(allowed).toLowerCase())
                );
                if (isRemoteWhitelisted) {
                    // console.log(`[NoMoreScam] Whitelisted by Remote Domain List: ${domain}`);
                    callback(true);
                    return;
                }
            }
        }

        // 2. Check Sync (If available)
        try {
            chrome.storage.sync.get('userWhitelist', (syncRes) => {
                if (emailWhitelistIncludes(syncRes.userWhitelist, normalizedEmail)) {
                    callback(true);
                } else {
                    callback(false);
                }
            });
        } catch (e) {
            callback(false);
        }
    });
}

// Run once after Gmail's initial message view has settled. MutationObserver handles later changes.
setTimeout(() => {
    scanLinks();
    scanSender();
    scanEmailBody();
}, 1000);
