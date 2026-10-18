// 가나 읽기 → 로마자(헵번식, 장음 표기 생략)·한글(국립국어원 일본어 표기법: 어두 무성음 = 예사소리, 어중 = 거센소리, 장음 생략, ン = ㄴ받침, ッ = ㅅ받침).
// 원천: 우편번호 KEN_ALL 반각 가타카나(M10-T02 지명). 순수 함수(테스트).

/** 반각 → 전각 가타카나(탁점·반탁점 합치기). */
export function toFullKatakana(s: string): string {
  return s.normalize('NFKC');
}

/** 히라가나 → 가타카나. */
const hiraToKata = (s: string): string => s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));

// 모라 표: [가나, 로마자, 한글 어두, 한글 어중]
const T: readonly (readonly [string, string, string, string])[] = [
  ['キャ', 'kya', '갸', '캬'],
  ['キュ', 'kyu', '규', '큐'],
  ['キョ', 'kyo', '교', '쿄'],
  ['ギャ', 'gya', '갸', '갸'],
  ['ギュ', 'gyu', '규', '규'],
  ['ギョ', 'gyo', '교', '교'],
  ['シャ', 'sha', '샤', '샤'],
  ['シュ', 'shu', '슈', '슈'],
  ['ショ', 'sho', '쇼', '쇼'],
  ['シェ', 'she', '셰', '셰'],
  ['ジャ', 'ja', '자', '자'],
  ['ジュ', 'ju', '주', '주'],
  ['ジョ', 'jo', '조', '조'],
  ['ジェ', 'je', '제', '제'],
  ['チャ', 'cha', '자', '차'],
  ['チュ', 'chu', '주', '추'],
  ['チョ', 'cho', '조', '초'],
  ['チェ', 'che', '제', '체'],
  ['ニャ', 'nya', '냐', '냐'],
  ['ニュ', 'nyu', '뉴', '뉴'],
  ['ニョ', 'nyo', '뇨', '뇨'],
  ['ヒャ', 'hya', '햐', '햐'],
  ['ヒュ', 'hyu', '휴', '휴'],
  ['ヒョ', 'hyo', '효', '효'],
  ['ビャ', 'bya', '뱌', '뱌'],
  ['ビュ', 'byu', '뷰', '뷰'],
  ['ビョ', 'byo', '뵤', '뵤'],
  ['ピャ', 'pya', '퍄', '퍄'],
  ['ピュ', 'pyu', '퓨', '퓨'],
  ['ピョ', 'pyo', '표', '표'],
  ['ミャ', 'mya', '먀', '먀'],
  ['ミュ', 'myu', '뮤', '뮤'],
  ['ミョ', 'myo', '묘', '묘'],
  ['リャ', 'rya', '랴', '랴'],
  ['リュ', 'ryu', '류', '류'],
  ['リョ', 'ryo', '료', '료'],
  ['ア', 'a', '아', '아'],
  ['イ', 'i', '이', '이'],
  ['ウ', 'u', '우', '우'],
  ['エ', 'e', '에', '에'],
  ['オ', 'o', '오', '오'],
  ['カ', 'ka', '가', '카'],
  ['キ', 'ki', '기', '키'],
  ['ク', 'ku', '구', '쿠'],
  ['ケ', 'ke', '게', '케'],
  ['コ', 'ko', '고', '코'],
  ['ガ', 'ga', '가', '가'],
  ['ギ', 'gi', '기', '기'],
  ['グ', 'gu', '구', '구'],
  ['ゲ', 'ge', '게', '게'],
  ['ゴ', 'go', '고', '고'],
  ['サ', 'sa', '사', '사'],
  ['シ', 'shi', '시', '시'],
  ['ス', 'su', '스', '스'],
  ['セ', 'se', '세', '세'],
  ['ソ', 'so', '소', '소'],
  ['ザ', 'za', '자', '자'],
  ['ジ', 'ji', '지', '지'],
  ['ズ', 'zu', '즈', '즈'],
  ['ゼ', 'ze', '제', '제'],
  ['ゾ', 'zo', '조', '조'],
  ['タ', 'ta', '다', '타'],
  ['チ', 'chi', '지', '치'],
  ['ツ', 'tsu', '쓰', '쓰'],
  ['テ', 'te', '데', '테'],
  ['ト', 'to', '도', '토'],
  ['ダ', 'da', '다', '다'],
  ['ヂ', 'ji', '지', '지'],
  ['ヅ', 'zu', '즈', '즈'],
  ['デ', 'de', '데', '데'],
  ['ド', 'do', '도', '도'],
  ['ナ', 'na', '나', '나'],
  ['ニ', 'ni', '니', '니'],
  ['ヌ', 'nu', '누', '누'],
  ['ネ', 'ne', '네', '네'],
  ['ノ', 'no', '노', '노'],
  ['ハ', 'ha', '하', '하'],
  ['ヒ', 'hi', '히', '히'],
  ['フ', 'fu', '후', '후'],
  ['ヘ', 'he', '헤', '헤'],
  ['ホ', 'ho', '호', '호'],
  ['バ', 'ba', '바', '바'],
  ['ビ', 'bi', '비', '비'],
  ['ブ', 'bu', '부', '부'],
  ['ベ', 'be', '베', '베'],
  ['ボ', 'bo', '보', '보'],
  ['パ', 'pa', '파', '파'],
  ['ピ', 'pi', '피', '피'],
  ['プ', 'pu', '푸', '푸'],
  ['ペ', 'pe', '페', '페'],
  ['ポ', 'po', '포', '포'],
  ['マ', 'ma', '마', '마'],
  ['ミ', 'mi', '미', '미'],
  ['ム', 'mu', '무', '무'],
  ['メ', 'me', '메', '메'],
  ['モ', 'mo', '모', '모'],
  ['ヤ', 'ya', '야', '야'],
  ['ユ', 'yu', '유', '유'],
  ['ヨ', 'yo', '요', '요'],
  ['ラ', 'ra', '라', '라'],
  ['リ', 'ri', '리', '리'],
  ['ル', 'ru', '루', '루'],
  ['レ', 're', '레', '레'],
  ['ロ', 'ro', '로', '로'],
  ['ワ', 'wa', '와', '와'],
  ['ヰ', 'i', '이', '이'],
  ['ヱ', 'e', '에', '에'],
  ['ヲ', 'o', '오', '오'],
  ['ヴ', 'vu', '부', '부'],
];
const TABLE = new Map(T.map((r) => [r[0], r]));

