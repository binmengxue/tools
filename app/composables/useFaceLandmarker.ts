/**
 * 人脸关键点识别（MediaPipe Face Landmarker）
 * 运行时与模型都自托管在 /models/ 下，打开人像美颜并选择照片时才按需下载，只初始化一次。
 */
import type { FaceLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision'

/** 与 package.json 中 @mediapipe/tasks-vision 的版本一致（单测会校验） */
export const MEDIAPIPE_VERSION = '1.1.1'
export const MEDIAPIPE_WASM_DIR = `/models/mediapipe-${MEDIAPIPE_VERSION}`
export const FACE_MODEL_URL = '/models/face_landmarker-v1.task'

export type LoaderStage = 'idle' | 'downloading' | 'initializing' | 'ready' | 'error'

let landmarker: Promise<FaceLandmarker> | null = null

/** 带进度地下载文件（用于在界面上显示下载进度） */
async function fetchWithProgress(url: string, onProgress: (loaded: number) => void): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok || !response.body) throw new Error(`下载失败（${response.status}）：${url}`)
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    onProgress(loaded)
  }
  const result = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

export function useFaceLandmarker() {
  const stage = useState<LoaderStage>('face-landmarker-stage', () => 'idle')
  const loadedBytes = useState<number>('face-landmarker-loaded', () => 0)
  const errorMessage = useState<string>('face-landmarker-error', () => '')

  /** 加载并初始化（重复调用返回同一个实例） */
  function load(): Promise<FaceLandmarker> {
    if (landmarker) return landmarker
    landmarker = (async () => {
      stage.value = 'downloading'
      loadedBytes.value = 0
      const wasmUrl = `${MEDIAPIPE_WASM_DIR}/vision_wasm_internal.wasm`
      // 先下载 wasm（之后加载器再次请求时命中浏览器缓存）和模型，以便显示进度
      let wasmLoaded = 0
      let modelLoaded = 0
      const report = () => (loadedBytes.value = wasmLoaded + modelLoaded)
      const [wasm, model, vision] = await Promise.all([
        fetchWithProgress(wasmUrl, (n) => {
          wasmLoaded = n
          report()
        }),
        fetchWithProgress(FACE_MODEL_URL, (n) => {
          modelLoaded = n
          report()
        }),
        import('@mediapipe/tasks-vision'),
      ])

      stage.value = 'initializing'
      // 把已下载的 wasm 交给加载器（blob 地址），避免再下载一次
      const wasmBlobUrl = URL.createObjectURL(new Blob([wasm as BlobPart], { type: 'application/wasm' }))
      const fileset = {
        wasmLoaderPath: `${MEDIAPIPE_WASM_DIR}/vision_wasm_internal.js`,
        wasmBinaryPath: wasmBlobUrl,
      }
      const create = (delegate: 'GPU' | 'CPU') =>
        vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetBuffer: model, delegate },
          runningMode: 'IMAGE',
          numFaces: 3,
        })
      let instance: FaceLandmarker
      try {
        instance = await create('GPU')
      }
      catch {
        // 部分设备不支持 WebGL 推理，退回 CPU
        instance = await create('CPU')
      }
      finally {
        URL.revokeObjectURL(wasmBlobUrl)
      }
      stage.value = 'ready'
      return instance
    })()
    landmarker.catch((error: unknown) => {
      stage.value = 'error'
      errorMessage.value = error instanceof Error ? error.message : String(error)
      landmarker = null
    })
    return landmarker
  }

  /** 识别图片中的人脸，返回每张脸的 478 个归一化关键点（x、y 取值 0 ~ 1） */
  async function detect(source: HTMLCanvasElement | ImageBitmap): Promise<NormalizedLandmark[][]> {
    const instance = await load()
    return instance.detect(source).faceLandmarks
  }

  return { stage, loadedBytes, errorMessage, load, detect }
}
