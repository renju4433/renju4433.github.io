import { Suspense } from "react"
import GameBoard from "@/components/game-board"
import Header from "@/components/header"
import Stats from "@/components/stats"
import HowToPlay from "@/components/how-to-play"

export default function WordlePage() {
  return (
    <main className="flex min-h-screen flex-col items-center p-4 md:p-8">
      <div className="w-full max-w-md mx-auto">
        <Header />
        <Suspense fallback={<div className="h-[600px] flex items-center justify-center">加载中...</div>}>
          <GameBoard />
        </Suspense>
        <Stats />
        <HowToPlay />
      </div>
    </main>
  )
}

