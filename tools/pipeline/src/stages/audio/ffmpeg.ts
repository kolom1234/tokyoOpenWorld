// ffmpeg 입출력(컨테이너 — tools/pipeline/Dockerfile M09-T04): 원천 → f32 PCM 48 kHz, PCM → Opus(OGG).
import { spawn } from 'node:child_process';

export const AUDIO_RATE = 48_000;

export interface Pcm {
  rate: number;
  channels: 1 | 2;
  /** 인터리브 f32. */
  data: Float32Array;
}

function runFfmpeg(args: string[], input?: Uint8Array): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    p.stdout.on('data', (b: Buffer) => out.push(b));
    p.stderr.on('data', (b: Buffer) => err.push(b));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`ffmpeg ${args.join(' ')} → ${code}: ${Buffer.concat(err).toString().slice(0, 400)}`));
    });
    if (input) p.stdin.end(input);
    else p.stdin.end();
  });
}

export async function decodePcm(path: string, channels: 1 | 2 = 2): Promise<Pcm> {
  const buf = await runFfmpeg(['-i', path, '-f', 'f32le', '-ac', String(channels), '-ar', String(AUDIO_RATE), '-']);
  const data = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return { rate: AUDIO_RATE, channels, data };
}

/** PCM → Opus(OGG). kbps = 목표 비트율(VBR). */
export async function encodeOpus(pcm: Pcm, outPath: string, kbps: number): Promise<void> {
  const bytes = new Uint8Array(pcm.data.buffer, pcm.data.byteOffset, pcm.data.byteLength);
  await runFfmpeg(
    [
      '-f',
      'f32le',
      '-ar',
      String(pcm.rate),
      '-ac',
      String(pcm.channels),
      '-i',
      '-',
      '-c:a',
      'libopus',
      '-b:a',
      `${kbps}k`,
      '-vbr',
      'on',
      '-application',
      'audio',
      '-map_metadata',
      '-1',
      '-y',
      outPath,
    ],
    bytes,
  );
}
