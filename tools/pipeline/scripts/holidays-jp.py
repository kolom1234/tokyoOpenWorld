# 일본 국민 공휴일 표(M09-T05 — 10 §2): 「国民の祝日に関する法律」 규칙으로 2026–2035 생성 → content/sim/holidays-jp.json.
# 고정일·해피 먼데이·춘분/추분(근사식 1980–2099, 관보 공표 전 연도는 예정)·대체 휴일(일요일 → 다음 평일)·국민의 휴일(휴일 사이 하루).
# 사용: python -I tools/pipeline/scripts/holidays-jp.py  (저장소 루트). 법 개정·공표가 바뀌면 다시 실행.
import datetime as dt
import json
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..')
YEARS = range(2026, 2036)


def nth_monday(y, m, n):
    d = dt.date(y, m, 1)
    d += dt.timedelta(days=(7 - d.weekday()) % 7)  # 첫 월요일
    return d + dt.timedelta(weeks=n - 1)


def equinox(y, base):
    return int(base + 0.242194 * (y - 1980) - (y - 1980) // 4)


def base_holidays(y):
    h = {
        dt.date(y, 1, 1): '元日',
        nth_monday(y, 1, 2): '成人の日',
        dt.date(y, 2, 11): '建国記念の日',
        dt.date(y, 2, 23): '天皇誕生日',
        dt.date(y, 3, equinox(y, 20.8431)): '春分の日',
        dt.date(y, 4, 29): '昭和の日',
        dt.date(y, 5, 3): '憲法記念日',
        dt.date(y, 5, 4): 'みどりの日',
        dt.date(y, 5, 5): 'こどもの日',
        nth_monday(y, 7, 3): '海の日',
        dt.date(y, 8, 11): '山の日',
        nth_monday(y, 9, 3): '敬老の日',
        dt.date(y, 9, equinox(y, 23.2488)): '秋分の日',
        nth_monday(y, 10, 2): 'スポーツの日',
        dt.date(y, 11, 3): '文化の日',
        dt.date(y, 11, 23): '勤労感謝の日',
    }
    return h


def holidays(y):
    h = base_holidays(y)
    # 국민의 휴일: 앞뒤가 휴일인 평일(일요일 아님).
    for d in sorted(h):
        mid = d + dt.timedelta(days=1)
        if mid not in h and (mid + dt.timedelta(days=1)) in h and mid.weekday() != 6:
            h[mid] = '国民の休日'
    # 대체 휴일: 일요일 휴일 → 그 뒤 첫 비휴일.
    for d in sorted(list(h)):
        if d.weekday() == 6 and h[d] != '休日':
            n = d + dt.timedelta(days=1)
            while n in h:
                n += dt.timedelta(days=1)
            h[n] = '休日'
    return h


out = []
for y in YEARS:
    for d, name in sorted(holidays(y).items()):
        out.append({'date': d.isoformat(), 'name': name})
doc = {
    '$comment': 'M09-T05 일본 국민 공휴일(운행일 요일 유형 — 10 §2). tools/pipeline/scripts/holidays-jp.py 생성(법 규칙, 춘분·추분 = 근사식 — 관보 공표와 다르면 고친다).',
    'years': [YEARS.start, YEARS.stop - 1],
    'holidays': out,
}
p = os.path.join(ROOT, 'content/sim/holidays-jp.json')
open(p, 'w', encoding='utf-8', newline='\n').write(json.dumps(doc, ensure_ascii=False, indent=1) + '\n')
print(len(out), 'holidays')
