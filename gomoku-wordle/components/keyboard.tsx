"use client"

import { Button } from "@/components/ui/button"
import { SkipBackIcon as Backspace } from "lucide-react"

const KEYS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "BACKSPACE"],
]

type KeyboardProps = {
  onKeyPress: (key: string) => void
  usedKeys: Record<string, "correct" | "present" | "absent">
}

export default function Keyboard({ onKeyPress, usedKeys }: KeyboardProps) {
  const getKeyClass = (key: string) => {
    if (key === "ENTER" || key === "BACKSPACE") return ""

    switch (usedKeys[key]) {
      case "correct":
        return "bg-green-500 text-white hover:bg-green-600"
      case "present":
        return "bg-yellow-500 text-white hover:bg-yellow-600"
      case "absent":
        return "bg-gray-500 text-white hover:bg-gray-600"
      default:
        return "bg-gray-200 hover:bg-gray-300"
    }
  }

  return (
    <div className="w-full max-w-md">
      {KEYS.map((row, rowIndex) => (
        <div key={rowIndex} className="flex justify-center gap-1 my-1">
          {row.map((key) => (
            <Button
              key={key}
              onClick={() => onKeyPress(key)}
              className={`${getKeyClass(key)} ${
                key === "ENTER" ? "px-2 text-xs" : key === "BACKSPACE" ? "px-2" : "w-8 h-10 p-0 sm:w-10"
              }`}
              variant="outline"
            >
              {key === "BACKSPACE" ? <Backspace className="h-4 w-4" /> : key}
            </Button>
          ))}
        </div>
      ))}
    </div>
  )
}

