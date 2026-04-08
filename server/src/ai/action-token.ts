import { GameState } from 'sgs3v3-shared'

function safePart(v: unknown): string {
    if (v === null || v === undefined) return 'none'
    return String(v).replace(/[|=\s]/g, '_')
}

function bucketCount(n: number): string {
    if (n <= 0) return '0'
    if (n === 1) return '1'
    if (n === 2) return '2'
    if (n === 3) return '3'
    return '4p'
}

function findCardNameById(state: GameState, cardId?: string): string {
    if (!cardId) return 'none'
    for (const g of state.generals) {
        const inHand = g.hand.find((c) => c.id === cardId)
        if (inHand) return String(inHand.name)
        const inJudge = g.judgeZone.find((c) => c.id === cardId)
        if (inJudge) return String(inJudge.name)
        for (const equip of Object.values(g.equip)) {
            if (equip?.id === cardId) return String(equip.name)
        }
    }
    const inDeck = state.deck.find((c) => c.id === cardId)
    if (inDeck) return String(inDeck.name)
    const inDiscard = state.discard.find((c) => c.id === cardId)
    if (inDiscard) return String(inDiscard.name)
    return 'unknown_card'
}

function targetMode(state: GameState, playerId: string, targetIndices?: unknown): string {
    if (!Array.isArray(targetIndices) || targetIndices.length === 0) return 'none'
    if (targetIndices.length > 1) return 'multi'
    const idx = targetIndices[0]
    if (typeof idx !== 'number') return 'unknown'
    const target = state.generals[idx]
    if (!target) return 'unknown'
    if (target.playerId === playerId) {
        return state.activeGeneralIndex === idx ? 'self' : 'ally'
    }
    return 'enemy'
}

function join(parts: string[]): string {
    return parts.map((p) => safePart(p)).join('|')
}

/**
 * 将原始协议动作映射为稳定 token（用于训练标签 / 线上候选动作打分）。
 */
export function actionToToken(
    state: GameState,
    playerId: string,
    event: string,
    payload?: Record<string, unknown>
): string {
    const p = payload ?? {}

    switch (event) {
        case 'use_card': {
            const cardName = findCardNameById(state, p.cardId as string | undefined)
            const mode = targetMode(state, playerId, p.targetIndices)
            const direction = (p.extra as Record<string, unknown> | undefined)?.direction as string | undefined
            const asSkill = p.asSkill as string | undefined
            return join([
                'use_card',
                `card=${cardName}`,
                `target=${mode}`,
                `dir=${direction ?? 'none'}`,
                `as=${asSkill ?? 'none'}`,
            ])
        }
        case 'use_skill': {
            const skillId = p.skillId as string | undefined
            const mode = targetMode(state, playerId, p.targetIndices)
            return join([
                'use_skill',
                `id=${skillId ?? 'unknown_skill'}`,
                `target=${mode}`,
                `cards=${bucketCount(Array.isArray(p.cardIds) ? p.cardIds.length : 0)}`,
            ])
        }
        case 'respond': {
            const cardName = findCardNameById(state, p.cardId as string | undefined)
            const action = (p.action as string | undefined) ?? 'none'
            return join(['respond', `card=${cardName}`, `action=${action}`])
        }
        case 'discard': {
            const count = Array.isArray(p.cardIds) ? p.cardIds.length : 0
            return join(['discard', `count=${bucketCount(count)}`])
        }
        case 'choose_action_unit':
            return join(['choose_action_unit', `unit=${(p.unit as string | undefined) ?? 'unknown'}`])
        case 'yield_choice':
            return join(['yield_choice', `yield=${Boolean(p.yield)}`])
        case 'negate_respond':
            return join(['negate_respond', `play=${p.cardId ? 'yes' : 'no'}`])
        case 'end_turn':
            return 'end_turn'
        default:
            return join(['unknown', `event=${event}`])
    }
}

