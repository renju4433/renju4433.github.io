import { NextResponse } from "next/server"

// 内存存储，用于开发和演示
let tiansaiStats = {
  totalPlayers: 0,
  correctGuesses: 0,
  date: new Date().toDateString(),
}

// 获取统计数据
export async function GET() {
  try {
    // 检查是否需要重置统计数据（新的一天）
    const today = new Date().toDateString()
    if (tiansaiStats.date !== today) {
      tiansaiStats = {
        totalPlayers: 0,
        correctGuesses: 0,
        date: today,
      }
    }

    return NextResponse.json(tiansaiStats)
  } catch (error) {
    console.error("Error fetching tiansai stats:", error)
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 })
  }
}

// 更新统计数据
export async function POST(request: Request) {
  try {
    const { won } = await request.json()

    // 检查是否需要重置统计数据（新的一天）
    const today = new Date().toDateString()
    if (tiansaiStats.date !== today) {
      tiansaiStats = {
        totalPlayers: 0,
        correctGuesses: 0,
        date: today,
      }
    }

    // 更新统计数据
    tiansaiStats.totalPlayers += 1
    if (won) {
      tiansaiStats.correctGuesses += 1
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error updating tiansai stats:", error)
    return NextResponse.json({ error: "Failed to update stats" }, { status: 500 })
  }
}

