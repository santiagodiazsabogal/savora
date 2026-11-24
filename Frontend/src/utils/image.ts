// Compresión de imágenes en el navegador antes de subirlas al Storage.
// Reescala el lado más largo a `maxSize` px y exporta JPEG con `quality`.
// Objetivo: bajar una foto de celular de ~3-5 MB a ~200-400 KB para no agotar
// el Storage (1 GB free) ni el egress de Supabase.

interface CompressOptions {
  maxSize?: number // lado más largo en px
  quality?: number // 0..1 calidad JPEG
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// Devuelve un data URL JPEG comprimido. Si algo falla (formato no rasterizable,
// canvas bloqueado, etc.), cae de vuelta al archivo original sin romper el flujo.
export async function compressImageToDataUrl(
  file: File,
  opts: CompressOptions = {},
): Promise<string> {
  const maxSize = opts.maxSize ?? 1080
  const quality = opts.quality ?? 0.72

  const original = await fileToDataUrl(file)
  try {
    const img = await loadImage(original)
    const { width, height } = img
    if (!width || !height) return original

    const scale = Math.min(1, maxSize / Math.max(width, height))
    const targetW = Math.round(width * scale)
    const targetH = Math.round(height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = targetW
    canvas.height = targetH
    const ctx = canvas.getContext('2d')
    if (!ctx) return original
    ctx.drawImage(img, 0, 0, targetW, targetH)

    const compressed = canvas.toDataURL('image/jpeg', quality)
    // Solo usar el comprimido si realmente quedó más liviano (PNG con alfa, etc.)
    return compressed.length < original.length ? compressed : original
  } catch {
    return original
  }
}
