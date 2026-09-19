import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { isMacosTahoeOrNewer } from '../window/macos-tahoe-release'

/**
 * Runs the real Swift helper. Everything above it is unit-tested against a
 * fake, which cannot catch a drift in the helper's own CLI or event shape —
 * only a real run does.
 *
 * Skipped unless this is a macOS 26+ box that has already built the helper
 * (`pnpm run build:speech-transcriber-macos`), so CI and Linux stay unaffected.
 */
const HELPER_PATH = join(
  import.meta.dirname,
  '../../../native/speech-transcriber-macos/.build/release/orca-speech-transcriber'
)
const canRun = process.platform === 'darwin' && isMacosTahoeOrNewer() && existsSync(HELPER_PATH)

vi.mock('./apple-speech-helper-binary', () => ({
  getAppleSpeechHelperPath: () => HELPER_PATH
}))

const describeWithHelper = canRun ? describe : describe.skip

describeWithHelper('orca-speech-transcriber', () => {
  it('answers the status query with an arm the model states understand', async () => {
    const { readAppleSpeechAssetStatus } = await import('./apple-speech-assets')

    expect(['installed', 'downloading', 'supported', 'unsupported']).toContain(
      await readAppleSpeechAssetStatus()
    )
  })

  it('transcribes fed audio into partial and final segments', async () => {
    const { readAppleSpeechAssetStatus } = await import('./apple-speech-assets')
    if ((await readAppleSpeechAssetStatus()) !== 'installed') {
      return
    }
    const { AppleSpeechSession } = await import('./apple-speech-session')
    const events: { type: string; text?: string }[] = []
    const session = new AppleSpeechSession((event) => events.push(event))

    await session.start()
    // 2s of silence is enough to prove the audio path: the helper accepts the
    // frames, finalizes, and exits without an error event.
    session.feedAudio(new Float32Array(32000), 16000)
    await session.finish()

    expect(events.filter((event) => event.type === 'error')).toEqual([])
  }, 60_000)
})
