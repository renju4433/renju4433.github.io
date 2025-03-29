"use client"

import { useState } from "react"
import Link from "next/link"
import { HelpCircle, Home } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import TiansaiHowToPlay from "./tiansai-how-to-play"

export default function Header() {
  const [showHelp, setShowHelp] = useState(false)

  return (
    <header className="w-full flex items-center justify-between py-4 border-b mb-6">
      <h1 className="text-2xl font-bold">填赛挑战</h1>
      <div className="flex gap-2">
        <Link href="/" passHref>
          <Button variant="ghost" size="icon">
            <Home className="h-5 w-5" />
          </Button>
        </Link>
        <Button variant="ghost" size="icon" onClick={() => setShowHelp(true)}>
          <HelpCircle className="h-5 w-5" />
        </Button>
      </div>

      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>游戏规则</DialogTitle>
          </DialogHeader>
          <TiansaiHowToPlay inDialog />
        </DialogContent>
      </Dialog>
    </header>
  )
}

