document.addEventListener('DOMContentLoaded', function() {
    // Elements
    const taskForm = document.getElementById('task-form');
    const taskInput = document.getElementById('task-input');
    const taskCycle = document.getElementById('task-cycle');
    const tasksList = document.getElementById('tasks-list');
    const showCompletedCheckbox = document.getElementById('show-completed-checkbox');
    const toggleSidebarButton = document.getElementById('toggle-sidebar');
    const sidebar = document.querySelector('.sidebar');
    
    // Templates
    const taskTemplate = document.getElementById('task-template');
    const subtaskFormTemplate = document.getElementById('subtask-form-template');
    
    let tasks = [];
    let showCompleted = false;
    
    // Initialize
    loadTasks();
    
    // Event listeners
    taskForm.addEventListener('submit', handleAddTask);
    showCompletedCheckbox.addEventListener('change', toggleCompletedTasks);
    toggleSidebarButton.addEventListener('click', toggleSidebar);
    
    // Functions
    function loadTasks() {
        fetch('/api/tasks')
            .then(response => response.json())
            .then(data => {
                tasks = data;
                renderTasks();
            })
            .catch(error => console.error('Error loading tasks:', error));
    }
    
    function renderTasks() {
        tasksList.innerHTML = '';
        
        tasks.forEach(task => {
            if (!showCompleted && task.completedAt !== null) {
                return;
            }
            
            const taskElement = createTaskElement(task);
            tasksList.appendChild(taskElement);
            
            // Render subtasks if any
            if (task.subtasks && task.subtasks.length > 0) {
                const subtasksList = taskElement.querySelector('.subtasks-list');
                
                task.subtasks.forEach(subtask => {
                    if (!showCompleted && subtask.completedAt !== null) {
                        return;
                    }
                    
                    const subtaskElement = createTaskElement(subtask, true);
                    subtasksList.appendChild(subtaskElement);
                });
            }
        });
    }
    
    function createTaskElement(task, isSubtask = false) {
        const taskElement = document.importNode(taskTemplate.content, true).firstElementChild;
        
        // Set task data
        taskElement.dataset.id = task.id;
        const taskText = taskElement.querySelector('.task-text');
        const taskCycleSpan = taskElement.querySelector('.task-cycle');
        const checkbox = taskElement.querySelector('.task-checkbox');
        const addSubtaskBtn = taskElement.querySelector('.btn-add-subtask');
        const deleteBtn = taskElement.querySelector('.btn-delete');
        const overdueSpan = taskElement.querySelector('.task-overdue');
        
        // Set task content
        taskText.textContent = task.text;
        
        // Set cycle text
        if (task.cycle) {
            taskCycleSpan.textContent = task.cycle;
        } else {
            taskCycleSpan.remove();
        }
        
        // Check if task is completed
        if (task.completedAt !== null) {
            checkbox.checked = true;
            taskElement.classList.add('task-completed');
        }
        
        // Check if task is overdue
        if (task.cycle && !isTaskCompleted(task) && isTaskOverdue(task)) {
            overdueSpan.classList.remove('hidden');
        }
        
        // Hide add subtask button for subtasks
        if (isSubtask) {
            addSubtaskBtn.remove();
        }
        
        // Add event listeners
        checkbox.addEventListener('change', () => toggleTaskCompletion(task.id, checkbox.checked));
        deleteBtn.addEventListener('click', () => deleteTask(task.id));
        
        if (!isSubtask) {
            addSubtaskBtn.addEventListener('click', () => showAddSubtaskForm(taskElement, task.id));
        }
        
        return taskElement;
    }
    
    function handleAddTask(event) {
        event.preventDefault();
        
        const text = taskInput.value.trim();
        const cycle = taskCycle.value;
        
        if (text) {
            addTask(text, cycle);
            taskInput.value = '';
        }
    }
    
    function addTask(text, cycle) {
        fetch('/api/tasks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text, cycle })
        })
        .then(response => response.json())
        .then(task => {
            tasks.push(task);
            renderTasks();
        })
        .catch(error => console.error('Error adding task:', error));
    }
    
    function showAddSubtaskForm(parentElement, parentId) {
        // Check if form already exists
        if (parentElement.querySelector('.subtask-form-container')) {
            return;
        }
        
        const subtaskForm = document.importNode(subtaskFormTemplate.content, true);
        const form = subtaskForm.querySelector('.subtask-form');
        const cancelBtn = subtaskForm.querySelector('.btn-cancel');
        
        form.addEventListener('submit', function(event) {
            event.preventDefault();
            
            const input = this.querySelector('.subtask-input');
            const cycle = this.querySelector('.subtask-cycle');
            const text = input.value.trim();
            
            if (text) {
                addSubtask(parentId, text, cycle.value);
                this.closest('.subtask-form-container').remove();
            }
        });
        
        cancelBtn.addEventListener('click', function() {
            this.closest('.subtask-form-container').remove();
        });
        
        parentElement.appendChild(subtaskForm);
        parentElement.querySelector('.subtask-input').focus();
    }
    
    function addSubtask(parentId, text, cycle) {
        fetch(`/api/tasks/${parentId}/subtask`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text, cycle })
        })
        .then(response => response.json())
        .then(subtask => {
            // Find parent task and add subtask
            const parentTask = tasks.find(task => task.id === parentId);
            if (parentTask) {
                if (!parentTask.subtasks) {
                    parentTask.subtasks = [];
                }
                parentTask.subtasks.push(subtask);
                renderTasks();
            }
        })
        .catch(error => console.error('Error adding subtask:', error));
    }
    
    function toggleTaskCompletion(id, completed) {
        fetch(`/api/tasks/${id}/status`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ complete: completed })
        })
        .then(() => {
            // Update task in local data
            updateTaskCompletionStatus(id, completed);
            renderTasks();
        })
        .catch(error => console.error('Error updating task status:', error));
    }
    
    function updateTaskCompletionStatus(id, completed) {
        // Check main tasks
        for (const task of tasks) {
            if (task.id === id) {
                task.completedAt = completed ? new Date().toISOString() : null;
                return;
            }
            
            // Check subtasks
            if (task.subtasks) {
                for (const subtask of task.subtasks) {
                    if (subtask.id === id) {
                        subtask.completedAt = completed ? new Date().toISOString() : null;
                        
                        // Check if all subtasks are complete to auto-complete parent
                        const allComplete = task.subtasks.every(st => st.completedAt !== null);
                        task.completedAt = allComplete ? new Date().toISOString() : null;
                        return;
                    }
                }
            }
        }
    }
    
    function deleteTask(id) {
        fetch(`/api/tasks/${id}`, {
            method: 'DELETE'
        })
        .then(() => {
            // Remove task from local data
            removeTaskFromLocalData(id);
            renderTasks();
        })
        .catch(error => console.error('Error deleting task:', error));
    }
    
    function removeTaskFromLocalData(id) {
        // Check for main tasks
        const taskIndex = tasks.findIndex(task => task.id === id);
        if (taskIndex !== -1) {
            tasks.splice(taskIndex, 1);
            return;
        }
        
        // Check for subtasks
        for (const task of tasks) {
            if (task.subtasks) {
                const subtaskIndex = task.subtasks.findIndex(subtask => subtask.id === id);
                if (subtaskIndex !== -1) {
                    task.subtasks.splice(subtaskIndex, 1);
                    return;
                }
            }
        }
    }
    
    function toggleCompletedTasks() {
        showCompleted = showCompletedCheckbox.checked;
        renderTasks();
    }
    
    function toggleSidebar() {
        sidebar.classList.toggle('sidebar-visible');
    }
    
    function isTaskCompleted(task) {
        return task.completedAt !== null;
    }
    
    function isTaskOverdue(task) {
        if (!task.cycle) return false;
        
        const now = new Date();
        const createdAt = new Date(task.createdAt);
        const cycleMilliseconds = convertCycleToMilliseconds(task.cycle);
        
        return now - createdAt > cycleMilliseconds;
    }
    
    function convertCycleToMilliseconds(cycle) {
        const minuteMs = 60 * 1000;
        const hourMs = 60 * minuteMs;
        const dayMs = 24 * hourMs;
        const weekMs = 7 * dayMs;
        const monthMs = 30 * dayMs;
        
        switch (cycle) {
            case '5m': return 5 * minuteMs;
            case '1h': return hourMs;
            case '4h': return 4 * hourMs;
            case '12h': return 12 * hourMs;
            case '1d': return dayMs;
            case '3d': return 3 * dayMs;
            case '1w': return weekMs;
            case '1m': return monthMs;
            case '3m': return 3 * monthMs;
            default: return 0;
        }
    }
});
