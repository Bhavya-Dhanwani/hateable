// Importing modules
import env from '../config/env.config.js';
import logger from '../config/logger.config.js';
import { hasMcpServer, openReplicateSession } from './mcp.service.js';

/**
 * Images for the sites the agents build.
 *
 * A worker never writes image URLs itself. It writes tokens like `{{img:hero}}` into its
 * code and lists what each token should be in its `images` output; `save` resolves them
 * here and swaps the tokens before the files are written:
 *
 * - photo: an Unsplash search. Unsplash's API terms require hotlinking (we use their URL,
 *   never a copy), crediting the photographer and pinging `download_location` once used.
 * - generated: a text-to-image model run through Replicate's MCP server. The bytes are saved
 *   into the project (e.g. public/images/logo.webp) and the token becomes its public path.
 *
 * Anything that cannot be resolved (no key, no result, API down) becomes a neutral inline
 * placeholder, so a missing image never breaks the build.
 */

export const ImageAspects = ['1:1', '4:3', '3:4', '16:9', '9:16'] as const;

export type ImageRequest = {
  id: string; // token name: {{img:<id>}}
  kind: 'photo' | 'generated';
  description: string; // search query for photos, prompt for generated images
  aspect: (typeof ImageAspects)[number];
  path?: string; // generated only: where to save it in the project, e.g. public/images/logo.webp
};

export type ResolvedImage = {
  url: string; // what {{img:<id>}} becomes
  credit: string; // what {{img-credit:<id>}} becomes, e.g. "Photo by Jane Doe on Unsplash"
  creditUrl: string; // what {{img-credit-url:<id>}} becomes, the photographer's Unsplash profile
  file?: { path: string; dataUrl: string }; // generated images to write into the project
};

// Unsplash asks for these on every link back to them
const UTM = 'utm_source=hateable&utm_medium=referral';

// a light grey frame with the aspect ratio of the request, works offline and in any stack
function placeholder(aspect: ImageRequest['aspect']): ResolvedImage {
  const [w, h] = aspect.split(':').map((n) => Number(n) * 100);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#e4e4e7"/></svg>`;
  return { url: `data:image/svg+xml,${encodeURIComponent(svg)}`, credit: '', creditUrl: '' };
}

const unsplashOrientation = (aspect: ImageRequest['aspect']) =>
  aspect === '1:1' ? 'squarish' : aspect === '3:4' || aspect === '9:16' ? 'portrait' : 'landscape';

// function to find one Unsplash photo for a description
async function findPhoto(req: ImageRequest): Promise<ResolvedImage | null> {
  if (!env.UNSPLASH_ACCESS_KEY) return null;

  const headers = { Authorization: `Client-ID ${env.UNSPLASH_ACCESS_KEY}`, 'Accept-Version': 'v1' };
  const query = new URLSearchParams({
    query: req.description.slice(0, 100),
    per_page: '1',
    orientation: unsplashOrientation(req.aspect),
    content_filter: 'high'
  });

  const res = await fetch(`https://api.unsplash.com/search/photos?${query}`, { headers });
  if (!res.ok) throw new Error(`Unsplash search failed: ${res.status}`);

  const photo = (await res.json()).results?.[0];
  if (!photo) return null;

  // counting the use, as the API guidelines require (fire and forget)
  void fetch(photo.links.download_location, { headers }).catch(() => {});

  return {
    url: `${photo.urls.raw}&w=1600&q=80&auto=format&fit=crop`,
    credit: `Photo by ${photo.user.name} on Unsplash`,
    creditUrl: `${photo.user.links.html}?${UTM}`
  };
}

// MCP tool results arrive as text (sometimes as content blocks); the payload is the prediction JSON
function parsePrediction(result: unknown): {
  id: string;
  status: string;
  output?: unknown;
  error?: string;
} {
  const text = Array.isArray(result)
    ? result.map((block) => (block as { text?: string }).text ?? '').join('')
    : String(result);
  return JSON.parse(text);
}

// public/ (or client/public/) is served from the site root by Vite, Next.js and CRA alike
export const publicUrlOf = (path: string) => `/${path.replace(/^(.*\/)?public\//, '')}`;

