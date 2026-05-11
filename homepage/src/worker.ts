import { normalizeHomepageRequestUrl } from './route-utils.mjs';

export interface Env {
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const normalized = normalizeHomepageRequestUrl(request.url);

    if (normalized.action === 'redirect') {
      return Response.redirect(normalized.url, normalized.status);
    }

    if (normalized.action === 'not_found') {
      return new Response('Not found', { status: 404 });
    }

    return env.ASSETS.fetch(new Request(normalized.url, request));
  }
};
