// 获取今日填赛挑战
export async function getDailyTiansaiChallenge() {
  try {
    const response = await fetch("/api/tiansai/challenge")
    if (!response.ok) {
      console.error("获取填赛挑战失败: 服务器错误")
      return null
    }
    const data = await response.json()
    return data
  } catch (error) {
    console.error("获取填赛挑战失败:", error)
    return null
  }
}

// 保存填赛游戏状态到本地存储
export function saveTiansaiGameState(state: any) {
  if (typeof window !== "undefined") {
    localStorage.setItem("tiansaiGameState", JSON.stringify(state))
  }
}

// 从本地存储加载填赛游戏状态
export function loadTiansaiGameState() {
  if (typeof window !== "undefined") {
    const state = localStorage.getItem("tiansaiGameState")
    return state ? JSON.parse(state) : null
  }
  return null
}

