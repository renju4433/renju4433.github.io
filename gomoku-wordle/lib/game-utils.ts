import { pinyin } from "pinyin-pro"

// 获取今日的答案
export async function getDailyAnswer(): Promise<string> {
  try {
    const response = await fetch("/api/admin/answer")
    if (!response.ok) {
      console.error("获取答案失败: 服务器错误")
      return ""
    }
    const data = await response.json()
    return data.answer || ""
  } catch (error) {
    console.error("获取答案失败:", error)
    return ""
  }
}

// 获取汉字的完整拼音（带声调）
export async function getFullPinyin(char: string): Promise<string> {
  try {
    return pinyin(char, { toneType: "symbol", type: "array" })[0] || ""
  } catch (error) {
    console.error("获取拼音失败:", error)
    return ""
  }
}

// 获取汉字的拼音（不带声调）
export async function getPinyin(char: string): Promise<string> {
  try {
    return pinyin(char, { toneType: "none", type: "array" })[0] || ""
  } catch (error) {
    console.error("获取拼音失败:", error)
    return ""
  }
}

// 获取汉字拼音的首字母
export async function getPinyinInitial(char: string): Promise<string> {
  try {
    const py = pinyin(char, { toneType: "none", type: "array" })[0] || ""
    return py.charAt(0)
  } catch (error) {
    console.error("获取拼音首字母失败:", error)
    return ""
  }
}

// 保存游戏状态到本地存储
export function saveGameState(state: any) {
  if (typeof window !== "undefined") {
    localStorage.setItem("gomokuWordleState", JSON.stringify(state))
  }
}

// 从本地存储加载游戏状态
export function loadGameState() {
  if (typeof window !== "undefined") {
    const state = localStorage.getItem("gomokuWordleState")
    return state ? JSON.parse(state) : null
  }
  return null
}

