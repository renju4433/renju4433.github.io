"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import Stats from "@/components/stats"
import { Home } from "lucide-react"

export default function AdminPage() {
  const [player1, setPlayer1] = useState("")
  const [player2, setPlayer2] = useState("")
  const [password, setPassword] = useState("")
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [currentAnswer, setCurrentAnswer] = useState("")
  const { toast } = useToast()
  const router = useRouter()

  useEffect(() => {
    // 检查是否已经认证
    const auth = localStorage.getItem("admin_auth")
    if (auth === "true") {
      setIsAuthenticated(true)
      fetchCurrentAnswer()
    }
  }, [])

  const fetchCurrentAnswer = async () => {
    try {
      const response = await fetch("/api/admin/answer")
      if (response.ok) {
        const data = await response.json()
        setCurrentAnswer(data.answer || "未设置")
      }
    } catch (error) {
      console.error("获取当前答案失败:", error)
    }
  }

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    // 简单的密码验证，实际应用中应该使用更安全的方式
    if (password === "admin123") {
      // 这只是示例密码，实际使用时应更改
      setIsAuthenticated(true)
      localStorage.setItem("admin_auth", "true")
      fetchCurrentAnswer()
      toast({
        title: "登录成功",
        description: "欢迎回来，管理员！",
      })
    } else {
      toast({
        title: "登录失败",
        description: "密码不正确",
        variant: "destructive",
      })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // 验证输入
    if (!player1 || !player2) {
      toast({
        title: "输入错误",
        description: "请输入两个棋手名字",
        variant: "destructive",
      })
      return
    }

    if (player1.length !== 3 || player2.length !== 3) {
      toast({
        title: "输入错误",
        description: "每个棋手名字必须是3个字符",
        variant: "destructive",
      })
      return
    }

    try {
      const response = await fetch("/api/admin/answer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ player1, player2 }),
      })

      if (response.ok) {
        toast({
          title: "设置成功",
          description: `今日答案已设置为: ${player1}${player2}`,
        })
        setCurrentAnswer(player1 + player2)
        setPlayer1("")
        setPlayer2("")
      } else {
        toast({
          title: "设置失败",
          description: "服务器错误，请稍后再试",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("设置答案失败:", error)
      toast({
        title: "设置失败",
        description: "网络错误，请稍后再试",
        variant: "destructive",
      })
    }
  }

  const handleLogout = () => {
    setIsAuthenticated(false)
    localStorage.removeItem("admin_auth")
    router.push("/")
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>管理员登录</CardTitle>
            <CardDescription>请输入管理员密码</CardDescription>
          </CardHeader>
          <form onSubmit={handleLogin}>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">密码</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Link href="/" passHref>
                <Button variant="outline">
                  <Home className="h-4 w-4 mr-2" />
                  返回主页
                </Button>
              </Link>
              <Button type="submit">登录</Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">五子棋手猜猜乐 - 管理面板</h1>
        <div className="flex gap-2">
          <Link href="/" passHref>
            <Button variant="outline" size="sm">
              <Home className="h-4 w-4 mr-2" />
              返回主页
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            退出
          </Button>
        </div>
      </div>

      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>设置今日答案</CardTitle>
          <CardDescription>
            当前答案: <span className="font-bold">{currentAnswer}</span>
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="player1">棋手1 (三字名)</Label>
                <Input
                  id="player1"
                  value={player1}
                  onChange={(e) => setPlayer1(e.target.value)}
                  maxLength={3}
                  placeholder="例如：王小明"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="player2">棋手2 (三字名)</Label>
                <Input
                  id="player2"
                  value={player2}
                  onChange={(e) => setPlayer2(e.target.value)}
                  maxLength={3}
                  placeholder="例如：李大壮"
                />
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full">
              设置答案
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card className="w-full max-w-md mx-auto mt-6">
        <CardHeader>
          <CardTitle>统计数据</CardTitle>
        </CardHeader>
        <CardContent>
          <Stats inDialog={true} />
        </CardContent>
        <CardFooter>
          <Link href="/wordle" passHref className="w-full">
            <Button variant="outline" className="w-full">
              返回游戏
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}

