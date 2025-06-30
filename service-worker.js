// service-worker.js 腳本

const TASK_STORAGE_KEY = 'tasks';
const ALARM_NAME_PREFIX = 'autoqueryn-task-';
const PENDING_TASK_STORAGE_KEY = 'pendingTaskForPopup';

// --- Context Menu Setup ---
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.remove("add_to_autoqueryn", () => {
        if (chrome.runtime.lastError) { /* Optional: Log error if needed */ }
        chrome.contextMenus.create({
            id: "add_to_autoqueryn", title: "新增到 AutoQueryN 監控", contexts: ["all"]
        }, () => {
            if (chrome.runtime.lastError) console.error("創建/更新右鍵選單 'add_to_autoqueryn' 失敗:", chrome.runtime.lastError.message);
            else console.log("AutoQueryN 右鍵選單已成功創建/更新。");
        });
    });
});

// --- Context Menu Click Handler ---
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "add_to_autoqueryn" && tab && tab.id) {
        const tabId = Number(tab.id);
        if (isNaN(tabId)) { console.error("無效的分頁 ID:", tab.id); return; }
        try {
            const response = await chrome.tabs.sendMessage(tabId, { action: "getClickedElementSelector" });
            if (response) {
                if (response.error) { console.error("Content script 回傳錯誤:", response.error); }
                else {
                    const { selector, pageUrl: csPageUrl, pageTitle: csPageTitle } = response;
                    const pendingTaskData = {
                        url: csPageUrl || info.pageUrl || tab.url,
                        selector: selector,
                        name: csPageTitle || tab.title || `監控於 ${new URL(csPageUrl || info.pageUrl || tab.url).hostname}`
                    };
                    chrome.storage.local.set({ [PENDING_TASK_STORAGE_KEY]: pendingTaskData }, () => {
                        if (chrome.runtime.lastError) { console.error("SW: 儲存 pendingTaskForPopup 失敗:", chrome.runtime.lastError.message); }
                        else {
                            console.log("SW: pendingTaskForPopup 已儲存:", pendingTaskData);
                            if (typeof chrome.action !== "undefined" && typeof chrome.action.openPopup === "function") {
                                chrome.action.openPopup({}, (popupWindow) => {
                                    if (chrome.runtime.lastError) console.warn("SW: 調用 chrome.action.openPopup() 失敗:", chrome.runtime.lastError.message);
                                    // else console.log("SW: Popup open attempt logged."); // Can be verbose
                                });
                            } else console.warn("SW: chrome.action.openPopup() API 不可用。");
                        }
                    });
                }
            } else console.warn("Content script 沒有回傳任何回應。");
        } catch (error) { console.error(`與 content script (${tab.url}) 通訊時發生異常:`, error.message); }
    }
});

async function getTasks() {
    try {
        const result = await chrome.storage.local.get([TASK_STORAGE_KEY]);
        return result[TASK_STORAGE_KEY] || [];
    } catch (error) { console.error('讀取任務時發生錯誤:', error); return []; }
}

async function saveTasks(tasks) {
    try {
        await chrome.storage.local.set({ [TASK_STORAGE_KEY]: tasks });
    } catch (error) { console.error('儲存任務時發生錯誤:', error); throw error; }
}

async function scheduleAlarmForTask(task) {
    const alarmName = `${ALARM_NAME_PREFIX}${task.id}`;
    const periodInMinutes = Math.max(1, Math.round(task.frequency / (60 * 1000)));
    try {
        await chrome.alarms.create(alarmName, { periodInMinutes: periodInMinutes });
        console.log(`已為任務 "${task.name || task.id}" (ID: ${task.id}) 設定鬧鐘: ${alarmName}，頻率: ${periodInMinutes} 分鐘`);
    } catch (error) { console.error(`為任務 "${task.name || task.id}" (ID: ${task.id}) 設定鬧鐘 ${alarmName} 失敗:`, error); }
}

