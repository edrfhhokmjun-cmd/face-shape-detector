#!/usr/bin/env node
/**
 * 把 MediaPipe 运行时资产同步到 public/，避免把 wasm 和模型提交进 git。
 *
 *   node_modules/@mediapipe/tasks-vision/wasm/*  ->  public/mediapipe/wasm/
 *   官方 face_landmarker.task（约 3MB）           ->  public/models/face_landmarker.task
 *
 * 设计原则：脚本永不硬失败。拿不到模型时只打印警告，方便离线开发与 CI。
 */
import { cp, mkdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const WASM_SRC = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const WASM_DEST = resolve(root, 'public/mediapipe/wasm');
const MODEL_DEST = resolve(root, 'public/models/face_landmarker.task');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const MODEL_MIN_BYTES = 1_000_000;

async function syncWasm() {
  if (!existsSync(WASM_SRC)) {
    console.warn('[sync-assets] 找不到 node_modules/@mediapipe/tasks-vision/wasm');
    console.warn('[sync-assets] 先执行：npm install');
    return false;
  }
  await mkdir(WASM_DEST, { recursive: true });
  await cp(WASM_SRC, WASM_DEST, { recursive: true });
  console.log(`[sync-assets] wasm  -> ${WASM_DEST}`);
  return true;
}

async function syncModel() {
  try {
    const size = existsSync(MODEL_DEST) ? (await stat(MODEL_DEST)).size : 0;
    if (size > MODEL_MIN_BYTES) {
      console.log('[sync-assets] 模型已存在，跳过下载');
      return true;
    }

    console.log('[sync-assets] 下载 face_landmarker.task …');
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < MODEL_MIN_BYTES) throw new Error(`文件过小（${buf.length} 字节），可能不是模型`);

    await mkdir(dirname(MODEL_DEST), { recursive: true });
    await writeFile(MODEL_DEST, buf);
    console.log(
      `[sync-assets] 模型  -> ${MODEL_DEST} (${(buf.length / 1048576).toFixed(1)} MB)`,
    );
    return true;
  } catch (err) {
    console.warn(`[sync-assets] 模型下载失败：${err instanceof Error ? err.message : err}`);
    console.warn('[sync-assets] 请手动下载后放到 public/models/face_landmarker.task：');
    console.warn(`[sync-assets]   ${MODEL_URL}`);
    return false;
  }
}

const ok = (await syncWasm()) && (await syncModel());
if (!ok) {
  console.warn('[sync-assets] 资产不完整 —— 补全之前，工具页会停在“加载模型”状态。');
}
