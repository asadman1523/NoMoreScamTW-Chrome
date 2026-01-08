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
      <div id="fraud-guard-title">警告：疑似詐騙網站</div>
      <div id="fraud-guard-message">
        您正在瀏覽的網站已被政府列為詐騙網站。請立即離開以保護您的財產安全。
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
