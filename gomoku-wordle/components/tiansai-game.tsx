"use client"

import { useEffect, useState } from "react"
import { useToast } from "@/components/ui/use-toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getDailyTiansaiChallenge, saveTiansaiGameState, loadTiansaiGameState } from "@/lib/tiansai-utils"
import TiansaiStats from "./tiansai-stats"

type GameStatus = "playing" | "won"
type Player = {
  name: string
  points: number
  tiebreaker: number
  wins: number
  answerPoints: number // 答案中的积分
}
type Result = {
  value: number
  isFixed: boolean
}
type ResultMatrix = Result[][]

export default function TiansaiGame() {
  const { toast } = useToast()
  const [gameStatus, setGameStatus] = useState<GameStatus>("playing")
  const [challenge, setChallenge] = useState<{
    players: Player[]
    results: number[][] // 原始结果矩阵
    date: string
  } | null>(null)
  const [results, setResults] = useState<ResultMatrix>([])
  const [calculatedStats, setCalculatedStats] = useState<{
    points: number[]
    tiebreaker: number[]
    answerTiebreaker: number[] // 答案小分
    wins: number[]
  }>({
    points: [],
    tiebreaker: [],
    answerTiebreaker: [],
    wins: [],
  })
  const [correctStats, setCorrectStats] = useState<{
    points: boolean[]
    tiebreaker: boolean[]
    answerTiebreaker: boolean[] // 答案小分是否正确
    wins: boolean[]
  }>({
    points: [],
    tiebreaker: [],
    answerTiebreaker: [],
    wins: [],
  })
  const [hasSubmittedStats, setHasSubmittedStats] = useState(false)

  // 初始化游戏
  useEffect(() => {
    const initGame = async () => {
      try {
        const dailyChallenge = await getDailyTiansaiChallenge()
        if (dailyChallenge) {
          setChallenge(dailyChallenge)

          // 尝试加载保存的游戏状态
          const savedState = loadTiansaiGameState()
          if (savedState && savedState.date === dailyChallenge.date) {
            setResults(savedState.results)
            setGameStatus(savedState.gameStatus)
            setHasSubmittedStats(savedState.hasSubmittedStats || false)
          } else {
            // 初始化结果矩阵，默认所有比赛为平局(0.5)
            const initialResults: ResultMatrix = Array(6)
              .fill(0)
              .map(() =>
                Array(6)
                  .fill(0)
                  .map(() => ({ value: 0.5, isFixed: false })),
              )

            // 设置对角线为不可编辑（自己对自己）
            for (let i = 0; i < 6; i++) {
              initialResults[i][i] = { value: 0, isFixed: true }
            }

            setResults(initialResults)
          }
        } else {
          toast({
            title: "游戏未准备好",
            description: "无法加载今日挑战",
            variant: "destructive",
          })
        }
      } catch (error) {
        console.error("初始化游戏失败:", error)
        toast({
          title: "加载失败",
          description: "无法加载游戏数据",
          variant: "destructive",
        })
      }
    }

    initGame()
  }, [toast])

  // 计算统计数据
  useEffect(() => {
    if (!challenge || results.length === 0) return

    // 计算每个玩家的积分、小分和胜局数
    const points: number[] = Array(6).fill(0)
    const wins: number[] = Array(6).fill(0)
    const tiebreaker: number[] = Array(6).fill(0)
    const answerTiebreaker: number[] = Array(6).fill(0)

    // 计算积分和胜局数
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        if (i !== j) {
          points[i] += results[i][j].value
          if (results[i][j].value === 1) {
            wins[i]++
          }
        }
      }
    }

    // 计算小分（使用当前填写的积分）
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        if (i !== j) {
          if (results[i][j].value === 1) {
            tiebreaker[i] += points[j]
          } else if (results[i][j].value === 0.5) {
            tiebreaker[i] += points[j] * 0.5
          }
        }
      }
    }

    // 计算答案小分（使用答案中的积分）
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        if (i !== j) {
          if (results[i][j].value === 1) {
            answerTiebreaker[i] += challenge.players[j].answerPoints
          } else if (results[i][j].value === 0.5) {
            answerTiebreaker[i] += challenge.players[j].answerPoints * 0.5
          }
        }
      }
    }

    setCalculatedStats({
      points,
      tiebreaker,
      answerTiebreaker,
      wins,
    })

    // 检查是否正确
    const correctPoints = points.map((p, i) => Math.abs(p - challenge.players[i].points) < 0.01)
    const correctTiebreaker = tiebreaker.map((t, i) => Math.abs(t - challenge.players[i].tiebreaker) < 0.01)
    const correctAnswerTiebreaker = answerTiebreaker.map((t, i) => Math.abs(t - challenge.players[i].tiebreaker) < 0.01)
    const correctWins = wins.map((w, i) => w === challenge.players[i].wins)

    setCorrectStats({
      points: correctPoints,
      tiebreaker: correctTiebreaker,
      answerTiebreaker: correctAnswerTiebreaker,
      wins: correctWins,
    })

    // 检查是否全部正确
    const allCorrect =
      correctPoints.every((p) => p) && correctAnswerTiebreaker.every((t) => t) && correctWins.every((w) => w)

    if (allCorrect && gameStatus !== "won") {
      setGameStatus("won")

      // 更新统计数据（只在第一次获胜时更新）
      if (!hasSubmittedStats) {
        fetch("/api/tiansai/stats", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ won: true }),
        })
        setHasSubmittedStats(true)
      }

      toast({
        title: "恭喜你赢了!",
        description: "你成功解开了今日填赛挑战！",
      })
    }

    // 保存游戏状态
    if (challenge) {
      saveTiansaiGameState({
        date: challenge.date,
        results,
        gameStatus,
        hasSubmittedStats,
      })
    }
  }, [results, challenge, gameStatus, toast, hasSubmittedStats])

  // 处理单元格点击
  const handleCellClick = (row: number, col: number) => {
    if (gameStatus === "won" || row === col || results[row][col].isFixed) return

    const newResults = [...results]

    // 循环切换：0.5 -> 1 -> 0 -> 0.5
    let newValue = 0.5
    if (results[row][col].value === 0.5) newValue = 1
    else if (results[row][col].value === 1) newValue = 0
    else if (results[row][col].value === 0) newValue = 0.5

    // 更新当前单元格
    newResults[row][col] = { ...newResults[row][col], value: newValue }

    // 更新对应的单元格（对称位置）
    const oppositeValue = newValue === 1 ? 0 : newValue === 0 ? 1 : 0.5
    newResults[col][row] = { ...newResults[col][row], value: oppositeValue }

    setResults(newResults)
  }

  // 重置游戏
  const resetGame = () => {
    if (!challenge) return

    // 初始化结果矩阵，默认所有比赛为平局(0.5)
    const initialResults: ResultMatrix = Array(6)
      .fill(0)
      .map(() =>
        Array(6)
          .fill(0)
          .map(() => ({ value: 0.5, isFixed: false })),
      )

    // 设置对角线为不可编辑（自己对自己）
    for (let i = 0; i < 6; i++) {
      initialResults[i][i] = { value: 0, isFixed: true }
    }

    setResults(initialResults)
    setGameStatus("playing")

    toast({
      title: "游戏已重置",
      description: "所有比赛结果已重置为平局",
    })
  }

  // 获取单元格样式
  const getCellStyle = (row: number, col: number) => {
    if (row === col) return "bg-gray-200 cursor-not-allowed"

    if (results[row][col].isFixed) return "bg-gray-100 cursor-not-allowed"

    return "cursor-pointer hover:bg-gray-100"
  }

  // 获取单元格显示值
  const getCellDisplay = (value: number) => {
    if (value === 1) return "1"
    if (value === 0.5) return "½"
    if (value === 0) return "0"
    return ""
  }

  // 获取统计列样式
  const getStatStyle = (isCorrect: boolean) => {
    return isCorrect ? "text-green-600 font-bold" : "text-red-600 font-bold"
  }

  if (!challenge || results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px]">
        <p className="text-lg mb-4">加载今日挑战中...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <TiansaiStats />

      <Card className="w-full">
        <CardContent className="p-2 sm:p-4">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-xs sm:text-sm">
              <thead>
                <tr>
                  <th className="border p-1 sm:p-2 bg-gray-50">棋手</th>
                  {challenge.players.map((player, i) => (
                    <th key={i} className="border p-1 sm:p-2 bg-gray-50">
                      {player.name}
                    </th>
                  ))}
                  <th className="border p-1 sm:p-2 bg-gray-50">积分</th>
                  <th className="border p-1 sm:p-2 bg-gray-50">小分</th>
                  <th className="border p-1 sm:p-2 bg-gray-50">答案小分</th>
                  <th className="border p-1 sm:p-2 bg-gray-50">胜局</th>
                </tr>
              </thead>
              <tbody>
                {challenge.players.map((player, row) => (
                  <tr key={row}>
                    <th className="border p-1 sm:p-2 bg-gray-50">{player.name}</th>
                    {results[row].map((result, col) => (
                      <td
                        key={col}
                        className={`border p-1 sm:p-2 text-center ${getCellStyle(row, col)}`}
                        onClick={() => handleCellClick(row, col)}
                      >
                        {getCellDisplay(result.value)}
                      </td>
                    ))}
                    <td className={`border p-1 sm:p-2 text-center ${getStatStyle(correctStats.points[row])}`}>
                      {calculatedStats.points[row]} / {player.points}
                    </td>
                    <td className={`border p-1 sm:p-2 text-center ${getStatStyle(correctStats.tiebreaker[row])}`}>
                      {calculatedStats.tiebreaker[row]} / {player.tiebreaker}
                    </td>
                    <td className={`border p-1 sm:p-2 text-center ${getStatStyle(correctStats.answerTiebreaker[row])}`}>
                      {calculatedStats.answerTiebreaker[row]} / {player.tiebreaker}
                    </td>
                    <td className={`border p-1 sm:p-2 text-center ${getStatStyle(correctStats.wins[row])}`}>
                      {calculatedStats.wins[row]} / {player.wins}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <Button onClick={resetGame} variant="outline" size="sm" className="text-xs sm:text-sm">
          重置游戏
        </Button>
        {gameStatus === "won" && (
          <Button variant="default" size="sm" className="text-xs sm:text-sm">
            恭喜你赢了！
          </Button>
        )}
      </div>
    </div>
  )
}

