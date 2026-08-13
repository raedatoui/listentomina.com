// Texture source for the shard layer. The prototype rasterised a same-origin
// mirror of the site here; that is decoupled for now — this module cover-fits
// a static image into a viewport-sized canvas instead. The canvas doubles as
// the GPU texture source and the getImageData sampler for per-shard colours.
// Re-plugging an HTML rasteriser later just means producing another
// TextureSource from a different draw routine.

export interface TextureSource {
    canvas: HTMLCanvasElement;
    /** sample one pixel at css-px coordinates of the viewport the canvas was built for */
    sample(x: number, y: number): [number, number, number];
}

const RASTER_SCALE_CAP = 1.5; // the prototype capped the capture raster below the dpr cap of 2

function makeSource(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, viewW: number, viewH: number): TextureSource {
    const scale = Math.min(RASTER_SCALE_CAP, window.devicePixelRatio || 1);
    const canvas = document.createElement('canvas');
    const w = Math.max(2, viewW);
    const h = Math.max(2, viewH);
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const g = canvas.getContext('2d', { willReadFrequently: true });
    if (!g) throw new Error('2d context unavailable');
    g.scale(scale, scale);
    draw(g, w, h);
    return {
        canvas,
        sample(x, y) {
            const px = Math.min(canvas.width - 1, Math.max(0, Math.round((x / w) * canvas.width)));
            const py = Math.min(canvas.height - 1, Math.max(0, Math.round((y / h) * canvas.height)));
            const d = g.getImageData(px, py, 1, 1).data;
            return [d[0] / 255, d[1] / 255, d[2] / 255];
        },
    };
}

// cover-fit, matching CSS background-size: cover / background-position: center —
// this is what keeps the end-of-sequence handoff to the page background seamless
function drawCover(g: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
    const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * s;
    const dh = img.naturalHeight * s;
    g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(url: string): Promise<HTMLImageElement> {
    let p = imageCache.get(url);
    if (!p) {
        p = new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`image failed to load: ${url}`));
            img.src = url;
        });
        imageCache.set(url, p);
    }
    return p;
}

export async function loadTexture(url: string, viewW: number, viewH: number, fit: 'cover' | 'square' = 'cover'): Promise<TextureSource> {
    const img = await loadImage(url);
    return makeSource((g, w, h) => {
        if (fit === 'square') {
            // centred square on black (album art), inset for breathing room —
            // MUST match the page CSS behind the canvas or the handoff jumps
            // (Effects.module.css .bg: background-size min(80vw, 80vh))
            g.fillStyle = '#000';
            g.fillRect(0, 0, w, h);
            const side = Math.min(w, h) * 0.8;
            g.drawImage(img, (w - side) / 2, (h - side) / 2, side, side);
        } else {
            g.fillStyle = '#0a1216';
            g.fillRect(0, 0, w, h);
            drawCover(g, img, w, h);
        }
    }, viewW, viewH);
}

// last resort if the image can't load — gradient + wordmark, like the prototype
export function fallbackTexture(viewW: number, viewH: number): TextureSource {
    return makeSource((g, w, h) => {
        const grad = g.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#0b1419');
        grad.addColorStop(1, '#060c0f');
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#ec7a39';
        g.font = '800 120px Montserrat, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('MINA', w / 2, h / 2);
    }, viewW, viewH);
}

// a texture larger than the device limit would fail to upload
export function clampCanvas(src: HTMLCanvasElement, maxDim: number): HTMLCanvasElement {
    const scale = Math.min(1, maxDim / src.width, maxDim / src.height);
    if (scale >= 1) return src;
    const c = document.createElement('canvas');
    c.width = Math.floor(src.width * scale);
    c.height = Math.floor(src.height * scale);
    c.getContext('2d')?.drawImage(src, 0, 0, c.width, c.height);
    return c;
}
