chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'showWarning') {
    showWarning(request.fraudInfo);
  }
});

function showWarning(fraudInfo) {
  // Check if already shown
  let overlay = document.getElementById('fraud-guard-overlay');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'fraud-guard-overlay';

    // Use innerHTML for static structure ONLY. Dynamic content is added via textContent later.
    overlay.innerHTML = `
        <div id="fraud-guard-modal">
          <div id="fraud-guard-icon">⚠️ <span style="font-size: 0.4em; color: #333; font-weight: normal; vertical-align: middle;">麥騙 - 偵測到潛在危險</span></div>
          <div id="fraud-guard-title">警告：疑似詐騙/高風險網站</div>
          
          <div id="fraud-guard-url-container" style="text-align: center; margin: 10px 0; padding: 8px; background: #f9f9f9; border-radius: 5px; border: 1px solid #eee;">
             <span id="fg-url" style="font-weight: bold; font-size: 1.1em; color: #333;"></span>
          </div>

          <div id="fraud-guard-message-container" style="text-align: left; margin: 10px 0;">
             <ul id="fraud-guard-reasons-list" style="padding-left: 20px; color: #d93025; font-weight: bold; margin: 5px 0;">
             </ul>
          </div>

          <div id="fraud-guard-timer" style="margin-bottom: 10px; color: #d93025; font-weight: bold;">
            將於 <span id="fg-countdown">60</span> 秒後自動導向安全頁面...
          </div>
          <button id="fraud-guard-button">立即離開 (回到 Google)</button>
          <button id="fraud-guard-ignore">我了解風險，繼續瀏覽</button>
          <div style="margin-top: 15px;">
            <button id="fraud-guard-report" style="background: transparent; border: 1px solid #999; color: #555; font-size: 0.8em; padding: 5px 10px;">回報非詐騙 (誤判)</button>
          </div>
        </div>
      `;
    document.body.appendChild(overlay);

    // --- Singleton Initialization Logic (Runs only once) ---

    // Prevent scrolling
    document.body.style.overflow = 'hidden';

    // Redirect logic
    const safeUrl = 'https://www.google.com';
    let timeLeft = 60;
    const countdownEl = document.getElementById('fg-countdown');

    // Timer interval
    const timerId = setInterval(() => {
      timeLeft--;
      if (countdownEl) countdownEl.textContent = timeLeft;
      if (timeLeft <= 0) {
        clearInterval(timerId);
        window.location.href = safeUrl;
      }
    }, 1000);

    // Event Listeners
    document.getElementById('fraud-guard-button').addEventListener('click', () => {
      clearInterval(timerId);
      window.location.href = safeUrl;
    });

    document.getElementById('fraud-guard-ignore').addEventListener('click', () => {
      clearInterval(timerId);
      const currentOverlay = document.getElementById('fraud-guard-overlay');
      if (currentOverlay) {
        document.body.removeChild(currentOverlay);
        document.body.style.overflow = '';
      }
    });

    document.getElementById('fraud-guard-report').addEventListener('click', () => {
      const btn = document.getElementById('fraud-guard-report');
      btn.disabled = true;
      btn.textContent = '回報中...';

      chrome.runtime.sendMessage({
        action: 'reportFalsePositive',
        source: 'web',
        data: {
          url: window.location.href,
          title: document.title
        }
      }, (response) => {
        if (response && response.success) {
          btn.textContent = '✅ 已收到您的回報，我們會儘快審查。';
          btn.style.color = 'green';
          btn.style.borderColor = 'green';
          // Auto close after 2 seconds
          setTimeout(() => {
            clearInterval(timerId);
            const currentOverlay = document.getElementById('fraud-guard-overlay');
            if (currentOverlay) {
              document.body.removeChild(currentOverlay);
              document.body.style.overflow = '';
            }
          }, 2000);
        } else {
          btn.textContent = '❌ 回報失敗';
          btn.disabled = false;
        }
      });
    });
  }

  // --- Dynamic Content Update (Runs every time showWarning is called) ---

  // Helper to add reason
  const reasonsList = document.getElementById('fraud-guard-reasons-list');
  const addReason = (text) => {
    // Deduplicate
    const existing = Array.from(reasonsList.children).map(li => li.textContent);
    if (!existing.includes(text)) {
      const li = document.createElement('li');
      li.textContent = text;
      reasonsList.appendChild(li);
    }
  };

  if (fraudInfo) {
    // Update URL
    document.getElementById('fg-url').textContent = fraudInfo.url || window.location.hostname || '未知';

    // Update Reasons
    let reasonText = '';
    if (fraudInfo.customMessages && Array.isArray(fraudInfo.customMessages)) {
      fraudInfo.customMessages.forEach(msg => addReason(msg));
      return; // Added multiple reasons, done.
    } else if (fraudInfo.customMessage) {
      reasonText = fraudInfo.customMessage;
    } else if (fraudInfo.type === 'newly_registered') {
      const dateStr = fraudInfo.startDate ? ` (註冊日期：${fraudInfo.startDate})` : '';
      reasonText = `此網站註冊未滿 30 天，極有可能為免洗詐騙網站${dateStr}`;
    } else if (fraudInfo.isImpersonationCheck) {
      reasonText = `標題包含政府關鍵字，但非 gov.tw 網域`;
    } else {
      reasonText = `已被政府列為詐騙網站 (回報數：${fraudInfo.count || 1})`;
    }
    addReason(reasonText);
  }
}

// Check for Government Impersonation (Title matches Gov keywords but not gov.tw)
// Check for Government Impersonation (Title matches Gov keywords but not gov.tw)
function checkGovImpersonation() {
  const title = document.title;
  const hostname = window.location.hostname;

  // Skip if already on a gov.tw site
  if (hostname.endsWith('.gov.tw')) return;

  // Run Local Check Directly (No Quota Needed for Keyword Match)
  proceedWithGovCheck(title, hostname);
}

function proceedWithGovCheck(title, hostname) {
  // Fetch remote whitelist from storage
  try {
    chrome.storage.local.get('remoteWhitelist', (result) => {
      // Check for runtime error (e.g. context invalidated inside callback)
      if (chrome.runtime.lastError) {
        // console.warn('Storage get error:', chrome.runtime.lastError);
        return;
      }
      let allowedExact = ['www.facebook.com', 'facebook.com', 'www.instagram.com', 'instagram.com', 'www.youtube.com', 'youtube.com', 'threads.net', 'www.threads.net', 'threads.com', 'www.threads.com'];

      // Merge remote whitelist if available
      if (result.remoteWhitelist && Array.isArray(result.remoteWhitelist)) {
        allowedExact = [...new Set([...allowedExact, ...result.remoteWhitelist])];
      }

      // Check Exact or Subdomain
      const isAllowed = allowedExact.some(allowed =>
        hostname === allowed || hostname.endsWith('.' + allowed)
      );

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
    });
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