interface Mora {
  kana: string;
  romaji: string;
  hangulInitial: string;
  hangulMedial: string;
}

/** 가타카나 → 모라(ン·ッ·ー는 특수 모라). 모르는 글자는 건너뛴다. */
export function morae(kata: string): Mora[] {
  const out: Mora[] = [];
  const s = hiraToKata(toFullKatakana(kata));
  for (let i = 0; i < s.length; ) {
    const two = s.slice(i, i + 2);
    const one = s[i] as string;
    const r = TABLE.get(two) ?? TABLE.get(one);
    if (r && TABLE.has(two)) i += 2;
    else i += 1;
    if (r) out.push({ kana: r[0], romaji: r[1], hangulInitial: r[2], hangulMedial: r[3] });
    else if (one === 'ン' || one === 'ッ' || one === 'ー')
      out.push({ kana: one, romaji: '', hangulInitial: '', hangulMedial: '' });
  }
  return out;
}

const vowelOf = (romaji: string): string => romaji.slice(-1);

/** 장음(같은 모음 우·이 이어짐: o+u·o+o·u+u·e+i 중 o·u 계열)인가 — 로마자·한글 모두 생략. */
function isLong(prev: Mora | undefined, m: Mora, atStart = false): boolean {
  if (!prev?.romaji) return m.kana === 'ー';
  const v = vowelOf(prev.romaji);
  if (m.kana === 'ー') return true;
  // オオ는 어두(大 — オオハシ = Ohashi)만 장음, 어중 ロオ(広尾 = Hiroo)는 두 모음.
  const oo = m.kana === 'オ' && atStart;
  return (v === 'o' && (m.kana === 'ウ' || oo)) || (v === 'u' && m.kana === 'ウ');
}

/** 헵번식(장음 생략, ン = n, ッ = 다음 자음 겹침). 첫 글자 대문자. */
export function kanaToRomaji(kata: string): string {
  const ms = morae(kata);
  let out = '';
  ms.forEach((m, i) => {
    const prev = ms[i - 1];
    if (isLong(prev, m, i === 1)) return;
    if (m.kana === 'ン') out += 'n';
    else if (m.kana === 'ッ') {
      const next = ms[i + 1]?.romaji ?? '';
      out += next.startsWith('ch') ? 't' : (next[0] ?? '');
    } else {
      // ン 뒤 모음·y = n'(Shin'ei) — 지명 표기에서는 생략(관례).
      out += m.romaji;
    }
  });
  return out.charAt(0).toUpperCase() + out.slice(1);
}

const HANGUL_BASE = 0xac00;
/** 받침 붙이기(ㄴ = 4, ㅅ = 19). */
function withFinal(syllable: string, jong: number): string {
  const c = syllable.charCodeAt(0) - HANGUL_BASE;
  if (c < 0 || c > 11171 || c % 28 !== 0) return syllable;
  return String.fromCharCode(HANGUL_BASE + c + jong);
}

/** 한글 표기(어두 예사소리·어중 거센소리, 장음 생략, ン = ㄴ, ッ = ㅅ). */
export function kanaToHangul(kata: string): string {
  const ms = morae(kata);
  let out = '';
  ms.forEach((m, i) => {
    const prev = ms[i - 1];
    if (isLong(prev, m, i === 1)) return;
    if (m.kana === 'ン' || m.kana === 'ッ') {
      if (out) out = out.slice(0, -1) + withFinal(out.slice(-1), m.kana === 'ン' ? 4 : 19);
      return;
    }
    out += out === '' ? m.hangulInitial : m.hangulMedial;
  });
  return out;
}
