import { CACHE_NAME, HUB_MODEL_BASE, LOCAL_MODEL_BASE, MODEL_FILES } from './constants.ts'

export async function isModelCached(): Promise<boolean> {
  try {
    const cache = await caches.open(CACHE_NAME)
    const urls = [
      `${LOCAL_MODEL_BASE}/${MODEL_FILES.onnx}`,
      `${HUB_MODEL_BASE}/${MODEL_FILES.onnx}`,
    ]
    for (const url of urls) {
      if (await cache.match(url)) return true
    }
  } catch {
    return false
  }
  return false
}
