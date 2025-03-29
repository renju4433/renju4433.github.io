"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type TiansaiHowToPlayProps = {
  inDialog?: boolean
}

export default function TiansaiHowToPlay({ inDialog = false }: TiansaiHowToPlayProps) {
  const [open, setOpen] = useState(false)

  const content = (
    <div className="space-y-4">
      <p>填赛是一个棋类单循环赛结果填写游戏。每天系统会随机生成一个6人单循环赛的比赛结果。</p>

      <p>游戏规则：</p>
      <ul className="list-disc pl-5 space-y-2">
        <li>表格中显示了6名棋手的积分、小分、答案小分和胜局数</li>
        <li>你需要填写每场比赛的胜负平结果（胜=1，平=0.5，负=0）</li>
        <li>当你填写一个结果时，对应的对手结果会自动更新（如A对B是1，B对A就是0）</li>
        <li>表格最后四列会显示每个人的积分、小分、答案小分、胜局数是否正确</li>
        <li>如果全部正确，你就赢了！</li>
      </ul>

      <p>计分规则：</p>
      <ul className="list-disc pl-5 space-y-2">
        <li>积分：胜=1分，平=0.5分，负=0分</li>
        <li>小分：所胜对手积分之和 + 所平对手积分之和*0.5（使用当前填写的积分）</li>
        <li>答案小分：所胜对手积分之和 + 所平对手积分之和*0.5（使用答案中的积分）</li>
        <li>胜局数：获胜的比赛数量</li>
      </ul>

      <p>提示：</p>
      <ul className="list-disc pl-5 space-y-2">
        <li>一开始所有比赛结果默认为0.5（平局）</li>
        <li>绿色表示该项数据正确，红色表示错误</li>
        <li>尝试通过逻辑推理找出正确的比赛结果！</li>
      </ul>
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

