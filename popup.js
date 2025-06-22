// popup.js 腳本
document.addEventListener('DOMContentLoaded', function() {
    const addTaskBtn = document.getElementById('addTaskBtn');
    const addTaskFormContainer = document.getElementById('addTaskFormContainer');
    const addTaskForm = document.getElementById('addTaskForm');
    const cancelAddTaskBtn = document.getElementById('cancelAddTaskBtn');
    const getCurrentUrlBtn = document.getElementById('getCurrentUrlBtn');
    const taskUrlInput = document.getElementById('taskUrl');

    if (addTaskBtn) {
        addTaskBtn.addEventListener('click', function() {
            addTaskFormContainer.style.display = 'block';
            addTaskBtn.style.display = 'none'; // Hide the "Add Task" button
        });
    }

    if (cancelAddTaskBtn) {
        cancelAddTaskBtn.addEventListener('click', function() {
            addTaskFormContainer.style.display = 'none';
            addTaskForm.reset(); // Reset form fields
            addTaskBtn.style.display = 'block'; // Show the "Add Task" button
        });
    }

    if (getCurrentUrlBtn && taskUrlInput) {
        getCurrentUrlBtn.addEventListener('click', function() {
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                if (tabs && tabs.length > 0) {
                    taskUrlInput.value = tabs[0].url;
                } else {
                    console.warn("無法獲取當前分頁 URL");
                }
            });
        });
    }

    if (addTaskForm) {
        addTaskForm.addEventListener('submit', function(event) {
            event.preventDefault();

            const taskName = document.getElementById('taskName').value;
            const taskUrl = taskUrlInput.value;
            const taskSelector = document.getElementById('taskSelector').value;
            const taskFrequency = parseInt(document.getElementById('taskFrequency').value, 10);

            if (!taskUrl || !taskSelector || isNaN(taskFrequency)) {
                console.error("表單資料不完整或無效");
                // TODO: Show user friendly error message
                return;
            }

            const newTask = {
                id: Date.now().toString(),
                name: taskName || '',
                url: taskUrl,
                selector: taskSelector,
                frequency: taskFrequency,
                lastContent: '',
                createdAt: Date.now()
            };

            chrome.runtime.sendMessage({ action: "addTask", task: newTask }, function(response) {
                if (chrome.runtime.lastError) {
                    console.error("發送訊息到 service worker 失敗:", chrome.runtime.lastError.message);
                    // TODO: Handle error, e.g., show message to user
                    return;
                }
                if (response && response.success) {
                    console.log("任務已成功新增 (來自 service worker 的回應):", response.message);
                    addTaskFormContainer.style.display = 'none';
                    addTaskForm.reset();
                    addTaskBtn.style.display = 'block';
                    // TODO: Refresh task list display
                } else {
                    console.error("新增任務失敗 (來自 service worker 的回應):", response ? response.message : "沒有回應");
                    // TODO: Handle error, e.g., show message to user
                }
            });
        });
    }

    // 後續將在此處實作載入並顯示任務列表的邏輯
});
