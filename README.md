# Arena Snake AI · PWA

GitHub Pages 目标地址：

https://lichaosai.github.io/arena-snake/

## 本地测试

进入项目目录：

```bash
python3 -m http.server 8080
```

电脑浏览器打开：

http://localhost:8080

注意：不要直接双击 `index.html` 测试 Service Worker；PWA 缓存需要 HTTP/HTTPS 环境。

## 上传到 GitHub

新建公开仓库：

`arena-snake`

然后在本目录执行：

```bash
git init
git add .
git commit -m "Initial Arena Snake PWA"
git branch -M main
git remote add origin https://github.com/lichaosai/arena-snake.git
git push -u origin main
```

如果仓库已经存在并且已经初始化过 Git，则只需要 add / commit / push。

## 开启 GitHub Pages

GitHub 仓库：

Settings → Pages

Build and deployment：

- Source: Deploy from a branch
- Branch: main
- Folder: / (root)

保存后等待 GitHub 发布。

项目站点的默认地址会是：

https://lichaosai.github.io/arena-snake/

## iPhone

使用 Safari 打开上面的 GitHub Pages 地址。

然后：

分享 → 添加到主屏幕 → 开启“作为网页 App 打开” → 添加

建议横屏运行。

## 当前玩法

- 1 名玩家 + Milo / Nova / Byte 3 条 AI
- 多种能量点，价值为 1 / 2 / 3
- AI 自动寻食、避障和有限抢路线
- 撞墙死亡
- 撞其他蛇身体死亡
- 蛇头对撞双方死亡
- 自己的身体不会致死
- AI 死亡后身体变成能量点并随后复活
- 本地 `localStorage` 保存历史最长长度
- 手机滑动控制；电脑方向键 / WASD 控制
- P / Space 暂停，R 重开
