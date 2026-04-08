import { AiSuggestedCommand, GameState } from 'sgs3v3-shared'
import { generateAiCandidates } from './candidate-actions'
import { chooseBestCandidate } from './onnx-policy'
import { encodeRawStateToVector } from './raw-state-encoder'

export async function suggestActionForPlayer(
    state: GameState,
    playerId: string
): Promise<{ suggestion?: AiSuggestedCommand; message?: string }> {
    const candidates = generateAiCandidates(state, playerId)
    if (candidates.length === 0) {
        return { message: '当前没有可执行的 AI 建议动作' }
    }

    const encoded = encodeRawStateToVector(state)
    const picked = await chooseBestCandidate(encoded, candidates)
    return {
        suggestion: {
            ...picked.candidate.suggestion,
            source: picked.source,
            confidence: picked.confidence,
        },
        message: picked.source === 'onnx'
            ? undefined
            : '未检测到可用 ONNX 模型，已使用规则策略建议',
    }
}

