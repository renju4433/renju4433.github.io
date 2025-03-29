"use client"

import { useEffect, useState } from "react"

type StatsProps = {
  inDialog?: boolean
}

type StatsData = {
  totalPlayers: number
  correctGuesses: number
  guessDistribution: number[]
}

export default function Stats({ inDialog = false }: StatsProps) {
  const [stats, setStats] = useState<StatsData>({
    totalPlayers: 0,
    correctGuesses: 0,
    guessDistribution: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // 10次猜测
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch("/api/stats")
        const data = await response.json()
        // 确保guessDistribution始终是一个数组
        setStats({
          totalPlayers: data.totalPlayers || 0,
          correctGuesses: data.correctGuesses || 0,
          guessDistribution: Array.isArray(data.guessDistribution)
            ? data.guessDistribution
            : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        })
      } catch (error) {
        console.error("Failed to fetch stats:", error)
        // 设置默认值
        setStats({
          totalPlayers: 0,
          correctGuesses: 0,
          guessDistribution: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        })
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [])

  if (loading) {
    return <div className="text-center py-4">加载统计数据中...</div>
  }

  // 确保guessDistribution存在
  const guessDistribution = Array.isArray(stats.guessDistribution)
    ? stats.guessDistribution
    : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

  const maxGuesses = Math.max(...guessDistribution, 1)

  return (
    <div className={`w-full ${!inDialog && "mt-8 border-t pt-4"}`}>
      <div className="text-center mb-4">
        <p className="text-lg font-bold">今日已有 {stats.correctGuesses} 人猜对</p>
        <p className="text-sm text-gray-500">总参与人数: {stats.totalPlayers}</p>
      </div>

      <div className="space-y-2">
        <h3 className="font-medium">猜测分布</h3>
        {guessDistribution.map((count, index) => (
          <div key={index} className="flex items-center gap-2">
            <div className="w-4">{index + 1}</div>
            <div className="flex-1 h-5 bg-gray-100 rounded-sm overflow-hidden">
              <div
                className="h-full bg-green-500 text-xs text-white flex items-center justify-end px-1"
                style={{ width: `${(count / maxGuesses) * 100}%` }}
              >
                {count > 0 && count}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

