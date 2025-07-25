document.addEventListener('DOMContentLoaded', function() {
  // DOM elements
  const tasksList = document.getElementById('tasks-list');
  const taskForm = document.getElementById('task-form');
  const taskInput = document.getElementById('task-input');
  const taskCycle = document.getElementById('task-cycle');
  const showCompletedCheckbox = document.getElementById('show-completed-checkbox');
  const toggleSidebarBtn = document.getElementById('toggle-sidebar');
  const sidebar = document.getElementById('sidebar');
  
  // State
  let tasks = [];
  let showCompleted = false;
  let eventSource;

  // Initialize the app
  init();
  
  function init() {
    loadTasks();
    setupEventListeners();
    setupSSE();
  }
  
  function setupSSE() {
    if (eventSource) eventSource.close();
    
    eventSource = new EventSource('/api/updates');
    eventSource.onmessage = function(e) {
        if (e.data === 'update') {
            loadTasks();
        }
    };
    eventSource.onerror = function() {
        setTimeout(setupSSE, 1000);
    };
  }
  
  function setupEventListeners() {
    taskForm.addEventListener('submit', handleAddTask);
    
    showCompletedCheckbox.addEventListener('change', function() {
      showCompleted = this.checked;
      renderTasks();
    });
    
    toggleSidebarBtn.addEventListener('click', function() {
      sidebar.classList.toggle('hidden');
    });
    
    document.addEventListener('click', function(event) {
      if (window.innerWidth < 768 && 
          !sidebar.contains(event.target) && 
          !toggleSidebarBtn.contains(event.target)) {
        sidebar.classList.add('hidden');
      }
    });
  }
  
  function loadTasks() {
    fetch('/api/tasks')
        .then(response => response.json())
        .then(data => {
            tasks = (data || []).sort((a, b) => {
                const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
                const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
                return aDue - bDue;
            });
            renderTasks();
        })
        .catch(error => {
            console.error('Error loading tasks:', error);
            showError('Failed to load tasks');
        });
  }
  
  function renderTasks() {
    tasksList.innerHTML = '';
    
    const filteredTasks = showCompleted ? tasks : tasks.filter(task => !task.completedAt);
    
    if (filteredTasks.length === 0) {
      tasksList.innerHTML = `
        <div class="text-center py-10 text-subtext0">
          <i class="fas fa-tasks text-4xl"></i>
          <p class="mt-4">No tasks found. Add one to get started!</p>
        </div>
      `;
      return;
    }
    
    filteredTasks.forEach(task => {
      const taskElement = createTaskElement(task);
      tasksList.appendChild(taskElement);
    });
  }
  
  function createTaskElement(task) {
    const isCompleted = !!task.completedAt;
    const isOverdue = task.dueAt && !isCompleted && new Date(task.dueAt) < new Date();
    
    const taskElement = document.createElement('li');
    taskElement.className = `bg-base p-2 rounded-lg mb-3 transition-shadow hover:shadow-lg ${isCompleted ? 'opacity-60' : ''} ${isOverdue ? 'border border-red' : 'border border-transparent'}`;
    taskElement.dataset.id = task.id;
    
    const dueText = getDueText(task.dueAt);
    
    taskElement.innerHTML = `
      <div class="flex items-center gap-3">
        <input type="checkbox" class="task-checkbox appearance-none w-5 h-5 bg-surface0 rounded-md cursor-pointer checked:bg-mauve flex-shrink-0 flex items-center justify-center" ${isCompleted ? 'checked' : ''}>
        <span class="flex-grow ${isCompleted ? 'line-through text-subtext0' : ''}">${task.text}</span>
        <div class="flex items-center gap-2">
          <button class="delete-btn text-subtext0 hover:text-red" title="Delete task"><i class="fas fa-trash"></i></button>
        </div>
      </div>
      ${task.dueAt ? `<div class="pl-8 mt-1 text-sm ${isOverdue ? 'text-red font-semibold' : 'text-subtext0'}"><i class="far fa-clock mr-1.5"></i>${dueText}</div>` : ''}
    `;
    
    // Event listeners
    taskElement.querySelector('.task-checkbox').addEventListener('change', (e) => toggleTaskCompletion(task.id, e.target.checked));
    taskElement.querySelector('.delete-btn').addEventListener('click', () => deleteTask(task.id));
    
    return taskElement;
  }
  
  function handleAddTask(e) {
    e.preventDefault();
    const text = taskInput.value.trim();
    const cycle = taskCycle.value;
    if (!text) return;
    
    fetch('/api/task/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, cycle }),
    })
    .then(res => {
        if (!res.ok) throw new Error('Server responded with an error');
        taskInput.value = '';
        // SSE will handle the update
    })
    .catch(err => showError('Failed to add task'));
  }
  
  function toggleTaskCompletion(taskId, completed) {
    fetch('/api/task/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId }),
    }).catch(err => showError('Failed to update task'));
  }
  
  function deleteTask(taskId) {
    showConfirmation('Are you sure you want to delete this task?', () => {
      fetch('/api/task/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId }),
      }).catch(err => showError('Failed to delete task'));
    });
  }
  
  // --- Helpers ---
  function getDueText(dueAt) {
    if (!dueAt) return '';
    const now = new Date();
    const dueDate = new Date(dueAt);
    const diffMs = dueDate - now;
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));

    if (diffMs < 0) {
        if (Math.abs(diffDays) > 0) return `Overdue by ${Math.abs(diffDays)} day(s)`;
        return `Overdue by ${Math.abs(diffHours)} hour(s)`;
    }
    if (diffDays > 0) return `Due in ${diffDays} day(s)`;
    return `Due in ${diffHours} hour(s)`;
  }
  
  function showError(message) {
    const alert = document.createElement('div');
    alert.className = 'fixed top-5 right-5 bg-red text-crust px-4 py-2 rounded-lg shadow-lg animate-pulse';
    alert.textContent = message;
    document.body.appendChild(alert);
    setTimeout(() => alert.remove(), 3000);
  }

  function showConfirmation(message, onConfirm) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-base p-6 rounded-lg shadow-xl max-w-sm w-full">
            <p class="text-text mb-4">${message}</p>
            <div class="flex justify-end gap-3">
                <button id="confirm-cancel" class="bg-surface1 text-text px-4 py-2 rounded-lg hover:bg-surface2">Cancel</button>
                <button id="confirm-ok" class="bg-red text-crust px-4 py-2 rounded-lg hover:brightness-110">Confirm</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('confirm-ok').onclick = () => {
        onConfirm();
        modal.remove();
    };
    document.getElementById('confirm-cancel').onclick = () => modal.remove();
  }
});
