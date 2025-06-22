// service-worker.js 腳本

// 任務物件結構範例：
// {
//   id: string, // 唯一ID，可以用 Date.now().toString() 或 UUID
//   url: string, // 目標網頁 URL
//   selector: string, // CSS 選擇器
//   frequency: number, // 檢查頻率 (毫秒)
//   lastContent: string, // 上次檢查到的內容 (用於比對)
//   name: string, // 任務名稱 (可選，讓使用者自訂)
//   createdAt: number // 建立時間戳
// }

const TASK_STORAGE_KEY = 'tasks';
const ALARM_NAME_PREFIX = 'autoqueryn-task-';

/**
 * 讀取所有任務
 * @returns {Promise<Array>}
 */
async function getTasks() {
    try {
        const result = await chrome.storage.local.get([TASK_STORAGE_KEY]);
        return result[TASK_STORAGE_KEY] || [];
    } catch (error) {
        console.error('讀取任務時發生錯誤:', error);
        return [];
    }
}

/**
 * 儲存所有任務
 * @param {Array} tasks 任務列表
 * @returns {Promise<void>}
 */
async function saveTasks(tasks) {
    try {
        await chrome.storage.local.set({ [TASK_STORAGE_KEY]: tasks });
        console.log('任務已儲存:', tasks);
    } catch (error) {
        console.error('儲存任務時發生錯誤:', error);
        throw error;
    }
}

/**
 * 為指定任務設定鬧鐘
 * @param {object} task 任務物件
 */
async function scheduleAlarmForTask(task) {
    const alarmName = `${ALARM_NAME_PREFIX}${task.id}`;
    // Convert frequency from milliseconds to minutes for the alarms API.
    // Ensure periodInMinutes is at least 1, as required by the API.
    const periodInMinutes = Math.max(1, Math.round(task.frequency / (60 * 1000)));

    try {
        await chrome.alarms.create(alarmName, {
            periodInMinutes: periodInMinutes,
            // delayInMinutes: 0 // Use 0 for immediate first trigger after scheduling, or adjust if needed
        });
        console.log(`已為任務 "${task.name || task.id}" (ID: ${task.id}) 設定鬧鐘: ${alarmName}，頻率: ${periodInMinutes} 分鐘`);
    } catch (error) {
        console.error(`為任務 "${task.name || task.id}" (ID: ${task.id}) 設定鬧鐘 ${alarmName} 失敗:`, error);
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "addTask" && message.task) {
        (async () => {
            try {
                console.log("Service worker 收到 addTask 請求:", message.task);
                const tasks = await getTasks();
                tasks.push(message.task);
                await saveTasks(tasks);
                await scheduleAlarmForTask(message.task); // Schedule alarm for the new task
                console.log("任務已成功新增並排程。");
                sendResponse({ success: true, message: "任務已成功新增並排程" });
            } catch (error) {
                console.error("新增任務並排程時 service worker 出錯:", error);
                sendResponse({ success: false, message: `新增任務並排程失敗: ${error.message}` });
            }
        })();
        return true; // Indicates that the response is sent asynchronously
    }
    // Future actions can be handled here
});

/**
 * 檢查單個任務
 * @param {object} task 任務物件
 */
