import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8">每日棋类挑战游戏</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="w-full">
            <CardHeader>
              <CardTitle>五子棋手猜猜乐</CardTitle>
              <CardDescription>猜测两位棋手名字组合的Wordle游戏</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">
                每天猜两位五子棋手名字组合的Wordle游戏。游戏会检测字符匹配和拼音匹配情况，提供多种提示帮助你猜出正确答案。
              </p>
            </CardContent>
            <CardFooter>
              <Link href="/wordle" passHref className="w-full">
                <Button className="w-full">开始游戏</Button>
              </Link>
            </CardFooter>
          </Card>

          <Card className="w-full">
            <CardHeader>
              <CardTitle>填赛挑战</CardTitle>
              <CardDescription>填写棋类单循环赛结果的逻辑推理游戏</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">
                根据给定的积分、小分和胜局数，推断出6名棋手之间的比赛结果。通过逻辑推理找出唯一正确的比赛结果组合。
              </p>
            </CardContent>
            <CardFooter>
              <Link href="/tiansai" passHref className="w-full">
                <Button className="w-full">开始游戏</Button>
              </Link>
            </CardFooter>
          </Card>
        </div>
      </div>
    </main>
  )
}

