import assert from 'node:assert/strict';
import { applyImageTokens, createImageResolver, publicUrlOf } from './image.service.js';

// tokens are swapped, unknown ids are left alone so the reviewer can spot them
const images = {
  hero: {
    url: 'https://images.unsplash.com/x?w=1600',
    credit: 'Photo by Jane on Unsplash',
    creditUrl: 'https://unsplash.com/@jane'
  }
};
assert.equal(
  applyImageTokens(
    '<img src="{{img:hero}}"><a href="{{img-credit-url:hero}}">{{img-credit:hero}}</a>{{img:nope}}',
    images
  ),
  '<img src="https://images.unsplash.com/x?w=1600"><a href="https://unsplash.com/@jane">Photo by Jane on Unsplash</a>{{img:nope}}'
);

// generated files are served from the site root, whatever the stack's public folder is
assert.equal(publicUrlOf('public/images/logo.webp'), '/images/logo.webp');
assert.equal(publicUrlOf('client/public/logo.webp'), '/logo.webp');

// with no Unsplash/Replicate keys every image becomes a placeholder of the right shape, and the run cap holds
const events: string[] = [];
const resolver = createImageResolver((m) => events.push(m));
const out = await resolver.resolve([
  { id: 'a', kind: 'photo', description: 'coffee', aspect: '16:9' },
  { id: 'b', kind: 'generated', description: 'a logo', aspect: '1:1', path: 'public/logo.webp' }
]);
assert.match(out.a.url, /^data:image\/svg\+xml,.*width%3D%221600%22.*height%3D%22900%22/);
assert.match(out.b.url, /^data:image\/svg\+xml,.*width%3D%22100%22/);
assert.equal(out.b.file, undefined);
await resolver.close();

console.log('image.service checks passed');
