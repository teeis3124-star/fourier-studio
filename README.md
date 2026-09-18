# Fourier Studio

一个纯浏览器运行的交互式傅里叶级数可视化工具：手绘周期函数、实时傅里叶分解、频谱分析，以及旋转相量（Fourier Epicycles）动画。

## v0.3 功能
- 512 点周期采样，最高 64 阶傅里叶重建
- 鼠标 / 触控笔直接手绘目标周期函数
- 正弦波、方波、锯齿波、三角波、脉冲预设
- 实时显示具体傅里叶级数
- “精简零项 / 完整公式”切换
- 点击公式中的某一项，高亮对应橙黄色谐波
- 一键复制 LaTeX
- 幅度谱、相位谱与 RMS 重建误差
- 旋转相量 / Fourier Epicycle 动画
- 动画暂停、继续、从头播放和 0.25×–3× 速度调节
- 当前选中谐波在相量链中同步高亮
- GitHub Actions 自动执行 TypeScript 类型检查和构建

## 直接运行
用任意静态服务器打开仓库根目录的 `index.html`。

## 开发
```bash
npm install
npm test
```

`npm test` 会执行 TypeScript 类型检查与完整构建。

## 傅里叶级数
在区间 `[-π, π)` 上使用 512 个离散采样点近似：

`f_N(x) = a0/2 + Σ[a_n cos(nx) + b_n sin(nx)]`

其中：
- `a_n ≈ (2/M) Σ f(x_i) cos(n x_i)`
- `b_n ≈ (2/M) Σ f(x_i) sin(n x_i)`
- `M = 512`

橙黄色时域曲线表示当前选中的第 `n` 阶谐波：

`h_n(x) = a_n cos(nx) + b_n sin(nx)`

## 旋转相量的数学含义
对第 `n` 阶谐波定义：

`A_n = sqrt(a_n^2 + b_n^2)`

`φ_n = atan2(a_n, b_n)`

则：

`a_n cos(nt) + b_n sin(nt) = A_n sin(nt + φ_n)`

因此可以用一个半径为 `A_n`、角速度为 `nω`、初相位为 `φ_n` 的旋转向量表示这一阶谐波。

程序把这些向量首尾相接。链末端的纵坐标为：

`a0/2 + Σ A_n sin(nt + φ_n) = f_N(t)`

所以右侧由链末端扫出的波形，就是当前的 N 阶傅里叶重建。

## 构建输出
- TypeScript 源码：`src/main.ts`
- 浏览器版：`js/main.js`
- 完整构建后还会生成单文件离线版本：`dist/Fourier-Studio.html`
