"use client"

import { useEffect, useState } from "react"

type TiansaiStatsProps = {
  inDialog?: boolean
}

export default function TiansaiStats({ inDialog = false }: TiansaiStatsProps) {
  const [stats, setStats] = useState({
    totalPlayers: 0,
    correctGuesses: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch("/api/tiansai/stats")
        if (response.ok) {
          const data = await response.json()
          setStats({
            totalPlayers: data.totalPlayers || 0,
            correctGuesses: data.correctGuesses || 0,
          })
        }
      } catch (error) {
        console.error("获取统计数据失败:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [])

  if (loading) {
    return <div className="text-center py-2">加载统计数据中...</div>
  }

  return (
    <div className={`w-full ${!inDialog && "mt-4 pt-4"}`}>
      <div className="text-center">
        <p className="text-lg font-bold">今日已有 {stats.correctGuesses} 人答对</p>
        <p className="text-sm text-gray-500">总参与人数: {stats.totalPlayers}</p>
      </div>
    </div>
  )
}

