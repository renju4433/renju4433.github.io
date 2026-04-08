/**
 * 将完整原始局面 JSON 稳定序列化后编码成固定长度向量。
 * 设计目标：不做人为特征裁剪，尽量保留“原封不动”的状态信息。
 */

function stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value)
    }
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`
    }
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort()
    const parts = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    return `{${parts.join(',')}}`
}

export function encodeRawStateToVector(state: unknown, maxBytes = 8192): Float32Array {
    const json = stableStringify(state)
    const bytes = Buffer.from(json, 'utf8')
    const out = new Float32Array(maxBytes + 1)

    const used = Math.min(bytes.length, maxBytes)
    out[0] = used / maxBytes
    for (let i = 0; i < used; i++) {
        out[i + 1] = bytes[i] / 255
    }
    return out
}

