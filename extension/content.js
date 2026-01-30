chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'showWarning') {
    showWarning(request.fraudInfo);
  }
});

function showWarning(fraudInfo) {
  // Check if already shown
  if (document.getElementById('fraud-guard-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'fraud-guard-overlay';

  // Use innerHTML for static structure ONLY. Dynamic content is added via textContent later.
  overlay.innerHTML = `
    <div id="fraud-guard-modal">
      <div id="fraud-guard-icon">⚠️</div>
      <div id="fraud-guard-title">
        ${fraudInfo.isImpersonationCheck ? '警告：非政府官方網站' : '警告：疑似詐騙網站'}
      </div>
      <div id="fraud-guard-message">
        ${fraudInfo.isImpersonationCheck
      ? '本網站標題包含政府機關關鍵字，但並非使用 gov.tw 官方網域。這可能是假冒的政府網站。'
      : '您正在瀏覽的網站已被政府列為詐騙網站。請立即離開以保護您的財產安全。'}
      </div>
      <div id="fraud-guard-details" style="text-align: left; margin: 15px 0; font-size: 0.9em; border: 1px solid #ffcccc; padding: 10px; background: #fff0f0;">
        <div><strong>網站名稱：</strong><span id="fg-name"></span></div>
        <div><strong>回報件數：</strong><span id="fg-count" style="color: #d93025; font-weight: bold;"></span> 件</div>
        <div><strong>網址：</strong><span id="fg-url"></span></div>
        <div style="font-size: 0.8em; color: #666; margin-top: 5px;">
           統計期間：<span id="fg-sdate"></span> ~ <span id="fg-edate"></span>
        </div>
      </div>
      <div id="fraud-guard-timer" style="margin-bottom: 10px; color: #d93025; font-weight: bold;">
        將於 <span id="fg-countdown">60</span> 秒後自動導向安全頁面...
      </div>
      <button id="fraud-guard-button">立即離開 (回到 Google)</button>
      <button id="fraud-guard-ignore">我了解風險，繼續瀏覽</button>
    </div>
  `;

  document.body.appendChild(overlay);

  // Safely inject text content
  if (fraudInfo) {
    document.getElementById('fg-name').textContent = fraudInfo.name || '未知';
    document.getElementById('fg-url').textContent = fraudInfo.url || '未知';
    document.getElementById('fg-count').textContent = fraudInfo.count || '0';
    document.getElementById('fg-sdate').textContent = fraudInfo.startDate || '?';
    document.getElementById('fg-edate').textContent = fraudInfo.endDate || '?';
  }

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

  document.getElementById('fraud-guard-button').addEventListener('click', () => {
    clearInterval(timerId); // Clear timer just in case
    window.location.href = safeUrl;
  });

  document.getElementById('fraud-guard-ignore').addEventListener('click', () => {
    clearInterval(timerId); // Stop redirect
    document.body.removeChild(overlay);
    document.body.style.overflow = '';
  });
}

// Check for Government Impersonation (Title matches Gov keywords but not gov.tw)
function checkGovImpersonation() {
  const title = document.title;
  const hostname = window.location.hostname;

  // Skip if already on a gov.tw site
  // Skip if already on a gov.tw site
  if (hostname.endsWith('.gov.tw')) return;

  // Check Quota (Async) - We fire and forget or wrap in async. 
  // Since checkGovImpersonation is called by setTimeout/Observer, it can be async.
  try {
    chrome.runtime.sendMessage({ action: 'checkQuota', type: 'web' }, (response) => {
      // Suppress invalid context error
      if (chrome.runtime.lastError) return;

      if (!response || !response.canScan) {
        // Quota exceeded
        return;
      }

      // ... Proceed with check ...
      proceedWithGovCheck(title, hostname);
    });
  } catch (e) {
    // Suppress
  }
}

function proceedWithGovCheck(title, hostname) {
  // Skip valid Google domains (Gmail, Search, etc.) to prevent false positives
  // Gmail has its own dedicated filter (gmail_filter.js)
  if (hostname.endsWith('google.com') || hostname.endsWith('google.com.tw') || hostname === 'mail.google.com') return;

  // Check if title contains government keywords
  if (typeof containsGovKeyword === 'function' && containsGovKeyword(title)) {
    // It's a match! The title claims to be government-related, but the URL is not.
    console.log('MainPage: Government keyword detected in title, but not a gov.tw domain.');

    showWarning({
      name: '非政府官方網站警告',
      url: hostname,
      count: '⚠️',
      startDate: '偵測到政府機關關鍵字',
      endDate: '非 gov.tw 網域',
      isImpersonationCheck: true // Special flag to adjust UI if needed
    });
  }
}

// Run check on load
// Use a small delay to ensure title is fully loaded and gov_agencies.js is ready
setTimeout(checkGovImpersonation, 1500);

// Also observe title changes (for SPAs)
new MutationObserver(() => {
  checkGovImpersonation();
}).observe(document.querySelector('title'), { subtree: true, characterData: true, childList: true });
