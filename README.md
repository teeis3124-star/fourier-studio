# Fourier Studio

<p align="center">
  <img src="docs/demo.svg" alt="Fourier Studio demo" width="900" />
</p>

一个纯浏览器运行的交互式傅里叶可视化与信号分析工具：一维傅里叶级数、真实采样波形 FFT、二维复傅里叶、文字/图片轮廓、旋转相量和结果导出。

**Live Demo:** https://teeis3124-star.github.io/fourier-studio/

## v0.7

v0.7 新增完整的 **FFT 波形分析工作台**，让 Fourier Studio 不再只处理手绘周期函数，也可以分析真实实验数据、传感器波形、示波器导出数据与 WAV 音频。

### 模式
- **总览**
- **一维傅里叶**
- **FFT 波形分析**
- **二维复傅里叶**

浏览器会记住上一次选择的模式。

## FFT 波形分析

### 数据输入
支持：
- CSV
- TXT
- WAV
- 直接粘贴数值数据

CSV / TXT 可以是两列：

```text
time,amplitude
0.000,0.12
0.001,0.48
0.002,0.91
```

程序会从时间列估算：

`fs = 1 / median(Δt)`

如果时间步存在明显抖动，会先按中位 `Δt` 进行线性等间隔重采样，再进入 FFT。

也支持只有一列幅值：

```text
0.12
0.48
0.91
...
```

此时使用界面中手动输入的采样率。

WAV 文件通过浏览器 Web Audio 在本地解码；多声道会平均成单通道。分析数据不会上传服务器。

### 预处理
支持：
- 去除直流分量
- Rectangular 窗
- Hann 窗
- Hamming 窗
- Blackman 窗
- 手动设置频谱显示上限

### FFT
使用浏览器内置实现的 radix-2 FFT：

`X_k = Σ x_n exp(-i 2πkn/N)`

非 2 的整数次幂长度会零填充到下一个 2 的整数次幂。

当前浏览器分析上限为前 **65536 个采样点**，用于控制交互式页面的计算与绘图开销。

### 输出
FFT 工作台同时显示：
- 时域波形
- 单边幅频谱
- 相位谱
- 功率谱密度 PSD（dB/Hz）
- Top 10 主要频率
- 主要频率重建
- 重建 RMS 误差

统计信息包括：
- 采样点数
- 采样率
- 信号时长
- FFT bin spacing
- Nyquist 频率
- 重建 RMS

### 主频识别
程序先寻找幅频谱局部峰值，并使用相邻三个 FFT bin 做抛物线插值，以获得比直接读取单个 bin 更细的频率估计。

例如内置示例：

`x(t)=2sin(2π·50t)+0.8sin(2π·120t+0.45)+0.3sin(2π·250t-0.8)+0.25`

应在频谱中识别约：
- 50 Hz
- 120 Hz
- 250 Hz

### 频率成分重建
可以选择使用前 1–20 个主要频率分量进行重建，并与预处理后的原始信号叠加比较。

### 导出
支持：
- 时域 PNG
- 幅频谱 PNG
- 重建波形 PNG
- 完整频谱 CSV

频谱 CSV 字段：

```text
frequency_hz,amplitude,phase_rad,psd
```

## 一维 Fourier Studio
- 512 点周期采样
- 最高 64 阶傅里叶重建
- 手绘周期函数
- 正弦、方波、锯齿、三角、脉冲预设
- 实时具体傅里叶级数
- LaTeX 导出
- 幅度谱 / 相位谱
- RMS(N) 误差曲线
- 主要谐波排行榜
- Fourier Epicycle 动画
- PNG / GIF 相关导出

一维傅里叶级数：

`f_N(x)=a_0/2+Σ[a_n cos(nx)+b_n sin(nx)]`

## 二维 Complex Fourier
- 自由手绘路径
- 文字轮廓
- PNG / JPG / WebP 图片轮廓
- Marching Squares 边界提取
- 弧长均匀重采样
- 双边复傅里叶系数
- 旋转圆实时重建
- PNG / GIF 导出

二维路径写为：

`z_j=x_j+i y_j`

复傅里叶系数：

`c_k=(1/M)Σz_j exp(-i2πkj/M)`

重建：

`z_K(t)=Σc_k exp(ikt)`

## 运行

在线版：

https://teeis3124-star.github.io/fourier-studio/

本地开发：

```bash
npm install
npm test
```

`npm test` 会执行 TypeScript 检查和完整构建。

## 项目结构
- `index.html`：页面结构
- `style.css`：界面样式
- `src/main.ts`：一维 / 二维主逻辑
- `src/fft.ts`：FFT 波形分析模块
- `js/main.js`：浏览器主模块
- `js/fft.js`：浏览器 FFT 模块
- `scripts/build.mjs`：单文件构建
- `.github/workflows/ci.yml`：自动检查
- `.github/workflows/pages.yml`：GitHub Pages 自动部署

完整构建后还会生成：

`dist/Fourier-Studio.html`

作为单文件离线版本。
