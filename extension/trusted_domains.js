// List of Trusted Civilian/Semi-Government Domains
// Helper to allow exceptions for known safe domains that use government keywords.

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