function sendNotification(task, descriptiveMessage, newRawContent) {
    // ... (function remains the same)
    const iconUrl = chrome.runtime.getURL('icons/NewMessages.PNG');
    const soundUrl = chrome.runtime.getURL('Notice.mp3');
    const notificationId = `autoqueryn-notification-${task.id}-${Date.now()}`;
    let messageToShow = descriptiveMessage;
    if (newRawContent) messageToShow += `\n新內容 (預覽): "${newRawContent.substring(0, 80)}..."`;
    messageToShow += `\n點擊查看詳情。`;
    const notificationOptions = {
        type: 'basic', iconUrl: iconUrl, title: `任務 "${task.name || task.id}" 有更新！`,
        message: messageToShow, priority: 2, buttons: [{ title: '前往查看網頁' }]
    };
    chrome.notifications.create(notificationId, notificationOptions, (createdNotificationId) => {
        if (chrome.runtime.lastError) { console.error("創建通知失敗:", chrome.runtime.lastError.message); return; }
        console.log(`通知已創建: ${createdNotificationId}`);
        try { const audio = new Audio(soundUrl); audio.play().catch(e => console.warn("音效播放失敗:", e)); }
        catch (e) { console.warn("音效播放時發生例外:", e); }
    });
}

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
    // ... (function remains the same)
    if (notificationId.startsWith('autoqueryn-notification-')) {
        const parts = notificationId.split('-');
        if (parts.length >= 3) {
            const taskId = parts[2];
            if (buttonIndex === 0) {
                try {
                    const tasks = await getTasks();
                    const taskToOpen = tasks.find(t => t.id === taskId);
                    if (taskToOpen && taskToOpen.url) chrome.tabs.create({ url: taskToOpen.url, active: true });
                    else console.warn(`未找到任務 ${taskId} 或其 URL 以便打開。`);
                } catch (e) { console.error("處理通知按鈕點擊時出錯:", e); }
            }
        }
        chrome.notifications.clear(notificationId, (wasCleared) => {
            if (chrome.runtime.lastError && !wasCleared) console.warn(`嘗試清除通知 ${notificationId} 失敗:`, chrome.runtime.lastError.message);
        });
    }
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
    // ... (function remains the same)
    if (notificationId.startsWith('autoqueryn-notification-')) {
        const parts = notificationId.split('-');
        if (parts.length >= 3) {
            const taskId = parts[2];
            try {
                const tasks = await getTasks();
                const taskToOpen = tasks.find(t => t.id === taskId);
                if (taskToOpen && taskToOpen.url) chrome.tabs.create({ url: taskToOpen.url, active: true });
                else console.warn(`未找到任務 ${taskId} 或其 URL 以便打開。`);
            } catch (e) { console.error("處理通知主體點擊時出錯:", e); }
        }
        chrome.notifications.clear(notificationId, (wasCleared) => {
             if (chrome.runtime.lastError && !wasCleared) console.warn(`嘗試清除通知 ${notificationId} 失敗:`, chrome.runtime.lastError.message);
        });
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "addTask" && message.task) {
        (async () => {
            try {
                const tasks = await getTasks(); tasks.push(message.task); await saveTasks(tasks);
                await scheduleAlarmForTask(message.task);
                sendResponse({ success: true, message: "任務已成功新增並排程" });
            } catch (error) { sendResponse({ success: false, message: `新增任務並排程失敗: ${error.message}` }); }
        })();
        return true;
    } else if (message.action === "deleteTask" && message.taskId) {
        (async () => {
            const taskId = message.taskId; const alarmName = `${ALARM_NAME_PREFIX}${taskId}`;
            try {
                const tasks = await getTasks(); const updatedTasks = tasks.filter(task => task.id !== taskId);
                if (tasks.length === updatedTasks.length) {
                    await chrome.alarms.clear(alarmName);
                    sendResponse({ success: false, message: "任務未在儲存中找到，但已嘗試清除鬧鐘。" }); return;
                }
                await saveTasks(updatedTasks); await chrome.alarms.clear(alarmName);
                sendResponse({ success: true, message: "任務已成功刪除" });
            } catch (error) {
                try { await chrome.alarms.clear(alarmName); } catch (e) { /*ignore*/ }
                sendResponse({ success: false, message: error.message });
            }
        })();
        return true;
    } else if (message.action === "updateTask" && message.taskId && message.updatedDetails) {
        (async () => {
            try {
                const { taskId, updatedDetails } = message; const tasks = await getTasks();
                const taskIndex = tasks.findIndex(task => task.id === taskId);
                if (taskIndex === -1) { sendResponse({ success: false, message: `任務 ID ${taskId} 未在儲存中找到。` }); return; }
                const oldTask = tasks[taskIndex];
                const updatedTaskData = { ...oldTask, ...updatedDetails };
                tasks[taskIndex] = updatedTaskData; await saveTasks(tasks);
                if (oldTask.frequency !== updatedTaskData.frequency) {
                    const alarmName = `${ALARM_NAME_PREFIX}${updatedTaskData.id}`;
                    await chrome.alarms.clear(alarmName); await scheduleAlarmForTask(updatedTaskData);
                    console.log(`SW: 任務 ${updatedTaskData.id} 鬧鐘已因頻率改變而更新。`);
                }
                sendResponse({ success: true, task: updatedTaskData });
            } catch (error) { sendResponse({ success: false, message: error.message }); }
        })();
        return true;
    } else if (message.action === "updateTaskBaseline" && message.taskId && message.newBaseline) {
        (async () => {
            try {
                const { taskId, newBaseline } = message;
                const tasks = await getTasks();
                const taskIndex = tasks.findIndex(task => task.id === taskId);

                if (taskIndex === -1) {
                    sendResponse({ success: false, message: `任務 ID ${taskId} 未找到以更新基準。` });
                    return;
                }

                const taskToUpdate = { ...tasks[taskIndex] }; // Create a copy to modify

                if (newBaseline.hasOwnProperty('content')) {
                    taskToUpdate.lastContent = newBaseline.content;
                    // If it's a numeric mode, also attempt to update lastNumericValue from this new content string
                    if (taskToUpdate.comparisonMode === 'numberGreater' || taskToUpdate.comparisonMode === 'numberLesser') {
                        const cleanedContent = String(newBaseline.content).replace(/[^\d.-]/g, '');
                        const numVal = parseFloat(cleanedContent);
                        taskToUpdate.lastNumericValue = isNaN(numVal) ? null : numVal;
                    } else {
                        taskToUpdate.lastNumericValue = null; // Clear if not a numeric mode
                    }
                } else if (newBaseline.hasOwnProperty('numericValue')) {
                    taskToUpdate.lastNumericValue = newBaseline.numericValue;
                    // Also update lastContent to the string representation of the number for consistency
                    taskToUpdate.lastContent = String(newBaseline.numericValue);
                } else {
                    sendResponse({ success: false, message: "未提供有效的基準值內容 (content 或 numericValue)。" });
                    return;
                }

                tasks[taskIndex] = taskToUpdate;
                await saveTasks(tasks);
                console.log(`Service Worker: 任務 ${taskId} 的基準值已手動更新。New lastContent: "${taskToUpdate.lastContent}", New lastNumericValue: ${taskToUpdate.lastNumericValue}`);
                sendResponse({ success: true, message: "基準值已更新", updatedTask: taskToUpdate });

            } catch (error) {
                console.error(`Service Worker: 更新任務 ${message.taskId} 基準值時發生錯誤:`, error);
                sendResponse({ success: false, message: error.message });
            }
        })();
        return true;
    }
});

