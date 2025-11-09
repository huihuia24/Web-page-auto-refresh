// ==UserScript==
// @name         网页定时刷新
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  网页定时刷新工具
// @author       huihuia24
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @homepage     https://github.com/huihuia24
// @source       https://github.com/huihuia24/Web-page-auto-refresh
// @icon         https://pic.uzzf.com/up/2025-5/2025591617247637.png
// ==/UserScript==

(function() {
    'use strict';

    // 配置常量
    const DEFAULT_INTERVAL = 60; // 默认间隔（秒）
    const MIN_VALUES = { s: 5, m: 1, h: 1 }; // 各单位最小值
    const SITE_KEY = window.location.hostname;
    const POSITION_KEY = `${SITE_KEY}_position`;
    const STATE_KEY = `${SITE_KEY}_state`;
    const UNIT_KEY = `${SITE_KEY}_unit`;

    // 状态变量
    let intervalSeconds = GM_getValue(`${SITE_KEY}_interval`, DEFAULT_INTERVAL);
    let currentUnit = GM_getValue(UNIT_KEY, 's'); // 默认单位：秒
    let timer = null;
    let remainingSeconds = intervalSeconds;
    let isRunning = false;
    let isDragging = false;
    let offsetX, offsetY;
    let uiElements = null;

    // 单位转换工具函数
    function convertToSeconds(value, unit) {
        switch(unit) {
            case 'h': return value * 3600;
            case 'm': return value * 60;
            case 's': default: return value;
        }
    }

    function convertFromSeconds(seconds, unit) {
        switch(unit) {
            case 'h': return Math.floor(seconds / 3600);
            case 'm': return Math.floor(seconds / 60);
            case 's': default: return seconds;
        }
    }

    // 状态存储与恢复
    function restoreState() {
        const savedState = GM_getValue(STATE_KEY, { isRunning: false });
        isRunning = savedState.isRunning;
    }

    function saveState() {
        GM_setValue(STATE_KEY, { isRunning });
    }

    function restorePosition(container) {
        const savedPos = GM_getValue(POSITION_KEY, { top: '10px', left: '10px' });
        container.style.top = savedPos.top;
        container.style.left = savedPos.left;
    }

    function savePosition(container) {
        GM_setValue(POSITION_KEY, {
            top: container.style.top,
            left: container.style.left
        });
    }

    // 创建SVG图标
    function createIcon(svgContent, size = 16, color = 'currentColor') {
        const icon = document.createElement('div');
        icon.style.cssText = `
            width: ${size}px;
            height: ${size}px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            color: ${color};
            flex-shrink: 0;
        `;
        icon.innerHTML = svgContent;
        return icon;
    }

    // 图标定义
    const refreshIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 4v6h-6"/>
            <path d="M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
        </svg>
    `;
    const pauseIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="6" y="4" width="4" height="16"/>
            <rect x="14" y="4" width="4" height="16"/>
        </svg>
    `;
    const playIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
    `;
    const dragIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
            <line x1="5" y1="9" x2="19" y2="9"/>
            <line x1="5" y1="15" x2="19" y2="15"/>
        </svg>
    `;
    const dropdownIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12">
            <path d="M6 9l6 6 6-6"/>
        </svg>
    `;

    // 创建UI
    function createUI() {
        // 主容器
        const container = document.createElement('div');
        container.id = 'draggableRefreshTool';
        container.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            background: white;
            border: 1px solid rgba(226, 232, 240, 0.8);
            border-radius: 12px;
            padding: 12px 16px;
            box-shadow: 0 8px 30px rgba(0, 0, 0, 0.05);
            z-index: 99999;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 13px;
            display: inline-flex;
            align-items: center;
            gap: 16px;
            user-select: none;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        `;
        container.addEventListener('mouseenter', () => {
            if (!isDragging) {
                container.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(0, 0, 0, 0.05)';
                container.style.transform = 'translateY(-2px)';
            }
        });
        container.addEventListener('mouseleave', () => {
            if (!isDragging) {
                container.style.boxShadow = '0 8px 30px rgba(0, 0, 0, 0.05)';
                container.style.transform = 'translateY(0)';
            }
        });

        // 标题与拖拽区域
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: move;
            padding: 3px 0;
        `;
        const iconContainer = document.createElement('div');
        iconContainer.style.cssText = `
            width: 24px;
            height: 24px;
            border-radius: 6px;
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
        `;
        iconContainer.appendChild(createIcon(refreshIcon, 16, 'white'));
        header.appendChild(iconContainer);
        
        const titleWrapper = document.createElement('div');
        titleWrapper.style.display = 'flex';
        titleWrapper.style.alignItems = 'center';
        titleWrapper.style.gap = '4px';
        const title = document.createElement('span');
        title.textContent = '定时刷新';
        title.style.fontWeight = '500';
        title.style.color = '#1e293b';
        titleWrapper.appendChild(title);
        titleWrapper.appendChild(createIcon(dragIcon, 14, '#94a3b8'));
        header.appendChild(titleWrapper);

        // 间隔输入与单位选择容器
        const intervalContainer = document.createElement('div');
        intervalContainer.style.display = 'flex';
        intervalContainer.style.alignItems = 'center';
        intervalContainer.style.gap = 0;
        intervalContainer.style.borderRadius = '8px';
        intervalContainer.style.overflow = 'hidden';
        intervalContainer.style.transition = 'all 0.2s ease';

        // 时间输入框
        const intervalInput = document.createElement('input');
        intervalInput.type = 'number';
        intervalInput.value = convertFromSeconds(intervalSeconds, currentUnit);
        intervalInput.min = MIN_VALUES[currentUnit];
        intervalInput.style.cssText = `
            width: 65px;
            padding: 7px 12px;
            border: 1px solid #e2e8f0;
            border-right: none;
            font-size: 13px;
            font-weight: 500;
            outline: none;
            background: white;
            color: #1e293b;
            transition: all 0.2s;
        `;
        intervalInput.addEventListener('focus', () => {
            intervalInput.style.borderColor = '#a5b4fc';
            intervalInput.style.boxShadow = 'inset 0 0 0 1px #a5b4fc';
        });
        intervalInput.addEventListener('blur', () => {
            intervalInput.style.borderColor = '#e2e8f0';
            intervalInput.style.boxShadow = 'none';
        });

        // 时分秒下拉框 - 重点美化部分
        const unitSelectContainer = document.createElement('div');
        unitSelectContainer.style.cssText = `
            position: relative;
        `;
        
        const unitSelect = document.createElement('select');
        unitSelect.style.cssText = `
            padding: 7px 32px 7px 12px;
            border: 1px solid #e2e8f0;
            border-left: none;
            background: white;
            font-size: 13px;
            font-weight: 500;
            color: #475569;
            cursor: pointer;
            outline: none;
            appearance: none;
            transition: all 0.2s;
        `;
        
        // 下拉框箭头图标 - 使用独立元素实现更精美的设计
        const selectArrow = document.createElement('div');
        selectArrow.style.cssText = `
            position: absolute;
            right: 0;
            top: 0;
            bottom: 0;
            width: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: none;
            color: #94a3b8;
            transition: transform 0.2s ease;
        `;
        selectArrow.appendChild(createIcon(dropdownIcon, 14));
        
        // 添加单位选项
        ['s', 'm', 'h'].forEach(unit => {
            const option = document.createElement('option');
            option.value = unit;
            option.textContent = { s: '秒', m: '分', h: '时' }[unit];
            option.selected = unit === currentUnit;
            // 美化选项样式
            option.style.cssText = `
                padding: 8px 12px;
                background: white;
                color: #475569;
            `;
            unitSelect.appendChild(option);
        });
        
        // 下拉框交互效果
        unitSelect.addEventListener('focus', () => {
            unitSelect.style.borderColor = '#a5b4fc';
            unitSelect.style.boxShadow = 'inset 0 0 0 1px #a5b4fc';
        });
        unitSelect.addEventListener('blur', () => {
            unitSelect.style.borderColor = '#e2e8f0';
            unitSelect.style.boxShadow = 'none';
        });
        unitSelect.addEventListener('mouseenter', () => {
            selectArrow.style.color = '#64748b';
        });
        unitSelect.addEventListener('mouseleave', () => {
            selectArrow.style.color = '#94a3b8';
        });
        unitSelect.addEventListener('mousedown', () => {
            selectArrow.style.transform = 'rotate(180deg)';
        });
        unitSelect.addEventListener('mouseup', () => {
            selectArrow.style.transform = 'rotate(0)';
        });
        
        unitSelectContainer.appendChild(unitSelect);
        unitSelectContainer.appendChild(selectArrow);

        intervalContainer.appendChild(intervalInput);
        intervalContainer.appendChild(unitSelectContainer);

        // 控制按钮
        const controlBtn = document.createElement('button');
        controlBtn.style.cssText = `
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 7px 14px;
            border: none;
            border-radius: 8px;
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            color: white;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: all 0.25s ease;
            box-shadow: 0 2px 5px rgba(99, 102, 241, 0.2);
        `;
        controlBtn.appendChild(createIcon(playIcon, 16, 'white'));
        const btnText = document.createElement('span');
        btnText.textContent = '开始';
        controlBtn.appendChild(btnText);
        controlBtn.addEventListener('mouseenter', () => {
            if (isRunning) {
                controlBtn.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
                controlBtn.style.boxShadow = '0 3px 8px rgba(239, 68, 68, 0.3)';
            } else {
                controlBtn.style.background = 'linear-gradient(135deg, #4f46e5, #6366f1)';
                controlBtn.style.boxShadow = '0 3px 8px rgba(99, 102, 241, 0.3)';
            }
            controlBtn.style.transform = 'translateY(-2px)';
        });
        controlBtn.addEventListener('mouseleave', () => {
            if (isRunning) {
                controlBtn.style.background = 'linear-gradient(135deg, #f87171, #ef4444)';
                controlBtn.style.boxShadow = '0 2px 5px rgba(239, 68, 68, 0.2)';
            } else {
                controlBtn.style.background = 'linear-gradient(135deg, #6366f1, #8b5cf6)';
                controlBtn.style.boxShadow = '0 2px 5px rgba(99, 102, 241, 0.2)';
            }
            controlBtn.style.transform = 'translateY(0)';
        });

        // 剩余时间显示
        const timeLeft = document.createElement('span');
        timeLeft.textContent = `(${formatTime(remainingSeconds)})`;
        timeLeft.style.cssText = `
            color: #64748b;
            font-size: 12px;
            padding: 3px 0;
            min-width: 70px;
            display: inline-block;
            text-align: center;
            font-family: monospace;
        `;

        // 组装元素
        container.appendChild(header);
        container.appendChild(intervalContainer);
        container.appendChild(controlBtn);
        container.appendChild(timeLeft);
        document.body.appendChild(container);

        // 恢复位置
        restorePosition(container);

        // 拖拽功能
        header.addEventListener('mousedown', (e) => {
            isDragging = true;
            const rect = container.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
            container.style.transition = 'none';
            container.style.boxShadow = '0 15px 40px rgba(0, 0, 0, 0.12)';
            container.style.transform = 'translateY(-3px) scale(1.02)';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const newLeft = e.clientX - offsetX;
            const newTop = e.clientY - offsetY;
            const maxLeft = window.innerWidth - container.offsetWidth - 10;
            const maxTop = window.innerHeight - container.offsetHeight - 10;
            container.style.left = `${Math.max(10, Math.min(newLeft, maxLeft))}px`;
            container.style.top = `${Math.max(10, Math.min(newTop, maxTop))}px`;
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                container.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                container.style.boxShadow = '0 8px 30px rgba(0, 0, 0, 0.05)';
                container.style.transform = 'translateY(0) scale(1)';
                savePosition(container);
            }
        });

        // 间隔修改事件
        intervalInput.addEventListener('change', () => {
            updateIntervalFromInput(intervalInput, unitSelect);
        });

        // 单位切换事件
        unitSelect.addEventListener('change', () => {
            currentUnit = unitSelect.value;
            intervalInput.value = convertFromSeconds(intervalSeconds, currentUnit);
            intervalInput.min = MIN_VALUES[currentUnit];
            GM_setValue(UNIT_KEY, currentUnit);
        });

        // 控制按钮事件
        controlBtn.addEventListener('click', () => {
            toggleTimer(controlBtn, btnText);
        });

        return {
            container,
            timeLeft,
            controlBtn,
            intervalInput,
            unitSelect,
            btnText,
            selectArrow
        };
    }

    // 从输入更新间隔
    function updateIntervalFromInput(input, select) {
        const unit = select.value;
        let value = parseInt(input.value, 10) || MIN_VALUES[unit];
        value = Math.max(value, MIN_VALUES[unit]);
        
        intervalSeconds = convertToSeconds(value, unit);
        input.value = value;
        remainingSeconds = intervalSeconds;
        uiElements.timeLeft.textContent = `(${formatTime(remainingSeconds)})`;
        
        GM_setValue(`${SITE_KEY}_interval`, intervalSeconds);
        
        if (isRunning) {
            restartTimer();
        }
    }

    // 格式化时间显示
    function formatTime(seconds) {
        if (seconds < 60) return `${seconds}s`;
        
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        
        if (h > 0) return `${h}h${m}m${s}s`;
        return `${m}m${s}s`;
    }

    // 切换计时器状态
    function toggleTimer(btn, btnText) {
        if (isRunning) {
            stopTimer();
            btnText.textContent = '开始';
            btn.style.background = 'linear-gradient(135deg, #6366f1, #8b5cf6)';
            btn.style.boxShadow = '0 2px 5px rgba(99, 102, 241, 0.2)';
            btn.replaceChild(createIcon(playIcon, 16, 'white'), btn.firstChild);
        } else {
            startTimer();
            btnText.textContent = '暂停';
            btn.style.background = 'linear-gradient(135deg, #f87171, #ef4444)';
            btn.style.boxShadow = '0 2px 5px rgba(239, 68, 68, 0.2)';
            btn.replaceChild(createIcon(pauseIcon, 16, 'white'), btn.firstChild);
        }
        saveState();
    }

    // 启动计时器
    function startTimer() {
        if (timer) clearInterval(timer);
        
        timer = setInterval(() => {
            remainingSeconds--;
            uiElements.timeLeft.textContent = `(${formatTime(remainingSeconds)})`;
            
            if (remainingSeconds <= 0) {
                window.location.reload();
            }
        }, 1000);
        
        isRunning = true;
        remainingSeconds = intervalSeconds;
        uiElements.timeLeft.textContent = `(${formatTime(remainingSeconds)})`;
    }

    // 停止计时器
    function stopTimer() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
        isRunning = false;
    }

    // 重启计时器
    function restartTimer() {
        stopTimer();
        startTimer();
    }

    // 初始化
    uiElements = createUI();
    restoreState();

    // 应用恢复的状态
    if (isRunning) {
        uiElements.btnText.textContent = '暂停';
        uiElements.controlBtn.style.background = 'linear-gradient(135deg, #f87171, #ef4444)';
        uiElements.controlBtn.replaceChild(createIcon(pauseIcon, 16, 'white'), uiElements.controlBtn.firstChild);
        startTimer();
    }
})();