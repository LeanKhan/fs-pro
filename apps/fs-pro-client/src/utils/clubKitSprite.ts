import playerSprite from '@/assets/sprites/home-player.png';

const FRAME_SIZE = 48;
const TEXTURE_SIZE = 16;
const sprites = new Map<string, Promise<string>>();

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load club kit image'));
    image.src = url;
  });
}

/** Reuse the blue sprite's shirt as a mask, preserving skin, hair, outlines
 * and animation poses. Sample the torso of the existing full-kit artwork;
 * its colors and stripes remain recognizable at replay scale. */
async function createClubKitSprite(kitUrl: string): Promise<string> {
  const [base, kit] = await Promise.all([
    loadImage(playerSprite),
    loadImage(kitUrl),
  ]);
  const canvas = document.createElement('canvas');
  canvas.width = base.naturalWidth;
  canvas.height = base.naturalHeight;
  const context = canvas.getContext('2d');
  const texture = document.createElement('canvas');
  texture.width = texture.height = TEXTURE_SIZE;
  const textureContext = texture.getContext('2d');
  if (!context || !textureContext) throw new Error('Canvas is unavailable');

  // Club assets share a full-body template. This crop excludes the
  // background, collar, shorts and socks while retaining the shirt pattern.
  textureContext.drawImage(
    kit,
    kit.naturalWidth * 0.37,
    kit.naturalHeight * 0.14,
    kit.naturalWidth * 0.26,
    kit.naturalHeight * 0.28,
    0,
    0,
    TEXTURE_SIZE,
    TEXTURE_SIZE
  );
  const colors = textureContext.getImageData(
    0,
    0,
    TEXTURE_SIZE,
    TEXTURE_SIZE
  ).data;
  if (!colors.some((value, index) => index % 4 === 3 && value > 128)) {
    throw new Error('Club kit image is empty');
  }

  context.drawImage(base, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data;
  for (let top = 0; top < canvas.height; top += FRAME_SIZE) {
    for (let left = 0; left < canvas.width; left += FRAME_SIZE) {
      const shirt: { x: number; y: number; index: number }[] = [];
      for (let y = top; y < Math.min(top + FRAME_SIZE, canvas.height); y++) {
        for (let x = left; x < Math.min(left + FRAME_SIZE, canvas.width); x++) {
          const index = (y * canvas.width + x) * 4;
          const [r, g, b, alpha] = data.subarray(index, index + 4);
          if (alpha > 0 && b > 60 && b > r * 1.4 && b > g * 1.15) {
            shirt.push({ x, y, index });
          }
        }
      }
      if (!shirt.length) continue;
      const minX = Math.min(...shirt.map((p) => p.x));
      const maxX = Math.max(...shirt.map((p) => p.x));
      const minY = Math.min(...shirt.map((p) => p.y));
      const maxY = Math.max(...shirt.map((p) => p.y));
      for (const { x, y, index } of shirt) {
        const tx = Math.round(
          ((x - minX) / Math.max(1, maxX - minX)) * (TEXTURE_SIZE - 1)
        );
        const ty = Math.round(
          ((y - minY) / Math.max(1, maxY - minY)) * (TEXTURE_SIZE - 1)
        );
        const source = (ty * TEXTURE_SIZE + tx) * 4;
        if (colors[source + 3] < 128) continue;
        const shade = 0.45 + (data[index + 2] / 255) * 0.55;
        for (let channel = 0; channel < 3; channel++) {
          data[index + channel] = Math.round(colors[source + channel] * shade);
        }
      }
    }
  }
  context.putImageData(pixels, 0, 0);
  // A blob URL is a short string the browser decodes once; a base64 data URL
  // would be hundreds of KB that gets re-parsed with every style update.
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png')
  );
  if (!blob) throw new Error('Unable to encode club kit sprite');
  return URL.createObjectURL(blob);
}

/** Generate once per club, never per player or animation frame. The returned
 * blob URL stays valid for the page's lifetime (one small image per club).
 * Retry failed requests on the next watch rather than caching an unavailable
 * image. */
export function getClubKitSprite(kitUrl: string): Promise<string> {
  let result = sprites.get(kitUrl);
  if (!result) {
    result = createClubKitSprite(kitUrl).catch((error) => {
      sprites.delete(kitUrl);
      throw error;
    });
    sprites.set(kitUrl, result);
  }
  return result;
}
