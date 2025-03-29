"use client"

import type React from "react"

import { useEffect, useState, useRef } from "react"
import { useToast } from "@/components/ui/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  getDailyAnswer,
  saveGameState,
  loadGameState,
  getFullPinyin,
  getPinyin,
  getPinyinInitial,
} from "@/lib/game-utils"

type GameStatus = "playing" | "won" | "lost"
type PinyinMatchType = "none" | "full" | "base" | "initial"
type PinyinMatchPosition = "correct" | "present" | "absent" | "empty"

type CellState = {
  char: string
  status: "correct" | "present" | "absent" | "empty"
  pinyinFullMatch: PinyinMatchPosition
  pinyinBaseMatch: PinyinMatchPosition
  pinyinInitialMatch: PinyinMatchPosition
}

export default function GameBoard() {
  const { toast } = useToast()
  const [answer, setAnswer] = useState("")
  const [answerFullPinyin, setAnswerFullPinyin] = useState<string[]>([])
  const [answerBasePinyin, setAnswerBasePinyin] = useState<string[]>([])
  const [answerPinyinInitials, setAnswerPinyinInitials] = useState<string[]>([])
  const [currentRow, setCurrentRow] = useState(0)
  const [currentGuess, setCurrentGuess] = useState("")
  const [gameStatus, setGameStatus] = useState<GameStatus>("playing")
  const [guesses, setGuesses] = useState<CellState[][]>(
    Array(10)
      .fill(0)
      .map(() =>
        Array(6)
          .fill(0)
          .map(() => ({
            char: "",
            status: "empty",
            pinyinFullMatch: "empty",
            pinyinBaseMatch: "empty",
            pinyinInitialMatch: "empty",
          })),
      ),
  )
  const inputRef = useRef<HTMLInputElement>(null)

  // 初始化游戏
  useEffect(() => {
    const initGame = async () => {
      try {
        const dailyAnswer = await getDailyAnswer()
        if (dailyAnswer) {
          setAnswer(dailyAnswer)

          // 获取答案的各种拼音形式
          const fullPinyinArray = await Promise.all(dailyAnswer.split("").map((char) => getFullPinyin(char)))
          const basePinyinArray = await Promise.all(dailyAnswer.split("").map((char) => getPinyin(char)))
          const initialArray = await Promise.all(dailyAnswer.split("").map((char) => getPinyinInitial(char)))

          setAnswerFullPinyin(fullPinyinArray)
          setAnswerBasePinyin(basePinyinArray)
          setAnswerPinyinInitials(initialArray)

          // 尝试加载保存的游戏状态
          const savedState = loadGameState()
          if (savedState && savedState.date === new Date().toDateString() && savedState.answer === dailyAnswer) {
            setGuesses(savedState.guesses)
            setCurrentRow(savedState.currentRow)
            setGameStatus(savedState.gameStatus)
          }
        } else {
          toast({
            title: "游戏未准备好",
            description: "管理员尚未设置今日答案",
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

  // 保存游戏状态
  useEffect(() => {
    if (answer) {
      saveGameState({
        date: new Date().toDateString(),
        answer,
        guesses,
        currentRow,
        gameStatus,
      })
    }
  }, [guesses, currentRow, gameStatus, answer])

  // 自动聚焦输入框
  useEffect(() => {
    if (gameStatus === "playing" && inputRef.current) {
      inputRef.current.focus()
    }
  }, [gameStatus])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // 允许输入任意长度的字符，提交时再检查
    const value = e.target.value
    setCurrentGuess(value)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (gameStatus !== "playing") return

    if (currentGuess.length !== 6) {
      toast({
        title: "输入不完整",
        description: "请输入6个字符",
        variant: "destructive",
      })
      return
    }

    await checkGuess(currentGuess)
    setCurrentGuess("")
  }

  const checkGuess = async (guess: string) => {
    // 获取猜测的各种拼音形式
    const guessFullPinyin = await Promise.all(guess.split("").map((char) => getFullPinyin(char)))
    const guessBasePinyin = await Promise.all(guess.split("").map((char) => getPinyin(char)))
    const guessInitials = await Promise.all(guess.split("").map((char) => getPinyinInitial(char)))

    // 检查每个字符
    const newGuesses = [...guesses]

    // 计数器对象，用于跟踪各种匹配
    const charCount: Record<string, number> = {}
    const fullPinyinCount: Record<string, number> = {}
    const basePinyinCount: Record<string, number> = {}
    const initialCount: Record<string, number> = {}

    // 初始化计数器
    for (let i = 0; i < 6; i++) {
      charCount[answer[i]] = (charCount[answer[i]] || 0) + 1
      fullPinyinCount[answerFullPinyin[i]] = (fullPinyinCount[answerFullPinyin[i]] || 0) + 1
      basePinyinCount[answerBasePinyin[i]] = (basePinyinCount[answerBasePinyin[i]] || 0) + 1
      initialCount[answerPinyinInitials[i]] = (initialCount[answerPinyinInitials[i]] || 0) + 1
    }

    // 1. 首先标记所有正确位置的字符
    for (let i = 0; i < 6; i++) {
      newGuesses[currentRow][i].char = guess[i]

      if (guess[i] === answer[i]) {
        newGuesses[currentRow][i].status = "correct"
        charCount[guess[i]]--
      }
    }

    // 2. 然后标记存在但位置不正确的字符
    for (let i = 0; i < 6; i++) {
      if (guess[i] !== answer[i]) {
        if (charCount[guess[i]] > 0) {
          newGuesses[currentRow][i].status = "present"
          charCount[guess[i]]--
        } else {
          newGuesses[currentRow][i].status = "absent"
        }
      }
    }

    // 3. 标记完整拼音匹配（带声调）
    for (let i = 0; i < 6; i++) {
      if (guessFullPinyin[i] === answerFullPinyin[i]) {
        newGuesses[currentRow][i].pinyinFullMatch = "correct"
        fullPinyinCount[guessFullPinyin[i]]--
      }
    }

    for (let i = 0; i < 6; i++) {
      if (guessFullPinyin[i] !== answerFullPinyin[i]) {
        if (fullPinyinCount[guessFullPinyin[i]] > 0) {
          newGuesses[currentRow][i].pinyinFullMatch = "present"
          fullPinyinCount[guessFullPinyin[i]]--
        } else {
          newGuesses[currentRow][i].pinyinFullMatch = "absent"
        }
      }
    }

    // 4. 标记基本拼音匹配（不带声调）
    for (let i = 0; i < 6; i++) {
      if (guessBasePinyin[i] === answerBasePinyin[i]) {
        newGuesses[currentRow][i].pinyinBaseMatch = "correct"
        basePinyinCount[guessBasePinyin[i]]--
      }
    }

    for (let i = 0; i < 6; i++) {
      if (guessBasePinyin[i] !== answerBasePinyin[i]) {
        if (basePinyinCount[guessBasePinyin[i]] > 0) {
          newGuesses[currentRow][i].pinyinBaseMatch = "present"
          basePinyinCount[guessBasePinyin[i]]--
        } else {
          newGuesses[currentRow][i].pinyinBaseMatch = "absent"
        }
      }
    }

    // 5. 标记拼音首字母匹配
    for (let i = 0; i < 6; i++) {
      if (guessInitials[i] === answerPinyinInitials[i]) {
        newGuesses[currentRow][i].pinyinInitialMatch = "correct"
        initialCount[guessInitials[i]]--
      }
    }

    for (let i = 0; i < 6; i++) {
      if (guessInitials[i] !== answerPinyinInitials[i]) {
        if (initialCount[guessInitials[i]] > 0) {
          newGuesses[currentRow][i].pinyinInitialMatch = "present"
          initialCount[guessInitials[i]]--
        } else {
          newGuesses[currentRow][i].pinyinInitialMatch = "absent"
        }
      }
    }

    setGuesses(newGuesses)

    // 检查是否获胜
    if (guess === answer) {
      setGameStatus("won")
      toast({
        title: "恭喜你猜对了!",
        description: `正确答案是: ${answer}`,
      })

      // 更新统计数据
      fetch("/api/stats", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ won: true, attempts: currentRow + 1 }),
      })
    } else if (currentRow === 9) {
      // 10次猜测机会 (0-9)
      setGameStatus("lost")
      toast({
        title: "游戏结束",
        description: `正确答案是: ${answer}`,
        variant: "destructive",
      })

      // 更新统计数据
      fetch("/api/stats", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ won: false }),
      })
    } else {
      setCurrentRow(currentRow + 1)
    }
  }

  const shareResult = () => {
    let result = `五子棋手猜猜乐 ${new Date().toLocaleDateString()}\n`

    for (let i = 0; i <= currentRow; i++) {
      for (let j = 0; j < 6; j++) {
        if (guesses[i][j].status === "correct") {
          result += "🟩"
        } else if (guesses[i][j].status === "present") {
          result += "🟨"
        } else {
          result += "⬛"
        }
      }
      result += "\n"
    }

    navigator.clipboard.writeText(result)
    toast({
      title: "已复制到剪贴板",
      description: "你可以分享你的结果了!",
    })
  }

  if (!answer) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px]">
        <p className="text-lg mb-4">今日游戏尚未准备好</p>
        <p className="text-sm text-gray-500">请等待管理员设置今日答案</p>
      </div>
    )
  }

  // 根据不同的匹配类型生成边框样式
  const getBorderStyle = (cell: CellState) => {
    // 四面边框：完整拼音匹配
    if (cell.pinyinFullMatch === "correct") {
      return "border-green-500 border-4"
    } else if (cell.pinyinFullMatch === "present") {
      return "border-yellow-500 border-4"
    }

    // 两面边框：基本拼音匹配（不带声调）
    else if (cell.pinyinBaseMatch === "correct") {
      return "border-t-4 border-b-4 border-t-green-500 border-b-green-500"
    } else if (cell.pinyinBaseMatch === "present") {
      return "border-t-4 border-b-4 border-t-yellow-500 border-b-yellow-500"
    }

    // 一面边框：拼音首字母匹配
    else if (cell.pinyinInitialMatch === "correct") {
      return "border-l-4 border-l-green-500"
    } else if (cell.pinyinInitialMatch === "present") {
      return "border-l-4 border-l-yellow-500"
    }

    return ""
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="grid grid-rows-10 gap-1">
        {guesses.map((row, rowIndex) => (
          <div key={rowIndex} className="grid grid-cols-6 gap-1">
            {row.map((cell, colIndex) => (
              <div
                key={colIndex}
                className={`w-12 h-12 flex items-center justify-center text-xl font-bold border-2 
                  ${
                    cell.status === "empty"
                      ? "border-gray-300"
                      : cell.status === "correct"
                        ? "bg-green-500 text-white"
                        : cell.status === "present"
                          ? "bg-yellow-500 text-white"
                          : "bg-gray-500 text-white"
                  }
                  ${getBorderStyle(cell)}`}
              >
                {cell.char}
              </div>
            ))}
          </div>
        ))}
      </div>

      {gameStatus === "playing" ? (
        <form onSubmit={handleSubmit} className="w-full max-w-md flex gap-2">
          <Input
            ref={inputRef}
            type="text"
            value={currentGuess}
            onChange={handleInputChange}
            placeholder="输入6个字符"
            className="text-center"
            autoComplete="off"
          />
          <Button type="submit">提交</Button>
        </form>
      ) : (
        <Button onClick={shareResult} className="mt-4">
          分享结果
        </Button>
      )}
    </div>
  )
}

