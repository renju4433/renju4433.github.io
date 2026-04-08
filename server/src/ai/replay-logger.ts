import fs from 'fs'
import path from 'path'
import { GamePhase, GameState } from 'sgs3v3-shared'

interface ReplayTransition {
    version: number
    timestamp: number
    roomCode: string
    playerId: string
    event: string
    payload?: Record<string, unknown>
    state: unknown
}

const replayEnabled = (process.env.AI_REPLAY_ENABLED ?? '1') !== '0'
const replayDir = process.env.AI_REPLAY_DIR ?? path.resolve(process.cwd(), 'ai', 'replays')

let replayDirReady = false
function ensureReplayDir(): void {
    if (replayDirReady) return
    fs.mkdirSync(replayDir, { recursive: true })
    replayDirReady = true
}

export function snapshotState(state: GameState): GameState {
    return JSON.parse(JSON.stringify(state)) as GameState
}

export function recordReplayTransition(params: {
    roomCode: string
    playerId: string
    event: string
    payload?: Record<string, unknown>
    stateBefore: GameState
}): void {
    if (!replayEnabled) return
    if (params.stateBefore.phase !== GamePhase.PLAYING) return

    try {
        ensureReplayDir()
        const row: ReplayTransition = {
            version: 1,
            timestamp: Date.now(),
            roomCode: params.roomCode,
            playerId: params.playerId,
            event: params.event,
            payload: params.payload,
            state: params.stateBefore,
        }
        const line = JSON.stringify(row)
        const file = path.join(replayDir, `${params.roomCode}.jsonl`)
        fs.appendFileSync(file, `${line}\n`, { encoding: 'utf8' })
    } catch (err) {
        console.warn('[AI Replay] failed to write transition:', err)
    }
}

