// popup.js 腳本
const PENDING_TASK_STORAGE_KEY = 'pendingTaskForPopup'; // Key for storing data from context menu

document.addEventListener('DOMContentLoaded', function() {
    const addTaskBtn = document.getElementById('addTaskBtn');
    const addTaskFormContainer = document.getElementById('addTaskFormContainer');
    const addTaskForm = document.getElementById('addTaskForm');
    const cancelAddTaskBtn = document.getElementById('cancelAddTaskBtn');
    const getCurrentUrlBtn = document.getElementById('getCurrentUrlBtn');
    const taskUrlInput = document.getElementById('taskUrl');
    const taskSelectorInput = document.getElementById('taskSelector'); // Added for direct access
    const taskNameInput = document.getElementById('taskName');       // Added for direct access
    const taskListDiv = document.getElementById('taskList');

    const taskComparisonModeSelect = document.getElementById('taskComparisonMode');
    const comparisonValueContainer = document.getElementById('comparisonValueContainer');
    const taskComparisonValueInput = document.getElementById('taskComparisonValue');

    function resetComparisonFields() {
        if (taskComparisonModeSelect) {
            taskComparisonModeSelect.value = 'anyChange';
        }
        if (taskComparisonValueInput) {
            taskComparisonValueInput.value = '';
        }
        // Trigger change to hide/show comparisonValueContainer based on default mode
        if (taskComparisonModeSelect && comparisonValueContainer) {
            taskComparisonModeSelect.dispatchEvent(new Event('change'));
        } else if (comparisonValueContainer) { // Fallback if select is somehow not found but container is
            comparisonValueContainer.style.display = 'none';
        }
    }

    function setFormToMode(mode, taskData = null) {
        if (!addTaskForm) return;

        addTaskForm.dataset.mode = mode;
        const submitButton = addTaskForm.querySelector('button[type="submit"]');

        if (mode === 'edit' && taskData) {
            addTaskForm.dataset.editingTaskId = taskData.id;
            if (submitButton) submitButton.textContent = '更新任務';

            taskNameInput.value = taskData.name || '';
            taskUrlInput.value = taskData.url;
            taskSelectorInput.value = taskData.selector;
            document.getElementById('taskFrequency').value = taskData.frequency;

            if (taskComparisonModeSelect) taskComparisonModeSelect.value = taskData.comparisonMode || 'anyChange';
            if (taskComparisonValueInput) taskComparisonValueInput.value = taskData.comparisonValue || '';
            if (taskComparisonModeSelect) taskComparisonModeSelect.dispatchEvent(new Event('change'));

        } else { // 'add' mode or reset
            addTaskForm.removeAttribute('data-editing-task-id');
            if (submitButton) submitButton.textContent = '儲存任務';
            addTaskForm.reset(); // Clear native form fields
            resetComparisonFields(); // Reset custom comparison fields

            if (taskData) { // Pre-fill for add mode (e.g., from context menu)
                if(taskNameInput) taskNameInput.value = taskData.name || '';
                if(taskUrlInput) taskUrlInput.value = taskData.url;
                if(taskSelectorInput) taskSelectorInput.value = taskData.selector;
            }
        }
    }


    if(addTaskForm) {
        setFormToMode('add'); // Initial setup
    }

    if (taskComparisonModeSelect) {
        taskComparisonModeSelect.addEventListener('change', function(event) {
            const selectedValue = event.target.value;
            if (comparisonValueContainer) {
                if (selectedValue === 'includesText' || selectedValue === 'regexMatch') {
                    comparisonValueContainer.style.display = 'block';
                } else {
                    comparisonValueContainer.style.display = 'none';
                    if (taskComparisonValueInput) taskComparisonValueInput.value = '';
                }
            }
        });
    }

    async function displayTasks() {
        // ... (displayTasks logic remains the same as before, ensuring taskListDiv is shown)
        if (!taskListDiv) {
            console.error("錯誤：找不到 taskListDiv 元素。");
            return;
        }
        taskListDiv.innerHTML = '';
        taskListDiv.style.display = 'block'; // Ensure task list is visible when displaying tasks

        try {
            const data = await chrome.storage.local.get(['tasks']);
            const tasks = data.tasks || [];

            if (tasks.length === 0) {
                taskListDiv.innerHTML = '<p>目前沒有任務</p>';
                return;
            }

            tasks.forEach(task => {
                const taskItem = document.createElement('div');
                taskItem.className = 'task-item';
                taskItem.dataset.taskId = task.id;

                const taskNameElement = document.createElement('h4');
                taskNameElement.textContent = task.name || `任務 (ID: ${task.id.slice(-6)})`;
                taskNameElement.className = 'task-name';

                const taskUrlElement = document.createElement('p');
                taskUrlElement.textContent = `URL: ${task.url}`;
                taskUrlElement.className = 'task-url';

                const taskSelectorElement = document.createElement('p');
                taskSelectorElement.textContent = `選擇器: ${task.selector}`;
                taskSelectorElement.className = 'task-selector';

                const taskFrequencyElement = document.createElement('p');
                const frequencyInMinutes = Math.round(task.frequency / 60000);
                taskFrequencyElement.textContent = `頻率: 每 ${frequencyInMinutes} 分鐘`;
                taskFrequencyElement.className = 'task-frequency';

                const taskCompModeElement = document.createElement('p');
                taskCompModeElement.textContent = `比對模式: ${task.comparisonMode || 'anyChange'}`;
                taskCompModeElement.className = 'task-comparison-mode';

                taskItem.appendChild(taskNameElement);
                taskItem.appendChild(taskUrlElement);
                taskItem.appendChild(taskSelectorElement);
                taskItem.appendChild(taskFrequencyElement);
                taskItem.appendChild(taskCompModeElement);

                if(task.comparisonMode === 'includesText' || task.comparisonMode === 'regexMatch'){
                    const taskCompValueElement = document.createElement('p');
                    taskCompValueElement.textContent = `比對值: ${task.comparisonValue || ''}`;
                    taskCompValueElement.className = 'task-comparison-value';
                    taskItem.appendChild(taskCompValueElement);
                }

                const actionsContainer = document.createElement('div');
                actionsContainer.className = 'task-actions-container';

                const editButton = document.createElement('button');
                editButton.textContent = '編輯';
                editButton.className = 'edit-task-btn task-action-btn';
                editButton.dataset.taskId = task.id;

                const deleteButton = document.createElement('button');
                deleteButton.textContent = '刪除';
                deleteButton.className = 'delete-task-btn task-action-btn';
                deleteButton.dataset.taskId = task.id;

                actionsContainer.appendChild(editButton);
                actionsContainer.appendChild(deleteButton);
                taskItem.appendChild(actionsContainer);
                taskListDiv.appendChild(taskItem);
            });
        } catch (error) {
            console.error('讀取或顯示任務時發生錯誤:', error);
            taskListDiv.innerHTML = '<p>讀取任務列表失敗。</p>';
        }
    }

    if (addTaskBtn) {
        addTaskBtn.addEventListener('click', function() {
            setFormToMode('add'); // Reset form to 'add' mode
            addTaskFormContainer.style.display = 'block';
            addTaskBtn.style.display = 'none';
            if(taskListDiv) taskListDiv.style.display = 'none';
        });
    }

    if (cancelAddTaskBtn) {
        cancelAddTaskBtn.addEventListener('click', function() {
            addTaskFormContainer.style.display = 'none';
            setFormToMode('add'); // Reset form to 'add' mode and clear fields

            if(addTaskBtn) addTaskBtn.style.display = 'block';
            if(taskListDiv) taskListDiv.style.display = 'block';
            // No need to call displayTasks() here, as no data changed. List was just hidden.
        });
    }

    if (getCurrentUrlBtn && taskUrlInput) {
        // ... (getCurrentUrlBtn logic remains the same)
        getCurrentUrlBtn.addEventListener('click', function() {
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                if (chrome.runtime.lastError) {
                    console.error("查詢分頁時出錯:", chrome.runtime.lastError.message);
                    return;
                }
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
            // ... (submit logic remains largely the same, but uses setFormToMode for reset)
            event.preventDefault();

            const taskName = taskNameInput.value.trim();
            const taskUrlValue = taskUrlInput.value.trim();
            const taskSelectorValue = taskSelectorInput.value.trim();
            const taskFrequencyValue = document.getElementById('taskFrequency').value;
            const comparisonMode = taskComparisonModeSelect.value;
            const comparisonValue = (comparisonMode === 'includesText' || comparisonMode === 'regexMatch')
                                     ? taskComparisonValueInput.value.trim()
                                     : '';

            if (!taskUrlValue || !taskSelectorValue || !taskFrequencyValue) {
                alert("請填寫所有必填欄位：URL、選擇器和頻率。");
                return;
            }
            const taskFrequency = parseInt(taskFrequencyValue, 10);
            if (isNaN(taskFrequency) || taskFrequency < 60000) {
                 alert("檢查頻率必須是至少 60000 毫秒（1 分鐘）的數字。");
                return;
            }

            const mode = addTaskForm.dataset.mode;
            const editingTaskId = addTaskForm.dataset.editingTaskId;

            if (mode === 'edit' && !editingTaskId) {
                alert("錯誤：處於編輯模式但找不到任務ID。請取消並重試。");
                return;
            }

            let messageAction;
            let messagePayload = {};

            if (mode === 'edit') {
                messageAction = 'updateTask';
                messagePayload.taskId = editingTaskId;
                messagePayload.updatedDetails = {
                    name: taskName || '', url: taskUrlValue, selector: taskSelectorValue, frequency: taskFrequency,
                    comparisonMode: comparisonMode, comparisonValue: comparisonValue
                };
            } else {
                messageAction = 'addTask';
                messagePayload.task = {
                    id: Date.now().toString(), name: taskName || '', url: taskUrlValue, selector: taskSelectorValue, frequency: taskFrequency,
                    lastContent: '', createdAt: Date.now(),
                    comparisonMode: comparisonMode, comparisonValue: comparisonValue, lastNumericValue: null
                };
            }
            messagePayload.action = messageAction;

            chrome.runtime.sendMessage(messagePayload, function(response) {
                const successMessageAction = mode === 'edit' ? '更新' : '新增';
                const currentTaskId = mode === 'edit' ? editingTaskId : messagePayload.task.id;

                if (chrome.runtime.lastError) {
                    console.error(`Popup: ${successMessageAction}任務時發生通訊錯誤:`, chrome.runtime.lastError.message);
                    alert(`${successMessageAction}任務失敗: ${chrome.runtime.lastError.message}`);
                } else if (response && response.success) {
                    console.log(`Popup: 任務 ${currentTaskId} ${successMessageAction}成功。`);
                    setFormToMode('add'); // Reset form state to 'add' and clear fields
                    addTaskFormContainer.style.display = 'none';
                    if(addTaskBtn) addTaskBtn.style.display = 'block';
                    if(taskListDiv) taskListDiv.style.display = 'block';
                } else {
                    console.error(`Popup: 任務 ${currentTaskId} ${successMessageAction}失敗。`, response ? response.message : '未知錯誤');
                    alert(`${successMessageAction}任務失敗: ${response ? response.message : '未知錯誤'}`);
                }
                displayTasks();
            });
        });
    }

    if (taskListDiv) {
        taskListDiv.addEventListener('click', function(event) {
            // ... (delete logic remains the same)
            const targetButton = event.target.closest('.task-action-btn');
            if (!targetButton) return;
            const taskId = targetButton.dataset.taskId;

            if (targetButton.classList.contains('delete-task-btn')) {
                if (taskId && window.confirm(`確定要刪除此任務嗎？\n(ID: ${taskId})`)) {
                    chrome.runtime.sendMessage({ action: "deleteTask", taskId: taskId }, function(response) {
                        if (chrome.runtime.lastError) {
                            alert(`刪除任務失敗: ${chrome.runtime.lastError.message}`);
                        } else if (!response || !response.success) {
                            alert(`刪除任務失敗: ${response ? response.message : '未知錯誤'}`);
                        }
                        displayTasks();
                    });
                }
            } else if (targetButton.classList.contains('edit-task-btn')) {
                if (taskId) {
                    chrome.storage.local.get(['tasks'], function(result) {
                        if (chrome.runtime.lastError) {
                            alert("讀取任務資料失敗。"); return;
                        }
                        const tasks = result.tasks || [];
                        const taskToEdit = tasks.find(task => task.id === taskId);

                        if (taskToEdit) {
                            setFormToMode('edit', taskToEdit); // Use helper to fill form
                            addTaskFormContainer.style.display = 'block';
                            if(addTaskBtn) addTaskBtn.style.display = 'none';
                            if(taskListDiv) taskListDiv.style.display = 'none';
                        } else {
                            alert('找不到要編輯的任務。');
                        }
                    });
                }
            }
        });
    }

    // Initial check for pending task from context menu
    chrome.storage.local.get([PENDING_TASK_STORAGE_KEY], function(result) {
        const pendingTask = result[PENDING_TASK_STORAGE_KEY];
        if (pendingTask && pendingTask.url && pendingTask.selector) {
            console.log("Popup: 發現來自右鍵選單的待處理任務資料:", pendingTask);

            setFormToMode('add', pendingTask); // Pre-fill form in 'add' mode

            addTaskFormContainer.style.display = 'block';
            if(addTaskBtn) addTaskBtn.style.display = 'none';
            if(taskListDiv) taskListDiv.style.display = 'none';

            chrome.storage.local.remove(PENDING_TASK_STORAGE_KEY, () => {
                if (chrome.runtime.lastError) {
                    console.error("Popup: 清除 pendingTaskForPopup 失敗:", chrome.runtime.lastError.message);
                } else {
                    console.log("Popup: pendingTaskForPopup 已成功從儲存中清除。");
                }
            });
        } else {
            console.log("Popup: 未發現待辦任務，正常載入列表。");
            displayTasks();
        }
    });
});
