# sports-predict-web

国内赛事预测 API 的前端，纯静态单文件，无构建步骤。

- `index.html` —— 全部内容（HTML + CSS + JS 内联）
- 数据来自 https://sports-predict-api.app.workbuddy.host

## 两个页签

| 页签 | 展示 | 数据来源 |
| --- | --- | --- |
| 100m | 名次榜：夺冠 / 前三 / 期望名次，点开看名次分布与预测成绩 | `POST /api/v1/predict/field` |
| 乒乓球 | 赛程逐场：时间 + 对阵双方 + 各自胜率，点开看双方等级分 / 近五场 / 交手 | 同上，取 `matches` 字段 |

## 本地预览

```bash
python -m http.server 8080
# 打开 http://127.0.0.1:8080/
```

可用 query 覆盖接口地址（便于对接本地后端）：

```
http://127.0.0.1:8080/?api=http://127.0.0.1:8000&share=
```

## 在线地址

**https://renju4433.github.io/sports-predict-web/**

托管在 GitHub Pages（仓库 `renju4433/renju4433.github.io` 的子目录 `sports-predict-web/`），推送即自动构建。

代码另有两份镜像：GitCode `m0_61071414/sports-predict-web`、Gitee `yaobf/sports-predict-web`。

> GitCode 与 Gitee 均无 Pages 可用：GitCode 未开放该功能，Gitee Pages 已于 2024 年 5 月下线。
