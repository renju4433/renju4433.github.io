import { Suspense } from "react"
import TiansaiGame from "@/components/tiansai-game"
import Header from "@/components/tiansai-header"

export default function TiansaiPage() {
  return (
    <main className="flex min-h-screen flex-col items-center p-4 md:p-8">
      <div className="w-full max-w-4xl mx-auto">
        <Header />
        <Suspense fallback={<div className="h-[600px] flex items-center justify-center">加载中...</div>}>
          <TiansaiGame />
        </Suspense>
      </div>
    </main>
  )
}

