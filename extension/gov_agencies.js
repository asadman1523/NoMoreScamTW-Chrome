// List of Taiwan Government Agencies & Related Keywords
// Used to identify if a sender might be impersonating a government entity.
const GOV_AGENCIES = [
    // === 中央部會 ===
    '總統府', '行政院', '立法院', '司法院', '考試院', '監察院',
    '內政部', '外交部', '國防部', '財政部', '教育部', '法務部',
    '經濟部', '交通部', '勞動部', '衛生福利部', '衛福部', '文化部', '科技部', '數發部', '數位發展部',
    '農業部', '農委會', '環境部', '環保署',

    // === 重要署/局/處 ===
    '警政署', '刑事警察局',
    '疾管署', '健保署', '中央健康保險署', '食藥署',
    '國稅局', '稅捐處', '稅務局',
    '移民署', '戶政事務所', '地政事務所',
    '監理站', '公路總局', '高公局',
    '勞保局', '健保局',
    '金管會', '銀行局', '證期局', '保險局',

    // === 司法/檢調 ===
    '地檢署', '檢察署', '法院', '地方法院', '高等法院', '最高法院',
    '調查局', '法務部調查局',

    // === 公用事業 & 國營 ===
    '台灣電力', '台電', '台灣自來水', '台水',
    '中華郵政', '郵局',
    '台灣中油', '中油',

    // === 常見冒用關鍵字組合 (需謹慎) ===
    '全民健保', '防疫補助', '紓困補助', '交通違規罰單', '燃料費', 'ETC', '遠通電收', '電子發票整合'
];

// Helper to check if text contains any agency name
function containsGovKeyword(text) {
    if (!text) return false;
    return GOV_AGENCIES.some(agency => text.includes(agency));
}
