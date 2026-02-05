// List of Major Taiwan Banks & Official Domains
// Used to identify if a sender might be impersonating a bank.

const BANKS = [
    { keywords: ['臺灣銀行', '台灣銀行', '臺銀', '台銀', 'Bank of Taiwan'], domains: ['bot.com.tw'] },
    { keywords: ['土地銀行', '土銀', 'Land Bank'], domains: ['landbank.com.tw'] },
    { keywords: ['合作金庫', '合庫', 'TCB'], domains: ['tcb-bank.com.tw'] },
    { keywords: ['第一銀行', '一銀', 'First Bank'], domains: ['firstbank.com.tw'] },
    { keywords: ['華南銀行', '華銀', 'Hua Nan'], domains: ['hncb.com.tw'] },
    { keywords: ['彰化銀行', '彰銀', 'Chang Hwa'], domains: ['bankchb.com', 'chb.com.tw'] },
    { keywords: ['上海商業儲蓄銀行', '上海商銀', 'SCSB'], domains: ['scsb.com.tw'] },
    { keywords: ['台北富邦', '富邦', 'Fubon'], domains: ['fubon.com'] },
    { keywords: ['國泰世華', '國泰', 'Cathay'], domains: ['cathaybk.com.tw', 'cathayholdings.com'] },
    { keywords: ['中國輸出入銀行', '輸出入銀行', 'Eximbank'], domains: ['eximbank.com.tw'] },
    { keywords: ['高雄銀行', '高銀', 'Bank of Kaohsiung'], domains: ['bok.com.tw'] },
    { keywords: ['兆豐銀行', '兆豐', 'Mega Bank'], domains: ['megabank.com.tw'] },
    { keywords: ['花旗銀行', '花旗', 'Citi'], domains: ['citibank.com.tw'] },
    { keywords: ['王道銀行', '王道', 'O-Bank'], domains: ['o-bank.com'] },
    { keywords: ['中小企銀', '臺企銀', '台企銀', 'Taiwan Business Bank'], domains: ['tbb.com.tw'] },
    { keywords: ['渣打銀行', '渣打', 'Standard Chartered'], domains: ['sc.com'] },
    { keywords: ['台中銀行', '台中銀', 'TCBB'], domains: ['tcbbank.com.tw'] },
    { keywords: ['京城銀行', '京城', 'KTB'], domains: ['ktb.com.tw'] },
    { keywords: ['滙豐銀行', '匯豐', 'HSBC'], domains: ['hsbc.com.tw'] },
    { keywords: ['瑞興銀行', '瑞興'], domains: ['taipeistarbank.com.tw'] },
    { keywords: ['華泰銀行', '華泰'], domains: ['hwataibank.com.tw'] },
    { keywords: ['新光銀行', '新光', 'Shin Kong'], domains: ['skbank.com.tw'] },
    { keywords: ['陽信銀行', '陽信'], domains: ['sunnybank.com.tw'] },
    { keywords: ['板信銀行', '板信'], domains: ['bop.com.tw'] },
    { keywords: ['三信商銀', '三信'], domains: ['cotabank.com.tw'] },
    { keywords: ['聯邦銀行', '聯邦', 'Union Bank'], domains: ['ubot.com.tw'] },
    { keywords: ['遠東銀行', '遠銀', 'Far Eastern'], domains: ['feib.com.tw'] },
    { keywords: ['元大銀行', '元大', 'Yuanta'], domains: ['yuantabank.com.tw'] },
    { keywords: ['永豐銀行', '永豐', 'SinoPac'], domains: ['sinopac.com', 'bank.sinopac.com'] },
    { keywords: ['玉山銀行', '玉山', 'E.SUN'], domains: ['esunbank.com', 'esunbank.com.tw'] },
    { keywords: ['凱基銀行', '凱基', 'KGI'], domains: ['kgibank.com.tw'] },
    { keywords: ['星展銀行', '星展', 'DBS'], domains: ['dbs.com.tw', 'dbs.com'] },
    { keywords: ['台新銀行', '台新', 'Taishin'], domains: ['taishinbank.com.tw'] },
    { keywords: ['安泰銀行', '安泰', 'Entie'], domains: ['entiebank.com.tw'] },
    { keywords: ['中國信託', '中信', 'CTBC'], domains: ['ctbcbank.com', 'ctbc.com'] },
    { keywords: ['將來銀行', '將來', 'Next Bank'], domains: ['nextbank.com.tw'] },
    { keywords: ['連線銀行', 'LINE Bank'], domains: ['linebank.com.tw'] },
    { keywords: ['樂天銀行', '樂天', 'Rakuten'], domains: ['rakuten-bank.com.tw'] }
];

/**
 * Checks if the text matches any bank keywords.
 * Returns the matched bank object or null.
 */
function getBankMatch(text) {
    if (!text) return null;
    const lowerText = text.toLowerCase();

    for (const bank of BANKS) {
        // Check keywords
        if (bank.keywords.some(kw => lowerText.includes(kw.toLowerCase()))) {
            return bank;
        }
    }
    return null;
}
