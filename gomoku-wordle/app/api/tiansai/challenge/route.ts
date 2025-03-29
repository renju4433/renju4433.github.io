import { NextResponse } from "next/server"

// 内存存储，用于开发和演示
let currentChallenge: any = null

// 生成每日填赛挑战
function generateChallenge() {
  const playerNames = ["选手1", "选手2", "选手3", "选手4", "选手5", "选手6"]

  // 生成随机比赛结果矩阵
  const results: number[][] = Array(6)
    .fill(0)
    .map(() => Array(6).fill(0))

  // 设置对角线为0（自己对自己）
  for (let i = 0; i < 6; i++) {
    results[i][i] = 0
  }

  // 随机生成比赛结果
  for (let i = 0; i < 6; i++) {
    for (let j = i + 1; j < 6; j++) {
      // 随机生成0, 0.5, 1
      const rand = Math.random()
      if (rand < 1 / 3) {
        results[i][j] = 0
        results[j][i] = 1
      } else if (rand < 2 / 3) {
        results[i][j] = 0.5
        results[j][i] = 0.5
      } else {
        results[i][j] = 1
        results[j][i] = 0
      }
    }
  }

  // 计算每个玩家的积分和胜局数
  const points: number[] = Array(6).fill(0)
  const wins: number[] = Array(6).fill(0)

  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      if (i !== j) {
        points[i] += results[i][j]
        if (results[i][j] === 1) {
          wins[i]++
        }
      }
    }
  }

  // 计算小分
  const tiebreaker: number[] = Array(6).fill(0)

  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      if (i !== j) {
        if (results[i][j] === 1) {
          tiebreaker[i] += points[j]
        } else if (results[i][j] === 0.5) {
          tiebreaker[i] += points[j] * 0.5
        }
      }
    }
  }

  // 创建玩家数组
  const players = playerNames.map((name, i) => ({
    name,
    points: points[i],
    tiebreaker: tiebreaker[i],
    wins: wins[i],
    answerPoints: points[i], // 保存答案中的积分，用于计算答案小分
  }))

  return {
    players,
    results, // 保存原始结果矩阵，用于计算答案小分
    date: new Date().toDateString(),
  }
}

// 获取当前挑战
export async function GET() {
  try {
    // 检查是否已经有今日挑战
    const today = new Date().toDateString()

    if (!currentChallenge || currentChallenge.date !== today) {
      currentChallenge = generateChallenge()
    }

    return NextResponse.json(currentChallenge)
  } catch (error) {
    console.error("Error generating challenge:", error)
    return NextResponse.json({ error: "Failed to generate challenge" }, { status: 500 })
  }
}

