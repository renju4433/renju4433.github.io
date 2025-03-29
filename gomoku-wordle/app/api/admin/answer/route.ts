import { type NextRequest, NextResponse } from "next/server"

// 内存存储，用于开发和演示
let currentAnswer = ""

// 获取当前答案
export async function GET() {
  try {
    return NextResponse.json({ answer: currentAnswer })
  } catch (error) {
    console.error("Error fetching answer:", error)
    return NextResponse.json({ error: "Failed to fetch answer" }, { status: 500 })
  }
}

// 设置今日答案
export async function POST(request: NextRequest) {
  try {
    const { player1, player2 } = await request.json()

    // 验证输入
    if (!player1 || !player2 || player1.length !== 3 || player2.length !== 3) {
      return NextResponse.json(
        { error: "Invalid input. Each player name must be exactly 3 characters." },
        { status: 400 },
      )
    }

    const answer = player1 + player2

    // 保存答案到内存中
    currentAnswer = answer

    return NextResponse.json({ success: true, answer })
  } catch (error) {
    console.error("Error setting answer:", error)
    return NextResponse.json({ error: "Failed to set answer" }, { status: 500 })
  }
}

