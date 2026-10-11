# content/audio/library.json → content/ATTRIBUTION.json의 소리 항목(kind=sound, id=fs-<id>) 추가·갱신(M09-T04 — ADR-0079).
# 사용: python -I tools/pipeline/scripts/audio-attribution.py  (저장소 루트에서). 결과는 커밋 대상 — 오디오 원천을 바꾸면 함께 실행.
import json, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..')
lib = json.load(open(os.path.join(ROOT, 'content/audio/library.json'), encoding='utf-8'))
ap = os.path.join(ROOT, 'content/ATTRIBUTION.json')
attr = json.load(open(ap, encoding='utf-8'))
roles = {}
for o in lib['outputs']:
    roles.setdefault(o['source'], []).append(o['id'])
LIC = {'CC0-1.0': 'CC0', 'CC-BY-3.0': 'CC BY 3.0', 'CC-BY-4.0': 'CC BY 4.0'}
entries = [e for e in attr['entries'] if not (e.get('kind') == 'sound' and e['id'].startswith('fs-'))]
for s in lib['sources']:
    lic = LIC[s['license']]
    entries.append({
        'id': s['id'],
        'kind': 'sound',
        'title': f"{s['title']} — Freesound #{s['freesound']} (게임 사용: {', '.join(roles.get(s['id'], []))} — 구간 루프·발소리 조각, 음량 정규화, Opus 재인코딩)",
        'url': s['url'],
        'license': s['license'],
        'attribution': {
            'ja': f"音源: 「{s['title']}」 by {s['author']}（Freesound, {lic}）",
            'en': f"Sound: \"{s['title']}\" by {s['author']} (Freesound, {lic})",
            'ko': f"음원: 「{s['title']}」 by {s['author']} (Freesound, {lic})",
        },
        'files': [],
        'modified': True,
    })
attr['entries'] = entries
open(ap, 'w', encoding='utf-8', newline='\n').write(json.dumps(attr, ensure_ascii=False, indent=2) + '\n')
print('sound entries', sum(1 for e in entries if e.get('kind') == 'sound'))