async function checkTask(task) {
    // ... (checkTask logic remains the same)
    if (!task || !task.url || !task.selector) { console.error('無效的任務物件，無法檢查:', task); return; }
    let newContentRaw;
    try {
        const tabs = await chrome.tabs.query({ url: task.url });
        if (tabs.length === 0) return;
        const tabId = tabs[0].id;
        const injectionResults = await chrome.scripting.executeScript({ target: { tabId: tabId }, func: getElementContentBySelector, args: [task.selector] });
        if (!injectionResults || injectionResults.length === 0 || injectionResults[0].result === undefined) {
            if (task.lastContent !== null && task.lastContent !== "") console.warn(`任務 "${task.name||task.id}" - 無法獲取內容 (之前有)。`, injectionResults);
            newContentRaw = null;
        } else newContentRaw = injectionResults[0].result;
    } catch (error) { console.error(`檢查任務 "${task.name||task.id}" (${task.url}) 獲取內容階段錯誤:`, error); return; }

    const mode = task.comparisonMode || 'anyChange';
    const comparisonVal = task.comparisonValue || '';
    const oldContentString = task.lastContent === null || task.lastContent === undefined ? "" : String(task.lastContent);
    let oldNumericValue = task.lastNumericValue;
    let triggerNotification = false;
    let notificationMessage = "";
    const newContentString = (newContentRaw === null || newContentRaw === undefined) ? "" : String(newContentRaw);
    const contentActuallyChanged = (newContentString !== oldContentString);
    let currentNumericValue = null;
    if (mode === 'numberGreater' || mode === 'numberLesser') {
        const cleanedNewContent = newContentString.replace(/[^\d.-]/g, '');
        currentNumericValue = parseFloat(cleanedNewContent);
    }

    if (contentActuallyChanged) {
        switch (mode) {
            case 'anyChange': triggerNotification = true; notificationMessage = `內容已變更`; break;
            case 'includesText': if (newContentString.includes(comparisonVal)) { triggerNotification = true; notificationMessage = `內容現在包含 "${comparisonVal}"`; } break;
            case 'regexMatch': try { if (new RegExp(comparisonVal).test(newContentString)) { triggerNotification = true; notificationMessage = `內容匹配正則 "${comparisonVal}"`; } } catch (e) { console.warn(`任務 "${task.name||task.id}" 正則 "${comparisonVal}" 無效:`, e); } break;
            case 'numberGreater': if (!isNaN(currentNumericValue)) { if (oldNumericValue !== null && !isNaN(oldNumericValue) && currentNumericValue > oldNumericValue) { triggerNotification = true; notificationMessage = `數值從 ${oldNumericValue} 增加到 ${currentNumericValue}`; } } else console.warn(`任務 "${task.name||task.id}"：新內容 "${newContentString.substring(0,30)}..." 非數字，無法 'numberGreater'。`); break;
            case 'numberLesser': if (!isNaN(currentNumericValue)) { if (oldNumericValue !== null && !isNaN(oldNumericValue) && currentNumericValue < oldNumericValue) { triggerNotification = true; notificationMessage = `數值從 ${oldNumericValue} 減少到 ${currentNumericValue}`; } } else console.warn(`任務 "${task.name||task.id}"：新內容 "${newContentString.substring(0,30)}..." 非數字，無法 'numberLesser'。`); break;
            default: console.warn(`任務 "${task.name||task.id}" 比對模式 "${mode}" 無效。默認 anyChange。`); triggerNotification = true; notificationMessage = `內容已變更 (未知模式)`;
        }
    }

    let shouldSaveTask = false; let taskToSave = { ...task };
    if (triggerNotification) {
        console.log(`任務 "${task.name||task.id}" 更新，模式: ${mode}。訊息: ${notificationMessage}`);
        sendNotification(taskToSave, notificationMessage, newContentString);
        taskToSave.lastContent = newContentString;
        if (mode === 'numberGreater' || mode === 'numberLesser') taskToSave.lastNumericValue = !isNaN(currentNumericValue) ? currentNumericValue : null;
        else taskToSave.lastNumericValue = null;
        shouldSaveTask = true;
    } else if (contentActuallyChanged) {
        taskToSave.lastContent = newContentString;
        if (mode === 'numberGreater' || mode === 'numberLesser') taskToSave.lastNumericValue = !isNaN(currentNumericValue) ? currentNumericValue : null;
        else taskToSave.lastNumericValue = null;
        shouldSaveTask = true;
    }
    if (shouldSaveTask) {
        try {
            const tasks = await getTasks(); const taskIndex = tasks.findIndex(t => t.id === taskToSave.id);
            if (taskIndex !== -1) { tasks[taskIndex] = taskToSave; await saveTasks(tasks); }
        } catch (error) { console.error(`儲存更新任務 "${taskToSave.name||taskToSave.id}" 錯誤:`, error); }
    }
}

