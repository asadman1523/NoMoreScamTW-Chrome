document.getElementById('agreeBtn').addEventListener('click', async () => {
    // Save acceptance to storage
    await chrome.storage.local.set({ termsAccepted: true });

    // Notify user and close tab or redirect
    alert('NoMoreScamTW 防護已啟動。');

    // Close this tab
    chrome.tabs.getCurrent((tab) => {
        if (tab) {
            chrome.tabs.remove(tab.id);
        }
    });
});
