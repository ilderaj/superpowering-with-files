import { RenderVerifyTimeoutError } from './cdp.mjs';

const SETTLE_EXPRESSION = `((timeoutMs) => {
  const wait = (promise, ms) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('settle timeout')), ms)),
  ]);
  const imageReady = (image) => {
    if (image.complete) return image.decode ? image.decode().catch(() => undefined) : Promise.resolve();
    return new Promise((resolve) => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', resolve, { once: true });
    });
  };
  return wait((async () => {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const images = [...document.images];
    await Promise.all(images.map(imageReady));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { readyState: document.readyState, fonts: document.fonts ? document.fonts.status : 'unavailable', images: images.length, frames: 2 };
  })(), timeoutMs);
})(__TIMEOUT__)`;

export async function settlePage(page, { timeoutMs = 5000 } = {}) {
  try {
    return await page.evaluate(SETTLE_EXPRESSION.replace('__TIMEOUT__', String(Math.max(1, timeoutMs))), timeoutMs + 250);
  } catch (error) {
    await page.terminateExecution();
    if (error.code === 'ERR_RENDER_VERIFY_TIMEOUT' || /settle timeout/i.test(error.message)) {
      throw new RenderVerifyTimeoutError(`Page did not settle within ${timeoutMs}ms`);
    }
    throw error;
  }
}
