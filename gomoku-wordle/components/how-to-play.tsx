"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type HowToPlayProps = {
  inDialog?: boolean
}

export default function HowToPlay({ inDialog = false }: HowToPlayProps) {
  const [open, setOpen] = useState(false)

  const content = (
    <div className="space-y-4">
      <p>每天，系统会随机选择两位著名五子棋手的名字（每个名字3个字），并将它们拼接成一个6字符的字符串。</p>

      <p>你有10次机会猜出这个字符串。每次猜测后，方块的颜色和边框会变化，提示你的猜测有多接近。</p>

      <div className="space-y-2">
        <h3 className="font-medium mb-2">字符匹配：</h3>
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-green-500 flex items-center justify-center text-white font-bold">王</div>
          <p>绿色背景表示字符正确且位置正确</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-yellow-500 flex items-center justify-center text-white font-bold">小</div>
          <p>黄色背景表示字符正确但位置错误</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-gray-500 flex items-center justify-center text-white font-bold">明</div>
          <p>灰色背景表示字符不在答案中</p>
        </div>

        <h3 className="font-medium mt-4 mb-2">拼音匹配：</h3>
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 border-4 border-green-500 flex items-center justify-center font-bold">李</div>
          <p>绿色四面边框表示拼音（带声调）正确且位置正确</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-10 h-10 border-4 border-yellow-500 flex items-center justify-center font-bold">大</div>
          <p>黄色四面边框表示拼音（带声调）正确但位置错误</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-10 h-10 border-t-4 border-b-4 border-t-green-500 border-b-green-500 flex items-center justify-center font-bold">
            张
          </div>
          <p>绿色两面边框表示拼音（不带声调）正确且位置正确</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-10 h-10 border-t-4 border-b-4 border-t-yellow-500 border-b-yellow-500 flex items-center justify-center font-bold">
            三
          </div>
          <p>黄色两面边框表示拼音（不带声调）正确但位置错误</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-10 h-10 border-l-4 border-l-green-500 flex items-center justify-center font-bold">刘</div>
          <p>绿色左边框表示拼音首字母正确且位置正确</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-10 h-10 border-l-4 border-l-yellow-500 flex items-center justify-center font-bold">备</div>
          <p>黄色左边框表示拼音首字母正确但位置错误</p>
        </div>
      </div>

      <p>每天都有新的挑战！祝你好运！</p>
    </div>
  )

  if (inDialog) {
    return content
  }

  return (
    <>
      <div className="mt-8 border-t pt-4 text-center">
        <Button variant="outline" onClick={() => setOpen(true)}>
          如何游戏
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>游戏规则</DialogTitle>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    </>
  )
}