async function checkTask(task) {
    if (!task || !task.url || !task.selector) {
        console.error('無效的任務物件，無法檢查:', task);
        return;
    }

    console.log(`開始檢查任務: "${task.name || task.id}" - URL: ${task.url}`);

    try {
        const tabs = await chrome.tabs.query({ url: task.url });

        if (tabs.length === 0) {
            console.warn(`[AutoQueryN] 找不到與 URL 匹配的已開啟分頁: ${task.url}。任務 "${task.name || task.id}" 暫不執行。`);
            return;
        }

        const tabId = tabs[0].id;
        console.log(`找到匹配分頁 ID: ${tabId} for URL ${task.url}，準備在分頁上執行腳本。`);

        const injectionResults = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: getElementContentBySelector,
            args: [task.selector]
        });

        if (injectionResults && injectionResults.length > 0) {
            const mainFrameResult = injectionResults.find(r => r.frameId === 0 || r.documentId);
            if (mainFrameResult && mainFrameResult.result !== undefined) {
                const content = mainFrameResult.result;
                console.log(`任務 "${task.name || task.id}" - CSS選擇器 "${task.selector}" - 獲取內容:`, content);
                // TODO: Compare content with task.lastContent & notify
            } else if (mainFrameResult && mainFrameResult.error) {
                 console.warn(`任務 "${task.name || task.id}" - 執行腳本時發生錯誤於 ${task.url} 的選擇器 "${task.selector}": ${mainFrameResult.error.message || mainFrameResult.error}`);
            } else {
                 console.warn(`任務 "${task.name || task.id}" - 無法從 ${task.url} 的選擇器 "${task.selector}" 獲取內容。`, injectionResults);
            }
        } else {
            console.warn(`任務 "${task.name || task.id}" - 腳本執行沒有返回結果 for selector "${task.selector}" on ${task.url}.`, injectionResults);
        }

    } catch (error) {
        console.error(`檢查任務 "${task.name || task.id}" (${task.url}) 時發生錯誤:`, error);
        if (error.message.includes("getElementContentBySelector is not defined")) {
            console.error("重要提示: 'getElementContentBySelector' 未在目標頁面的 content script 上下文中定義。請確保 'content_script.js' 已在 'manifest.json' 的 'content_scripts' 中正確註冊，並且該函數在全域範圍內。");
        }
    }
}

// This function is defined in content_script.js.
// It's being passed to chrome.scripting.executeScript.
// For this to work by name, content_script.js must be registered in manifest.json, which it is.
function getElementContentBySelector(selector) {
    const element = document.querySelector(selector);
    if (element) {
        return element.innerText;
    } else {
        // This console.warn will appear in the content script's console (of the target tab)
        console.warn(`[AutoQueryN content_script] 找不到元素: ${selector}`);
        return null;
    }
}


// Listener for alarm events
chrome.alarms.onAlarm.addListener(async (alarm) => {
    console.log('鬧鐘觸發:', alarm.name);
    if (alarm.name.startsWith(ALARM_NAME_PREFIX)) {
        const taskId = alarm.name.substring(ALARM_NAME_PREFIX.length);
        const tasks = await getTasks();
        const taskToRun = tasks.find(t => t.id === taskId);

        if (taskToRun) {
            console.log(`鬧鐘 "${alarm.name}" 觸發，執行任務:`, taskToRun.name || taskToRun.id);
            await checkTask(taskToRun);
        } else {
            console.warn(`鬧鐘 "${alarm.name}" 觸發，但找不到對應的任務 ID: ${taskId}。可能已被刪除。將嘗試清除此孤立鬧鐘。`);
            try {
                await chrome.alarms.clear(alarm.name);
                console.log(`已清除孤立鬧鐘: ${alarm.name}`);
            } catch (clearError) {
                console.error(`清除孤立鬧鐘 ${alarm.name} 失敗:`, clearError);
            }
        }
    }
});

// Initialize alarms on Service Worker startup
(async () => {
    console.log('Service Worker 啟動，正在初始化任務鬧鐘...');
    try {
        const tasks = await getTasks();
        if (tasks && tasks.length > 0) {
            let rescheduledCount = 0;
            let existingCount = 0;
            for (const task of tasks) {
                const alarmName = `${ALARM_NAME_PREFIX}${task.id}`;
                const existingAlarm = await chrome.alarms.get(alarmName);
                if (!existingAlarm) {
                    console.log(`為任務 "${task.name || task.id}" (ID: ${task.id}) 重新排程鬧鐘。`);
                    await scheduleAlarmForTask(task);
                    rescheduledCount++;
                } else {
                    // console.log(`任務 "${task.name || task.id}" (ID: ${task.id}) 的鬧鐘已存在。`);
                    existingCount++;
                }
            }
            console.log(`任務鬧鐘初始化完成。重新排程 ${rescheduledCount} 個鬧鐘，${existingCount} 個鬧鐘已存在。`);
        } else {
            console.log('沒有已儲存的任務，無需初始化鬧鐘。');
        }
    } catch (initError) {
        console.error("初始化任務鬧鐘時發生錯誤:", initError);
    }
})();
