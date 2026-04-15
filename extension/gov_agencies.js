// Government-related keywords that are likely to appear in scam lures.
// Keep this list narrow to avoid false positives from normal government/news content.
const GOV_AGENCIES = [
    '台電',
    '中油',
    '郵局',
    '全民健保',
    '防疫補助',
    '交通違規罰單',
    '燃料費',
    'ETC',
    '電子發票整合'
];

// Helper to check if text contains any configured keyword.
function containsGovKeyword(text) {
    if (!text) return false;

    let segmenter = null;

    return GOV_AGENCIES.some(agency => {
        if (!text.includes(agency)) return false;

        // English/alphanumeric keywords need word boundaries so "FETCH" does not match "ETC".
        if (/^[A-Za-z0-9]+$/.test(agency)) {
            try {
                const regex = new RegExp(`\\b${agency}\\b`, 'i');
                return regex.test(text);
            } catch (e) {
                return true;
            }
        }

        // Short Chinese keywords are easy to overmatch, so use word segmentation when available.
        if (agency.length < 3) {
            if (!segmenter) {
                try {
                    segmenter = new Intl.Segmenter('zh-TW', { granularity: 'word' });
                } catch (e) {
                    return true;
                }
            }
            const segments = segmenter.segment(text);
            for (const segment of segments) {
                if (segment.segment === agency) return true;
            }
            return false;
        }

        return true;
    });
}