type ReplicateSession = Awaited<ReturnType<typeof openReplicateSession>>;

// function to generate one image through Replicate's MCP server and return its bytes as a data URL
async function generate(
  session: ReplicateSession,
  req: ImageRequest
): Promise<ResolvedImage | null> {
  if (!req.path) return null;

  const [owner, name] = env.IMAGE_MODEL.split('/');
  let prediction = parsePrediction(
    await session.createPrediction.invoke({
      model_owner: owner,
      model_name: name,
      Prefer: 'wait=60', // let Replicate hold the request until the image is ready
      input: {
        prompt: req.description,
        aspect_ratio: req.aspect,
        output_format: 'webp',
        num_outputs: 1
      }
    })
  );

  // slow models can outlive the wait: poll for at most another minute
  for (let i = 0; i < 30 && ['starting', 'processing'].includes(prediction.status); i++) {
    await new Promise((r) => setTimeout(r, 2000));
    prediction = parsePrediction(
      await session.getPrediction.invoke({ prediction_id: prediction.id })
    );
  }

  if (prediction.status !== 'succeeded') {
    throw new Error(
      `Replicate prediction ${prediction.status}: ${prediction.error ?? 'no output'}`
    );
  }

  const output = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  const image = await fetch(String(output));
  if (!image.ok) throw new Error(`Downloading the generated image failed: ${image.status}`);

  const bytes = Buffer.from(await image.arrayBuffer());
  const type = image.headers.get('content-type') || 'image/webp';
  const path = req.path.replace(/^\/+/, '');

  return {
    url: publicUrlOf(path),
    credit: '',
    creditUrl: '',
    file: { path, dataUrl: `data:${type};base64,${bytes.toString('base64')}` }
  };
}

/**
 * Per-run image resolver. The Replicate child process is started on the first generated
 * image only, and `close` must be called when the run ends. `generate: false` turns AI image
 * generation off and serves stock photos instead.
 */
export function createImageResolver(
  emit: (message: string) => void,
  opts: { generate?: boolean } = {}
) {
  let session: Promise<ReplicateSession> | null = null;
  let used = 0;

  async function resolveOne(req: ImageRequest): Promise<ResolvedImage> {
    if (++used > env.MAX_IMAGES_PER_RUN) return placeholder(req.aspect);

    // generation can be off for this project (free plan): those images fall back to stock photos
    if (req.kind === 'generated' && opts.generate !== false && hasMcpServer('replicate')) {
      try {
        emit(`generating image "${req.id}"...`);
        session ??= openReplicateSession();
        const generated = await generate(await session, req);
        if (generated) return generated;
      } catch (err) {
        logger.warn(err, `Generating image ${req.id} failed, trying a stock photo instead`);
      }
    }

    try {
      // photos, and generated images when generation is unavailable or failed
      emit(`finding a photo for "${req.id}"...`);
      return (await findPhoto(req)) ?? placeholder(req.aspect);
    } catch (err) {
      logger.warn(err, `Image ${req.id} could not be resolved, using a placeholder`);
      emit(`image "${req.id}" unavailable, using a placeholder`);
      return placeholder(req.aspect);
    }
  }

  return {
    // resolves every image of one agent in parallel, keyed by id
    async resolve(requests: ImageRequest[]) {
      const resolved = await Promise.all(requests.map(resolveOne));
      return Object.fromEntries(requests.map((req, i) => [req.id, resolved[i]]));
    },

    async close() {
      // the session may have failed to start; there is nothing to close then
      if (session) await session.then((s) => s.close()).catch(() => {});
    }
  };
}

// function to swap the image tokens in a file for their resolved values
export function applyImageTokens(content: string, images: Record<string, ResolvedImage>) {
  return content.replace(
    /\{\{(img|img-credit|img-credit-url):([\w-]+)\}\}/g,
    (token, kind: string, id: string) => {
      const image = images[id];
      if (!image) return token;
      return kind === 'img' ? image.url : kind === 'img-credit' ? image.credit : image.creditUrl;
    }
  );
}
