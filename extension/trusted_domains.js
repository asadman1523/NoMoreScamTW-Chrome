// List of Trusted Civilian/Semi-Government Domains
// Helper to allow exceptions for known safe domains that use government keywords.

// List of major news portals and social platforms that frequently report on "ETC" or other government keywords
// Including these globally prevents false positives when reading news
const GLOBAL_TRUSTED_NEWS_DOMAINS = [
    'yahoo.com', 'google.com', 'msn.com', 'ettoday.net', 'ltn.com.tw', 
    'chinatimes.com', 'cna.com.tw', 'ftvnews.com.tw', 'setn.com', 
    'tvbs.com.tw', 'udn.com', 'storm.mg', 'mirrormedia.mg', 'upmedia.mg', 
    'newtalk.tw', 'nownews.com', 'pts.org.tw', 'ctv.com.tw', 'ttv.com.tw', 
    'cts.com.tw', 'rti.org.tw', 'hk01.com', 'epochtimes.com', 'ntdtv.com',
    'cw.com.tw', 'businesstoday.com.tw', 'bnext.com.tw', 'techbang.com',
    'mobile01.com', 'ptt.cc', 'dcard.tw', 'disp.cc', 'tw.news.yahoo.com'
];

const TRUSTED_DOMAINS = [
    {
        // ETC / Far Eastern Electronic Toll Collection
        keywords: ['etc', '遠通電收'],
        domains: ['fetc.net.tw']
    },
    {
        // Taiwan Power Company (Taipower)
        keywords: ['台灣電力', '台電'],
        domains: ['taipower.com.tw']
    },
    {
        // CPC Corporation, Taiwan
        keywords: ['台灣中油', '中油'],
        domains: ['cpc.com.tw']
    },
    {
        // DigiAT / Fraud Buster (Government Affiliated)
        keywords: ['數發部', '數位發展部', '詐騙終結者'],
        domains: ['digiat.org.tw']
    }
];

/**
 * Checks if the text and domain match a trusted exception.
 * @param {string} text - The content text (e.g. sender name, subject, or title).
 * @param {string} emailOrHostname - The sender email or website hostname.
 * @returns {boolean} - True if trusted, False otherwise.
 */
function isTrustedDomain(text, emailOrHostname) {
    if (!text || !emailOrHostname) return false;

    // Normalize inputs for case-insensitive check
    const lowerText = text.toLowerCase();
    const lowerDomain = emailOrHostname.toLowerCase();

    // 0. Fast fail for globally trusted news/social domains
    if (GLOBAL_TRUSTED_NEWS_DOMAINS.some(domain => lowerDomain === domain || lowerDomain.endsWith('.' + domain))) {
        return true;
    }

    return TRUSTED_DOMAINS.some(entry => {
        // 1. Check if any keyword matches the text
        const keywordMatch = entry.keywords.some(kw => lowerText.includes(kw.toLowerCase()));

        if (keywordMatch) {
            // 2. If keyword found, check if domain is exact match or a true subdomain
            return entry.domains.some(allowed => {
                const target = allowed.toLowerCase();
                return lowerDomain === target || lowerDomain.endsWith('.' + target);
            });
        }
        return false;
    });
}
