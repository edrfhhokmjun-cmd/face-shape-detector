export type ImageLoadErrorCode = 'empty_file' | 'unsupported_format' | 'decode_failed';

export class ImageLoadError extends Error {
  readonly code: ImageLoadErrorCode;

  constructor(code: ImageLoadErrorCode, message: string) {
    super(message);
    this.name = 'ImageLoadError';
    this.code = code;
  }
}

const DEFAULT_MAX_EDGE = 1600;

/**
 * 用 <img> 解码而不是 createImageBitmap：
 * 现代浏览器对 <img> 都会自动套用 EXIF 方向，而 createImageBitmap 的
 * imageOrientation 选项支持度参差不齐（默认可能是 'none'）—— 手机照片
 * 一旦方向没摆正，所有 landmarks 都是错的，而失败是静默的。
 */
function decodeWithImgTag(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(
        new ImageLoadError(
          'unsupported_format',
          'This browser cannot decode that image (iPhone HEIC files are the usual cause). Convert it to JPG or PNG and try again.',
        ),
      );
    };
    img.src = url;
  });
}

async function decode(
  file: File,
): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  try {
    const img = await decodeWithImgTag(file);
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } catch (primaryError) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      throw primaryError instanceof ImageLoadError
        ? primaryError
        : new ImageLoadError('decode_failed', 'Could not decode that image. Try a different photo.');
    }
  }
}

/**
 * 解码 → 按 EXIF 摆正 → 限制长边 → 返回可以直接喂给 MediaPipe 的 canvas。
 *
 * 降采样到 maxEdge 是为了推理速度：原图 4000px 和 1600px 的 landmark 精度
 * 差异很小，但耗时差好几倍。
 */
export async function loadImageAsCanvas(
  file: File,
  maxEdge: number = DEFAULT_MAX_EDGE,
): Promise<HTMLCanvasElement> {
  if (!file || file.size === 0) {
    throw new ImageLoadError('empty_file', 'That file is empty. Please choose another image.');
  }

  const { source, width, height } = await decode(file);
  if (!width || !height) {
    throw new ImageLoadError('decode_failed', 'Could not read the image dimensions. Try another photo.');
  }

  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageLoadError('decode_failed', 'Could not create a canvas context.');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

  if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) source.close();

  return canvas;
}