function getElementContentBySelector(selector) {
    const element = document.querySelector(selector);
    if (element) return element.innerText;
    return null;
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name.startsWith(ALARM_NAME_PREFIX)) {
        const taskId = alarm.name.substring(ALARM_NAME_PREFIX.length);
        const tasks = await getTasks(); const taskToRun = tasks.find(t => t.id === taskId);
        if (taskToRun) await checkTask(taskToRun);
        else {
            console.warn(`鬧鐘 "${alarm.name}" 觸發，但找不到ID: ${taskId}。嘗試清除孤立鬧鐘。`);
            try { await chrome.alarms.clear(alarm.name); console.log(`已清除孤立鬧鐘: ${alarm.name}`); }
            catch (clearError) { console.error(`清除孤立鬧鐘 ${alarm.name} 失敗:`, clearError); }
        }
    }
});

(async () => {
    try {
        const tasks = await getTasks();
        if (tasks && tasks.length > 0) {
            let rescheduled = 0, existing = 0;
            for (const task of tasks) {
                const alarmName = `${ALARM_NAME_PREFIX}${task.id}`;
                try {
                    const existingAlarm = await chrome.alarms.get(alarmName);
                    if (!existingAlarm) { await scheduleAlarmForTask(task); rescheduled++; }
                    else existing++;
                } catch (e) { console.error(`處理任務 ${task.id} 鬧鐘錯誤:`, e); }
            }
            console.log(`鬧鐘初始化完成。重排程 ${rescheduled}，已存在 ${existing}。`);
        }
    } catch (initError) { console.error("初始化任務鬧鐘錯誤:", initError); }
})();
