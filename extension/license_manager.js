const LicenseManager = {
    // Limits
    LIMITS: {
        FREE_WEB_SCANS: 20,
        FREE_EMAIL_SCANS: 20
    },

    // State
    state: {
        isPremium: false,
        licenseKey: null,
        expiryDate: null,
        lastResetDate: null,
        webScansToday: 0,
        emailScansToday: 0
    },

    initPromise: null,

    // Initialize
    async init() {
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            // Load from storage (local)
            const stored = await chrome.storage.local.get(['userLicense', 'usageStats']);

            if (stored.userLicense) {
                this.state.isPremium = stored.userLicense.isPremium || false;
                this.state.licenseKey = stored.userLicense.key || null;
                this.state.expiryDate = stored.userLicense.expiryDate || null;
            }

            // Restore Usage Stats (Local)
            if (stored.usageStats) {
                this.state.lastResetDate = stored.usageStats.lastResetDate;
                this.state.webScansToday = stored.usageStats.webScansToday || 0;
                this.state.emailScansToday = stored.usageStats.emailScansToday || 0;
            }

            // Feature: Sync Storage Restore (Anti-Cheat & License Restore)
            try {
                const synced = await chrome.storage.sync.get(['userLicense', 'usageStats']);

                // 1. Restore License if missing locally
                if (!this.state.isPremium && synced.userLicense && synced.userLicense.isPremium) {
                    if (synced.userLicense.expiryDate && Date.now() > synced.userLicense.expiryDate) {
                        console.log('[LicenseManager] Found synced license but it is expired.');
                    } else {
                        console.log('[LicenseManager] Restored Premium from Sync Storage');
                        this.state.isPremium = true;
                        this.state.licenseKey = synced.userLicense.key;
                        this.state.expiryDate = synced.userLicense.expiryDate;
                    }
                }

                // 2. Anti-Cheat: Restore Usage Stats from Sync if reinstall detected
                if (synced.usageStats && synced.usageStats.lastResetDate) {
                    const today = new Date().toLocaleDateString('zh-TW');

                    if (synced.usageStats.lastResetDate === today) {
                        // Maximize counts (Prevent reset by reinstall)
                        this.state.lastResetDate = today;
                        this.state.webScansToday = Math.max(this.state.webScansToday, synced.usageStats.webScansToday || 0);
                        this.state.emailScansToday = Math.max(this.state.emailScansToday, synced.usageStats.emailScansToday || 0);
                        console.log('[LicenseManager] Synced usage stats applied (Anti-Cheat).');
                    }
                }
            } catch (e) {
                console.warn('[LicenseManager] Failed to check sync storage', e);
            }

            this.checkPremiumStatus();
            this.checkDailyReset();

            // Initial save to ensure sync state is consistent
            this.saveState();
        })();

        return this.initPromise;
    },

    // Check Premium Expiration & Validity
    checkPremiumStatus() {
        if (this.state.isPremium && this.state.expiryDate) {
            if (Date.now() > this.state.expiryDate) {
                console.log('[LicenseManager] License expired. Reverting to Free.');
                this.state.isPremium = false;
                this.saveState();
            }
        }
    },

    // Daily Reset Logic
    checkDailyReset() {
        const today = new Date().toLocaleDateString('zh-TW'); // Use local date string

        if (this.state.lastResetDate !== today) {
            console.log('[LicenseManager] New day detected. Resetting limits.');
            this.state.lastResetDate = today;
            this.state.webScansToday = 0;
            this.state.emailScansToday = 0;
            this.saveState();
        }
    },

    // Save state to storage
    async saveState() {
        const licenseData = {
            isPremium: this.state.isPremium,
            key: this.state.licenseKey,
            expiryDate: this.state.expiryDate
        };

        const usageData = {
            lastResetDate: this.state.lastResetDate,
            webScansToday: this.state.webScansToday,
            emailScansToday: this.state.emailScansToday
        };

        // Save Local
        await chrome.storage.local.set({
            userLicense: licenseData,
            usageStats: usageData
        });

        // Save Sync (Backup License & Usage for Anti-Cheat)
        chrome.storage.sync.set({
            userLicense: licenseData,
            usageStats: usageData
        }).catch(e => console.warn('Sync save failed', e));
    },

    // Ensure Init Wrapper
    async ensureInit() {
        if (!this.initPromise) this.init();
        await this.initPromise;
    },

    // Check if user can scan (Async)
    // type: 'web' or 'email'
    async canScan(type) {
        await this.ensureInit();

        this.checkPremiumStatus();
        if (this.state.isPremium) return true;

        this.checkDailyReset(); // Ensure date is current before checking

        if (type === 'web') {
            return this.state.webScansToday < this.LIMITS.FREE_WEB_SCANS;
        } else if (type === 'email') {
            return this.state.emailScansToday < this.LIMITS.FREE_EMAIL_SCANS;
        }
        return false;
    },

    // Increment usage (Async)
    async incrementUsage(type) {
        await this.ensureInit();

        if (this.state.isPremium) return;

        this.checkDailyReset();

        let limitReached = false;
        if (type === 'web') {
            this.state.webScansToday++;
            if (this.state.webScansToday === this.LIMITS.FREE_WEB_SCANS) limitReached = true;
        } else if (type === 'email') {
            this.state.emailScansToday++;
            if (this.state.emailScansToday === this.LIMITS.FREE_EMAIL_SCANS) limitReached = true;
        }

        await this.saveState();

        if (limitReached) {
            this.sendLimitReachedNotification(type);
        }
    },

    // Send Notification
    sendLimitReachedNotification(type) {
        const title = "今日免費額度已用完";
        let message = "您今日的網頁掃描次數已達上限 (20次)。";
        if (type === 'email') {
            message = "您今日的 Email 掃描次數已達上限 (10封)。";
        }
        message += "\n請升級付費版本以獲得 365 天無限次防護。";

        chrome.notifications.create('limit-reached', {
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: title,
            message: message,
            buttons: [{ title: "前往升級" }],
            priority: 2
        });
    },

    // Get current usage stats for UI (Async)
    async getStats() {
        await this.ensureInit();
        return {
            isPremium: this.state.isPremium,
            expiryDate: this.state.expiryDate, // Return expiry for UI
            web: {
                current: this.state.webScansToday,
                limit: this.LIMITS.FREE_WEB_SCANS
            },
            email: {
                current: this.state.emailScansToday,
                limit: this.LIMITS.FREE_EMAIL_SCANS
            }
        };
    },

    // Activate License via Firebase
    async activateLicense(key) {
        if (!key) throw new Error('請輸入序號');
        if (!FIREBASE_CONFIG || !FIREBASE_CONFIG.databaseURL) throw new Error('Firebase 設定錯誤');

        const dbUrl = FIREBASE_CONFIG.databaseURL;
        const licensePath = `${dbUrl}/licenses/${key}.json`;

        try {
            // 1. Check if key exists and is unused
            const response = await fetch(licensePath);
            if (!response.ok) throw new Error('網路連線錯誤');

            const data = await response.json();

            if (!data) throw new Error('無效的序號');
            if (data.used) throw new Error('此序號已被使用');

            // 2. Claim the key (Mark as used)
            // Use PATCH to update specific fields
            const updateData = {
                used: true,
                activatedAt: Date.now()
            };

            const writeResponse = await fetch(licensePath, {
                method: 'PATCH',
                body: JSON.stringify(updateData)
            });

            if (!writeResponse.ok) throw new Error('啟用失敗 (寫入錯誤)');

            // 3. Activate locally
            this.state.isPremium = true;
            this.state.licenseKey = key;
            // 365 Days Expiration
            this.state.expiryDate = Date.now() + (365 * 24 * 60 * 60 * 1000);

            await this.saveState(); // Saves to Sync too

            return { success: true };

        } catch (e) {
            console.error('Activation failed:', e);
            throw e;
        }
    }
};

// Expose to global scope for background.js
self.LicenseManager = LicenseManager;

// Start initialization
LicenseManager.init().catch(console.error);

// Notification Button Listener for "Limit Reached"
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
    if (notificationId === 'limit-reached' && buttonIndex === 0) {
        // Open Upgrade Link
        chrome.tabs.create({ url: 'https://example.invalid/retired-payment' });
    }
});
