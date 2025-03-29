import { type NextRequest, NextResponse } from "next/server"

// 内存存储，用于开发和演示
const stats = {
  totalPlayers: 0,
  correctGuesses: 0,
  guessDistribution: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // 现在有10次猜测机会
}

// 获取统计数据
export async function GET() {
  try {
    return NextResponse.json(stats)
  } catch (error) {
    console.error("Error fetching stats:", error)
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 })
  }
}

// 更新统计数据
export async function POST(request: NextRequest) {
  try {
    const { won, attempts } = await request.json()

    // 更新统计数据
    stats.totalPlayers += 1

    if (won) {
      stats.correctGuesses += 1
      if (attempts >= 1 && attempts <= 10) {
        stats.guessDistribution[attempts - 1] += 1
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error updating stats:", error)
    return NextResponse.json({ error: "Failed to update stats" }, { status: 500 })
  }
}

