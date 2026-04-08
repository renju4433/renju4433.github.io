import fs from 'fs'
import path from 'path'
import { AiCandidateAction } from './candidate-actions'

type OrtModule = typeof import('onnxruntime-node')

const modelPath = process.env.AI_ONNX_PATH ?? path.resolve(process.cwd(), 'ai', 'artifacts', 'sgs3v3_policy.onnx')
const vocabPath = process.env.AI_ACTION_VOCAB_PATH ?? path.resolve(process.cwd(), 'ai', 'artifacts', 'action_vocab.json')

let ortPromise: Promise<OrtModule | null> | null = null
let sessionPromise: Promise<any | null> | null = null
let vocabCache: string[] | null = null
let vocabIndexCache: Map<string, number> | null = null

async function getOrt(): Promise<OrtModule | null> {
    if (!ortPromise) {
        ortPromise = import('onnxruntime-node')
            .then((m) => m as OrtModule)
            .catch(() => null)
    }
    return ortPromise
}

async function getSession(): Promise<any | null> {
    if (sessionPromise) return sessionPromise
    sessionPromise = (async () => {
        if (!fs.existsSync(modelPath)) return null
        const ort = await getOrt()
        if (!ort) return null
        try {
            return await ort.InferenceSession.create(modelPath)
        } catch {
            return null
        }
    })()
    return sessionPromise
}

function loadActionVocab(): Map<string, number> | null {
    if (vocabIndexCache) return vocabIndexCache
    if (!fs.existsSync(vocabPath)) return null

    try {
        const raw = JSON.parse(fs.readFileSync(vocabPath, 'utf8')) as unknown
        const tokens = Array.isArray(raw)
            ? raw
            : (raw as { tokens?: unknown[] }).tokens
        if (!Array.isArray(tokens)) return null
        vocabCache = tokens.map((x) => String(x))
        vocabIndexCache = new Map(vocabCache.map((token, idx) => [token, idx]))
        return vocabIndexCache
    } catch {
        return null
    }
}

function softmaxConfidence(scores: number[], chosen: number): number {
    if (scores.length === 0) return 0.5
    const max = Math.max(...scores)
    const exps = scores.map((s) => Math.exp(s - max))
    const sum = exps.reduce((a, b) => a + b, 0)
    if (!Number.isFinite(sum) || sum <= 0) return 0.5
    return exps[chosen] / sum
}

export async function chooseBestCandidate(
    encodedState: Float32Array,
    candidates: AiCandidateAction[]
): Promise<{ candidate: AiCandidateAction; confidence: number; source: 'onnx' | 'heuristic' }> {
    if (candidates.length === 0) {
        throw new Error('No candidates')
    }

    const vocab = loadActionVocab()
    const session = await getSession()
    if (!vocab || !session) {
        return { candidate: candidates[0], confidence: 0.51, source: 'heuristic' }
    }

    const mapped = candidates
        .map((c, i) => ({ idx: i, vocabIdx: vocab.get(c.token) }))
        .filter((x): x is { idx: number; vocabIdx: number } => x.vocabIdx !== undefined)

    if (mapped.length === 0) {
        return { candidate: candidates[0], confidence: 0.5, source: 'heuristic' }
    }

    const ort = await getOrt()
    if (!ort) {
        return { candidate: candidates[0], confidence: 0.5, source: 'heuristic' }
    }

    try {
        const inputName = session.inputNames?.[0] ?? 'obs'
        const outputName = session.outputNames?.[0]
        const inputTensor = new ort.Tensor('float32', encodedState, [1, encodedState.length])
        const outputs = await session.run({ [inputName]: inputTensor })
        const outKey = outputName ?? Object.keys(outputs)[0]
        const logitsTensor = outputs[outKey]
        const logits = Array.from((logitsTensor.data as Float32Array | number[]))

        let bestMappedIdx = 0
        let bestScore = Number.NEGATIVE_INFINITY
        const candidateScores: number[] = []

        for (let i = 0; i < mapped.length; i++) {
            const score = logits[mapped[i].vocabIdx] ?? Number.NEGATIVE_INFINITY
            candidateScores.push(score)
            if (score > bestScore) {
                bestScore = score
                bestMappedIdx = i
            }
        }

        const picked = mapped[bestMappedIdx]
        const confidence = softmaxConfidence(candidateScores, bestMappedIdx)
        return {
            candidate: candidates[picked.idx],
            confidence,
            source: 'onnx',
        }
    } catch {
        return { candidate: candidates[0], confidence: 0.5, source: 'heuristic' }
    }
}

