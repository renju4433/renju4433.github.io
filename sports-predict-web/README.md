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

## 部署到 GitCode Pages

1. 在 GitCode 新建仓库，把本目录推上去；
2. 仓库设置 → Pages，选择分支 `main` / 根目录 `/`；
3. 访问生成的 Pages 地址即可。
