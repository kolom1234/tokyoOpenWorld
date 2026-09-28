// 워커 스레드: zip 멤버 1개씩 받아 원경 건물 줄을 돌려준다(tokyo23-lod1.ts runPool).
import { parentPort } from 'node:worker_threads';
import type { CellBoundsWF } from '@sanpo/geo';
import { extractMember } from './tokyo23-lod1.ts';

interface Job {
  zipPath: string;
  member: string;
  sourceId: string;
  extent: CellBoundsWF;
}

parentPort?.on('message', (job: Job) => {
  extractMember(job.zipPath, job.member, job.sourceId, job.extent).then(
    (rows) => parentPort?.postMessage({ rows }),
    (e: unknown) => parentPort?.postMessage({ error: `${job.member}: ${e instanceof Error ? e.message : String(e)}` }),
  );
});
