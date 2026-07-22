import { test, expect } from '@playwright/test';

// Builds a tiny (silent) in-memory WAV File so tests can exercise real media
// loading/playback without an on-disk fixture.
async function makeSilentWavFile(page) {
  return page.evaluateHandle(() => {
    const sampleRate = 8000, seconds = 0.2, frames = Math.floor(sampleRate * seconds);
    const buf = new ArrayBuffer(44 + frames * 2);
    const view = new DataView(buf);
    const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
    writeStr(0, 'RIFF'); view.setUint32(4, 36 + frames * 2, true); writeStr(8, 'WAVE');
    writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    writeStr(36, 'data'); view.setUint32(40, frames * 2, true);
    return new File([buf], 'silence.wav', { type: 'audio/wav' });
  });
}

// File playback has no effects rack of its own (just dry audible on/off).
// "Feed Generative" doesn't route raw audio anywhere — it lifts the
// suppression on the modules' own synthesized voices/pings so they keep
// reacting to the file's analysis exactly as they react to the mic.
test.describe('media playback: no FX rack, generative feed option', () => {
  test('engine state has feedGenerative, not effect', async ({ page }) => {
    await page.goto('/screens/screen-01-comms-array.html?embed=1');
    const state = await page.evaluate(() => {
      window.__shipBoot();
      window.__shipMediaConfig({ feedGenerative: true, audible: false });
      return window.__shipMediaState();
    });
    expect(state).toHaveProperty('feedGenerative', true);
    expect(state).not.toHaveProperty('effect');
  });

  test('configureMedia accepts feedGenerative and ignores removed effect params harmlessly', async ({ page }) => {
    await page.goto('/screens/screen-01-comms-array.html?embed=1');
    const ok = await page.evaluate(() => {
      window.__shipBoot();
      // old-style effect config should no longer throw, just be a no-op
      window.__shipMediaConfig({ effect: 'reverb', cutoff: 4000, pitch: 3 });
      window.__shipMediaConfig({ feedGenerative: true });
      return window.__shipMediaState().feedGenerative === true;
    });
    expect(ok).toBe(true);
  });

  test('module voices are suppressed while a file plays, unless feedGenerative is on', async ({ page }) => {
    await page.goto('/screens/screen-01-comms-array.html?embed=1');
    const fileHandle = await makeSilentWavFile(page);
    await page.evaluate(() => window.__shipBoot());
    await page.evaluate(async (file) => { await window.__shipLoadMediaFile(file); }, fileHandle);
    await expect.poll(() => page.evaluate(() => window.__shipMediaState().playing)).toBe(true);

    // default: file playing, feedGenerative off -> voices suppressed (NullVoice, never tracked)
    const suppressedCount = await page.evaluate(() => {
      window.__shipEngine.createSpatialVoice({ freq: 220 });
      return window.__shipEngine._spatialVoices.size;
    });
    expect(suppressedCount).toBe(0);

    // feedGenerative on -> voices allowed again, just like with the mic
    await page.evaluate(() => window.__shipMediaConfig({ feedGenerative: true }));
    const allowedCount = await page.evaluate(() => {
      window.__shipEngine.createSpatialVoice({ freq: 220 });
      return window.__shipEngine._spatialVoices.size;
    });
    expect(allowedCount).toBe(1);
  });

  test('console top bar has Feed Generative toggle and no effect/amount controls', async ({ page }) => {
    await page.goto('/app.html');
    await page.getByRole('button', { name: 'Engage Console' }).click();
    await expect(page.locator('#media-effect')).toHaveCount(0);
    await expect(page.locator('#media-amount')).toHaveCount(0);
    const feedGen = page.locator('#media-feed-gen');
    await expect(feedGen).toHaveCount(1);
    await expect(feedGen).not.toHaveClass(/active/);
    await feedGen.click();
    await expect(feedGen).toHaveClass(/active/);
  });
});
