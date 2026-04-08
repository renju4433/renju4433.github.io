import {
    ActionUnitType,
    AiSuggestedCommand,
    BasicCardName,
    Card,
    CardCategory,
    CardSuit,
    Faction,
    GamePhase,
    GameState,
    ResponseType,
    TrickCardName,
    TurnPhase,
} from 'sgs3v3-shared'
import { getAttackRange } from '../core/game-state'
import { actionToToken } from './action-token'

export interface AiCandidateAction {
    token: string
    suggestion: AiSuggestedCommand
}

function pushCandidate(
    out: AiCandidateAction[],
    state: GameState,
    playerId: string,
    event: AiSuggestedCommand['event'],
    label: string,
    payload?: Record<string, unknown>
): void {
    const token = actionToToken(state, playerId, event, payload)
    out.push({
        token,
        suggestion: {
            event,
            payload,
            label,
            confidence: 0,
            source: 'heuristic',
        },
    })
}

function dedupeByToken(candidates: AiCandidateAction[]): AiCandidateAction[] {
    const seen = new Set<string>()
    const out: AiCandidateAction[] = []
    for (const c of candidates) {
        if (seen.has(c.token)) continue
        seen.add(c.token)
        out.push(c)
    }
    return out
}

function canUseAsDodge(generalId: string, card: Card): boolean {
    if (card.name === BasicCardName.DODGE) return true
    if (generalId === 'zhaoyun' && card.name === BasicCardName.ATTACK) return true
    if (generalId === 'zhenji' && (card.suit === CardSuit.SPADE || card.suit === CardSuit.CLUB)) return true
    return false
}

function canUseAsAttack(generalId: string, card: Card): boolean {
    if (card.name === BasicCardName.ATTACK) return true
    if (generalId === 'zhaoyun' && card.name === BasicCardName.DODGE) return true
    if (generalId === 'guanyu' && (card.suit === CardSuit.HEART || card.suit === CardSuit.DIAMOND)) return true
    return false
}

function firstAliveGeneralIndexByPlayerId(state: GameState, playerId: string): number {
    const idx = state.generals.findIndex((g) => g.playerId === playerId && g.alive)
    return idx >= 0 ? idx : 0
}

function generatePendingCandidates(state: GameState, playerId: string): AiCandidateAction[] {
    const out: AiCandidateAction[] = []
    const pending = state.pendingResponseQueue[0]
    if (!pending) return out

    const general = state.generals[pending.targetGeneralIndex]
    if (!general || general.playerId !== playerId) return out

    switch (pending.type) {
        case ResponseType.DODGE:
        case ResponseType.AOE_DODGE: {
            const dodge = general.hand.find((c) => canUseAsDodge(general.generalId, c))
            if (dodge) {
                pushCandidate(out, state, playerId, 'respond', `响应【闪】(${dodge.name})`, {
                    cardId: dodge.id,
                })
            }
            pushCandidate(out, state, playerId, 'respond', '放弃响应', { action: 'decline' })
            return out
        }

        case ResponseType.ATTACK_DUEL:
        case ResponseType.AOE_ATTACK:
        case ResponseType.BARBARIANS_RESPONSE: {
            const attack = general.hand.find((c) => canUseAsAttack(general.generalId, c))
            if (attack) {
                pushCandidate(out, state, playerId, 'respond', `响应【杀】(${attack.name})`, {
                    cardId: attack.id,
                })
            }
            pushCandidate(out, state, playerId, 'respond', '放弃响应', { action: 'decline' })
            return out
        }

        case ResponseType.PEACH_SAVE:
        case ResponseType.PEACH_SAVE_ASK: {
            const peach = general.hand.find((c) => c.name === BasicCardName.PEACH)
            if (peach) {
                pushCandidate(out, state, playerId, 'respond', '响应【桃】救人', { cardId: peach.id })
            }
            pushCandidate(out, state, playerId, 'respond', '放弃救援', { action: 'decline' })
            return out
        }

        case ResponseType.NEGATE_CHANCE: {
            const myAlive = state.generals
                .map((g, idx) => ({ g, idx }))
                .filter(({ g }) => g.alive && g.playerId === playerId)
            for (const { g, idx } of myAlive) {
                const negate = g.hand.find((c) => c.name === TrickCardName.NEGATE)
                if (negate) {
                    pushCandidate(out, state, playerId, 'negate_respond', `打出【无懈可击】(${g.generalId})`, {
                        cardId: negate.id,
                        generalIndex: idx,
                    })
                }
            }
            pushCandidate(out, state, playerId, 'negate_respond', '放弃无懈', {
                generalIndex: firstAliveGeneralIndexByPlayerId(state, playerId),
            })
            return out
        }

        case ResponseType.SKILL_ACTIVATE_CONFIRM: {
            pushCandidate(out, state, playerId, 'respond', '发动技能', { action: 'confirm' })
            pushCandidate(out, state, playerId, 'respond', '放弃发动', { action: 'decline' })
            return out
        }

        default:
            pushCandidate(out, state, playerId, 'respond', '放弃当前响应', { action: 'decline' })
            return out
    }
}

function hasCardToStealOrDismantle(target: GameState['generals'][number]): boolean {
    const equipCount = Object.values(target.equip).filter(Boolean).length
    return target.hand.length + equipCount + target.judgeZone.length > 0
}

