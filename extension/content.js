const DAILY_RISK_DISMISSALS_KEY = 'dailyRiskDismissals';
let fraudGuardTimerId = null;

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'showWarning') {
    showWarning(request.fraudInfo);
  }
});

function normalizeDomainForMatch(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    .replace(/^www\./, '');
}

function matchesDomainEntry(hostname, allowed) {
  const normalizedHostname = normalizeDomainForMatch(hostname);
  const normalizedAllowed = normalizeDomainForMatch(allowed);

  if (!normalizedHostname || !normalizedAllowed) return false;

  return normalizedHostname === normalizedAllowed || normalizedHostname.endsWith('.' + normalizedAllowed);
}

function hideWarning() {
  closeWarningOverlay();
}

function reevaluateCurrentDomainWhitelist() {
  const hostname = window.location.hostname;
  if (!hostname) return;

  chrome.storage.local.get(['remoteWhitelist', 'userDomainWhitelist'], (result) => {
    if (chrome.runtime.lastError) return;

    const isUserWhitelisted = Array.isArray(result.userDomainWhitelist) &&
      result.userDomainWhitelist.some(allowed => matchesDomainEntry(hostname, allowed));

    const isRemoteWhitelisted = Array.isArray(result.remoteWhitelist) &&
      result.remoteWhitelist.some(allowed => matchesDomainEntry(hostname, allowed));

    if (isUserWhitelisted || isRemoteWhitelisted) {
      hideWarning();
    }
  });
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeHostname(hostname) {
  return typeof hostname === 'string' ? hostname.trim().toLowerCase() : '';
}

function isWebRiskDismissedInState(dismissals, hostname) {
  const entries = dismissals && dismissals.webHosts;
  const normalizedHostname = normalizeHostname(hostname);
  return Boolean(entries && normalizedHostname &&
    entries[normalizedHostname] === getLocalDateKey());
}

function isCurrentWebRiskDismissed(callback) {
  chrome.storage.local.get(DAILY_RISK_DISMISSALS_KEY, (result) => {
    if (chrome.runtime.lastError) {
      callback(false);
      return;
    }
    callback(isWebRiskDismissedInState(
      result[DAILY_RISK_DISMISSALS_KEY],
      window.location.hostname
    ));
  });
}

function closeWarningOverlay() {
  if (fraudGuardTimerId) {
    clearInterval(fraudGuardTimerId);
    fraudGuardTimerId = null;
  }
  const overlay = document.getElementById('fraud-guard-overlay');
  if (overlay) overlay.remove();
  document.body.style.overflow = '';
}

function showPageNotice(message, includeWhitelistAction = false) {
  const existing = document.getElementById('fraud-guard-notice');
  if (existing) existing.remove();

  const notice = document.createElement('div');
  notice.id = 'fraud-guard-notice';
  notice.style.position = 'fixed';
  notice.style.right = '20px';
  notice.style.bottom = '20px';
  notice.style.zIndex = '2147483647';
  notice.style.maxWidth = '420px';
  notice.style.padding = '14px';
  notice.style.borderRadius = '8px';
  notice.style.background = '#fff';
  notice.style.color = '#333';
  notice.style.boxShadow = '0 4px 18px rgba(0,0,0,.28)';
  notice.style.border = '1px solid #dadce0';

  const text = document.createElement('div');
  text.textContent = message;
  notice.appendChild(text);

  if (includeWhitelistAction) {
    const button = document.createElement('button');
    button.textContent = '永久加入白名單';
    button.style.marginTop = '10px';
    button.addEventListener('click', () => addCurrentWebsiteToWhitelist(button));
    notice.appendChild(button);
  }

  document.body.appendChild(notice);
  setTimeout(() => {
    if (notice.isConnected) notice.remove();
  }, 8000);
  return notice;
}

function setWarningStatus(message, isError = false) {
  const status = document.getElementById('fraud-guard-action-status');
  if (!status) return;
  status.textContent = message;
  status.style.display = 'block';
  status.style.color = isError ? '#b3261e' : '#137333';

}

function dismissCurrentWebsiteForToday(callback) {
  chrome.runtime.sendMessage({
    action: 'dismissRiskToday',
    scope: 'web',
    value: window.location.hostname
  }, (response) => {
    callback(Boolean(response && response.success));
  });
}

function addCurrentWebsiteToWhitelist(button) {
  if (button) {
    button.disabled = true;
    button.textContent = '加入中...';
  }

  chrome.runtime.sendMessage({
    action: 'addUserWhitelistEntry',
    entryType: 'domain',
    value: window.location.hostname
  }, (response) => {
    if (response && response.success) {
      closeWarningOverlay();
      const message = response.status === 'exists'
        ? '此網站已在永久白名單中。'
        : '已永久加入白名單，之後不再提示此網站。';
      showPageNotice(message);
      return;
    }

    if (document.getElementById('fraud-guard-overlay')) {
      setWarningStatus('白名單儲存失敗，請稍後重試。', true);
    } else {
      showPageNotice('白名單儲存失敗，請稍後重試。');
    }
    if (button) {
      button.disabled = false;
      button.textContent = '永久加入白名單';
    }
  });
}

function showWarning(fraudInfo) {
  isCurrentWebRiskDismissed((dismissed) => {
    if (!dismissed) renderWarning(fraudInfo);
  });
}

function renderWarning(fraudInfo) {
  let overlay = document.getElementById('fraud-guard-overlay');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'fraud-guard-overlay';
    overlay.innerHTML = `
      <div id="fraud-guard-modal">
        <div id="fraud-guard-icon">⚠️ <span style="font-size: 0.4em; color: #333; font-weight: normal; vertical-align: middle;">麥騙 - 偵測到潛在危險</span></div>
        <div id="fraud-guard-title">警告：疑似詐騙/高風險網站</div>
        <div id="fraud-guard-url-container" style="text-align: center; margin: 10px 0; padding: 8px; background: #f9f9f9; border-radius: 5px; border: 1px solid #eee;">
          <span id="fg-url" style="font-weight: bold; font-size: 1.1em; color: #333;"></span>
        </div>
        <div id="fraud-guard-message-container" style="text-align: left; margin: 10px 0;">
          <ul id="fraud-guard-reasons-list" style="padding-left: 20px; color: #d93025; font-weight: bold; margin: 5px 0;"></ul>
        </div>
        <div id="fraud-guard-timer" style="margin-bottom: 10px; color: #d93025; font-weight: bold;">
          將於 <span id="fg-countdown">60</span> 秒後自動導向安全頁面...
        </div>
        <button id="fraud-guard-button">立即離開 (回到 Google)</button>
        <button id="fraud-guard-ignore">略過（今日不再提示）</button>
        <button id="fraud-guard-whitelist" style="margin-top: 10px;">永久加入白名單</button>
        <div style="margin-top: 15px;">
          <button id="fraud-guard-report" style="background: transparent; border: 1px solid #999; color: #555; font-size: 0.8em; padding: 5px 10px;">回報非詐騙 (誤判)</button>
        </div>
        <div id="fraud-guard-action-status" style="display:none; margin-top:12px; font-size:13px;"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    let timeLeft = 60;
    const countdownEl = document.getElementById('fg-countdown');
    fraudGuardTimerId = setInterval(() => {
      timeLeft--;
      if (countdownEl) countdownEl.textContent = timeLeft;
      if (timeLeft <= 0) {
        clearInterval(fraudGuardTimerId);
        window.location.href = 'https://www.google.com';
      }
    }, 1000);

    document.getElementById('fraud-guard-button').addEventListener('click', () => {
      closeWarningOverlay();
      window.location.href = 'https://www.google.com';
    });

    document.getElementById('fraud-guard-ignore').addEventListener('click', (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = '儲存中...';
      dismissCurrentWebsiteForToday((saved) => {
        closeWarningOverlay();
        showPageNotice(
          saved
            ? '今日不再提示此網站風險；若要永久避免，請加入白名單。'
            : '僅略過本次；略過設定未能保存，重新整理後可能再次提示。',
          saved
        );
      });
    });

    document.getElementById('fraud-guard-whitelist').addEventListener('click', (event) => {
      addCurrentWebsiteToWhitelist(event.currentTarget);
    });

    document.getElementById('fraud-guard-report').addEventListener('click', (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = '回報中...';
      chrome.runtime.sendMessage({
        action: 'reportFalsePositive',
        source: 'web',
        data: {
          url: window.location.href,
          title: document.title
        }
      }, (response) => {
        if (!response || !response.success) {
          button.textContent = '❌ 回報失敗，請重試';
          button.disabled = false;
          return;
        }

        dismissCurrentWebsiteForToday((saved) => {
          closeWarningOverlay();
          showPageNotice(
            saved
              ? '已收到回報。今日不再提示此網站風險；若要永久避免，請加入白名單。'
              : '已收到回報，但今日略過設定未能保存。',
            saved
          );
        });
      });
    });
  }

  const reasonsList = document.getElementById('fraud-guard-reasons-list');
  const addReason = (text) => {
    const existing = Array.from(reasonsList.children).map(li => li.textContent);
    if (!existing.includes(text)) {
      const li = document.createElement('li');
      li.textContent = text;
      reasonsList.appendChild(li);
    }
  };

  if (!fraudInfo) return;
  document.getElementById('fg-url').textContent =
    fraudInfo.url || window.location.hostname || '未知';

  if (Array.isArray(fraudInfo.customMessages)) {
    fraudInfo.customMessages.forEach(message => addReason(message));
  } else if (fraudInfo.customMessage) {
    addReason(fraudInfo.customMessage);
  } else if (fraudInfo.type === 'newly_registered') {
    const dateText = fraudInfo.startDate ? `（註冊日期：${fraudInfo.startDate}）` : '';
    addReason(`此網站註冊未滿 30 天，極有可能為免洗詐騙網站${dateText}`);
  } else if (fraudInfo.isImpersonationCheck) {
    addReason('標題包含政府關鍵字，但非 gov.tw 網域');
  } else {
    addReason(`已被政府列為詐騙網站（回報數：${fraudInfo.count || 1}）`);
  }
}

// Check for Government Impersonation (Title matches Gov keywords but not gov.tw)
// Check for Government Impersonation (Title matches Gov keywords but not gov.tw)
function checkGovImpersonation() {
  const title = document.title;
  const hostname = window.location.hostname;

  // Skip if already on a gov.tw site
  if (hostname.endsWith('.gov.tw')) return;

  // Run the local keyword check.
  proceedWithGovCheck(title, hostname);
}

function proceedWithGovCheck(title, hostname) {
  // Fetch remote whitelist and user domain whitelist from storage
  try {
    chrome.storage.local.get(
      ['remoteWhitelist', 'userDomainWhitelist', DAILY_RISK_DISMISSALS_KEY],
      (result) => {
      // Check for runtime error
      if (chrome.runtime.lastError) return;

      if (isWebRiskDismissedInState(
        result[DAILY_RISK_DISMISSALS_KEY],
        hostname
      )) {
        return;
      }

      // 1. Check User Domain Whitelist
      if (result.userDomainWhitelist && Array.isArray(result.userDomainWhitelist)) {
        const isUserWhitelisted = result.userDomainWhitelist.some(allowed => matchesDomainEntry(hostname, allowed));
        if (isUserWhitelisted) return;
      }

      let allowedExact = ['www.facebook.com', 'facebook.com', 'www.instagram.com', 'instagram.com', 'www.youtube.com', 'youtube.com', 'threads.net', 'www.threads.net', 'threads.com', 'www.threads.com'];

      // Merge remote whitelist if available
      if (result.remoteWhitelist && Array.isArray(result.remoteWhitelist)) {
        allowedExact = [...new Set([...allowedExact, ...result.remoteWhitelist])];
      }

      // Check Exact or Subdomain
      const isAllowed = allowedExact.some(allowed => matchesDomainEntry(hostname, allowed));

      if (hostname.endsWith('google.com') || hostname.endsWith('google.com.tw') || hostname === 'mail.google.com' || isAllowed) return;

      // Check if title contains government keywords
      if (typeof containsGovKeyword === 'function' && containsGovKeyword(title)) {
        // Exception: Trusted Domains (e.g. ETC -> fetc.net.tw)
        if (typeof isTrustedDomain === 'function') {
          if (isTrustedDomain(title, hostname)) {
            return; // Valid trusted site
          }
        }

        // It's a match! The title claims to be government-related, but the URL is not.
        console.log('MainPage: Government keyword detected in title, but not a gov.tw domain.');
        console.log('Detected Hostname:', hostname);
        console.log('Effective Whitelist:', allowedExact);

        showWarning({
          name: '非政府官方網站警告',
          url: hostname,
          count: '⚠️',
          startDate: '偵測到政府機關關鍵字',
          endDate: '非 gov.tw 網域',
          isImpersonationCheck: true // Special flag to adjust UI if needed
        });
      }

      // Brand Protection (Dynamic + Default)
      const DEFAULT_BRAND_RULES = [
        { keyword: '7-11', official_domains: ['7-11.com.tw'], name: '7-11' }
      ];

      chrome.storage.local.get('brandRules', (res) => {
        let activeRules = DEFAULT_BRAND_RULES;

        // Merge remote rules if valid
        if (res.brandRules && Array.isArray(res.brandRules)) {
          // Simple merge: Remote rules added to defaults (deduplication not strictly needed for small sets)
          activeRules = [...activeRules, ...res.brandRules];
        }

        // Iterate Rules
        activeRules.forEach(rule => {
          if (hostname.includes(rule.keyword)) {

            // Check against official domains
            // rule.official_domains e.g. ['7-11.com.tw', 'myship.7-11.com.tw']
            // We basically assume official domains allow subdomains automatically? 
            // Let's stick to strict endsWith check from before.

            const isSafe = rule.official_domains.some(domain => hostname.endsWith(domain));

            if (!isSafe) {
              console.log(`MainPage: Brand Impersonation Detected (${rule.name})`);
              showWarning({
                name: `疑似假冒 ${rule.name} 網站`,
                url: hostname,
                count: '⚠️',
                startDate: `網域包含 ${rule.keyword}`,
                endDate: `非官方 (${rule.official_domains[0]}) 網域`,
                isImpersonationCheck: true,
                customTitle: `警告：非 ${rule.name} 官方網站`,
                customMessage: `本網站網域包含「${rule.keyword}」，但並非使用 ${rule.name} 官方網域 (${rule.official_domains[0]})。這可能是假冒的網站。`
              });
            }
          }
        });
      });
      }
    );
  } catch (e) {
    // console.log('Extension context invalidated, please refresh the page.');
  }
}

// Run check on load
// Use a small delay to ensure title is fully loaded and gov_agencies.js is ready
setTimeout(checkGovImpersonation, 1500);

// Also observe title changes (for SPAs)
new MutationObserver(() => {
  checkGovImpersonation();
}).observe(document.querySelector('title'), { subtree: true, characterData: true, childList: true });

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (changes.userDomainWhitelist || changes.remoteWhitelist) {
    reevaluateCurrentDomainWhitelist();
  }
});
