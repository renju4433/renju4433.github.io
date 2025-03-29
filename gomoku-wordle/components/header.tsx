"use client"

import { useState } from "react"
import Link from "next/link"
import { Calendar, HelpCircle, Settings, Home } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import HowToPlay from "./how-to-play"
import Stats from "./stats"

export default function Header() {
  const [showHelp, setShowHelp] = useState(false)
  const [showStats, setShowStats] = useState(false)

  return (
    <header className="w-full flex items-center justify-between py-4 border-b mb-6">
      <h1 className="text-2xl font-bold">五子棋手猜猜乐</h1>
      <div className="flex gap-2">
        <Link href="/" passHref>
          <Button variant="ghost" size="icon">
            <Home className="h-5 w-5" />
          </Button>
        </Link>
        <Button variant="ghost" size="icon" onClick={() => setShowStats(true)}>
          <Calendar className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setShowHelp(true)}>
          <HelpCircle className="h-5 w-5" />
        </Button>
        {/* 管理员按钮，只有知道路径的人才能访问 */}
        <Link href="/admin" passHref>
          <Button variant="ghost" size="icon">
            <Settings className="h-5 w-5" />
          </Button>
        </Link>
      </div>

      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>游戏规则</DialogTitle>
          </DialogHeader>
          <HowToPlay inDialog />
        </DialogContent>
      </Dialog>

      <Dialog open={showStats} onOpenChange={setShowStats}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>统计数据</DialogTitle>
          </DialogHeader>
          <Stats inDialog />
        </DialogContent>
      </Dialog>
    </header>
  )
}