function generateActionPhaseCandidates(
    state: GameState,
    playerId: string,
    myFaction: Faction
): AiCandidateAction[] {
    const out: AiCandidateAction[] = []
    const active = state.generals[state.activeGeneralIndex]
    if (!active || active.playerId !== playerId || state.turnPhase !== TurnPhase.ACTION) {
        return out
    }

    const aliveEnemies = state.generals
        .map((g, idx) => ({ g, idx }))
        .filter(({ g }) => g.alive && g.faction !== myFaction)

    for (const card of active.hand.slice(0, 12)) {
        if (card.category === CardCategory.EQUIPMENT) {
            pushCandidate(out, state, playerId, 'use_card', `装备【${card.name}】`, {
                cardId: card.id,
                targetIndices: [],
            })
            continue
        }

        if (card.name === BasicCardName.PEACH) {
            if (active.hp < active.maxHp) {
                pushCandidate(out, state, playerId, 'use_card', '使用【桃】回复体力', {
                    cardId: card.id,
                    targetIndices: [state.activeGeneralIndex],
                })
            }
            continue
        }

        if (card.name === BasicCardName.ATTACK) {
            const target = aliveEnemies.find(({ g }) => getAttackRange(active, g, state.generals).inRange)
            if (target) {
                pushCandidate(out, state, playerId, 'use_card', `使用【杀】-> ${target.g.generalId}`, {
                    cardId: card.id,
                    targetIndices: [target.idx],
                })
            }
            continue
        }

        if (card.name === TrickCardName.DRAW_TWO) {
            pushCandidate(out, state, playerId, 'use_card', '使用【无中生有】', {
                cardId: card.id,
                targetIndices: [],
            })
            continue
        }

        if (
            card.name === TrickCardName.BARBARIANS ||
            card.name === TrickCardName.ARROWS ||
            card.name === TrickCardName.PEACH_GARDEN ||
            card.name === TrickCardName.HARVEST
        ) {
            pushCandidate(out, state, playerId, 'use_card', `使用【${card.name}】`, {
                cardId: card.id,
                targetIndices: [],
                extra: { direction: 'clockwise' },
            })
            continue
        }

        if (card.name === TrickCardName.DUEL) {
            const target = aliveEnemies[0]
            if (target) {
                pushCandidate(out, state, playerId, 'use_card', `使用【决斗】-> ${target.g.generalId}`, {
                    cardId: card.id,
                    targetIndices: [target.idx],
                })
            }
            continue
        }

        if (card.name === TrickCardName.DISMANTLE || card.name === TrickCardName.STEAL) {
            const target = aliveEnemies.find(({ g }) => hasCardToStealOrDismantle(g))
            if (target) {
                pushCandidate(out, state, playerId, 'use_card', `使用【${card.name}】-> ${target.g.generalId}`, {
                    cardId: card.id,
                    targetIndices: [target.idx],
                })
            }
            continue
        }

        if (card.name === TrickCardName.OVERINDULGENCE || card.name === TrickCardName.SUPPLY_SHORTAGE) {
            const target = aliveEnemies.find(({ g }) => !g.judgeZone.some((j) => j.name === card.name))
            if (target) {
                pushCandidate(out, state, playerId, 'use_card', `使用延时锦囊 -> ${target.g.generalId}`, {
                    cardId: card.id,
                    targetIndices: [target.idx],
                })
            }
            continue
        }
    }

    pushCandidate(out, state, playerId, 'end_turn', '结束出牌阶段')
    return out
}

function generateDiscardCandidates(state: GameState, playerId: string): AiCandidateAction[] {
    const out: AiCandidateAction[] = []
    const active = state.generals[state.activeGeneralIndex]
    if (!active || active.playerId !== playerId || state.turnPhase !== TurnPhase.DISCARD) {
        return out
    }
    const mustDiscard = active.hand.length - active.hp
    if (mustDiscard <= 0) return out
    pushCandidate(out, state, playerId, 'discard', `弃置${mustDiscard}张牌`, {
        cardIds: active.hand.slice(0, mustDiscard).map((c) => c.id),
    })
    return out
}

function generateMacroCandidates(state: GameState, playerId: string, myFaction: Faction): AiCandidateAction[] {
    const out: AiCandidateAction[] = []

    if (state.roundState.waitingForYield && myFaction === Faction.COOL) {
        pushCandidate(out, state, playerId, 'yield_choice', '选择先手', { yield: false })
        pushCandidate(out, state, playerId, 'yield_choice', '选择让先', { yield: true })
        return out
    }

    const step = state.roundState.currentActionStep
    const needChooseUnit =
        !state.roundState.waitingForYield &&
        state.activePlayerFaction === myFaction &&
        state.activeGeneralIndex === -1 &&
        (step === 0 || step === 2 || step === 4 || step === 5)

    if (needChooseUnit) {
        pushCandidate(out, state, playerId, 'choose_action_unit', '选择主帅行动', {
            unit: ActionUnitType.COMMANDER,
        })
        pushCandidate(out, state, playerId, 'choose_action_unit', '选择边锋行动', {
            unit: ActionUnitType.FLANKS,
        })
    }

    return out
}

export function generateAiCandidates(state: GameState, playerId: string): AiCandidateAction[] {
    const player = state.players[playerId]
    if (!player?.faction) return []
    if (state.phase !== GamePhase.PLAYING) return []

    const myFaction = player.faction
    const pending = state.pendingResponseQueue[0]

    if (pending) {
        return dedupeByToken(generatePendingCandidates(state, playerId))
    }

    const out: AiCandidateAction[] = []
    out.push(...generateMacroCandidates(state, playerId, myFaction))
    out.push(...generateActionPhaseCandidates(state, playerId, myFaction))
    out.push(...generateDiscardCandidates(state, playerId))
    return dedupeByToken(out)
}

