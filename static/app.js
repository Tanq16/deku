document.addEventListener('DOMContentLoaded', function() {
  // DOM elements
  const tasksList = document.getElementById('tasks-list');
  const taskForm = document.getElementById('task-form');
  const taskInput = document.getElementById('task-input');
  const taskCycle = document.getElementById('task-cycle');
  const showCompletedCheckbox = document.getElementById('show-completed-checkbox');
  const themeToggle = document.getElementById('theme-toggle');
  const toggleSidebar = document.getElementById('toggle-sidebar');
  const sidebar = document.querySelector('.sidebar');
  
  // State
  let tasks = [];
  let showCompleted = false;
  let eventSource;

  // Server Side Event for updating content
  function setupSSE() {
    if (eventSource) eventSource.close();
    
    eventSource = new EventSource('/api/updates');
    eventSource.onmessage = function(e) {
        if (e.data === 'update') {
            loadTasks();
        }
    };
    eventSource.onerror = function() {
        // Try to reconnect after 1 second
        setTimeout(setupSSE, 1000);
    };
  }
  
  // Initialize the app
  init();
  
  function init() {
    // Load theme preference
    loadTheme();
    // Load tasks
    loadTasks();
    // Set up event listeners
    setupEventListeners();
    // Setup SSE
    setupSSE();
  }
  
  function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
  }
  
  function updateThemeIcon(theme) {
    const icon = themeToggle.querySelector('i');
    icon.className = theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
  }
  
  function setupEventListeners() {
    // Task form submission
    taskForm.addEventListener('submit', handleAddTask);
    
    // Show completed tasks toggle
    showCompletedCheckbox.addEventListener('change', function() {
      showCompleted = this.checked;
      renderTasks();
    });
    
    // Theme toggle
    themeToggle.addEventListener('click', toggleTheme);
    
    // Mobile sidebar toggle
    toggleSidebar.addEventListener('click', function() {
      sidebar.classList.toggle('visible');
    });
    
    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', function(event) {
      if (window.innerWidth <= 768 && 
          !sidebar.contains(event.target) && 
          !toggleSidebar.contains(event.target)) {
        sidebar.classList.remove('visible');
      }
    });
  }
  
  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
  }
  
  function loadTasks() {
    fetch('/api/tasks')
        .then(response => response.json())
        .then(data => {
            // Sort tasks by due date (closest first)
            tasks = data.sort((a, b) => {
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
        <div class="empty-state">
          <i class="fas fa-tasks"></i>
          <p>No tasks found. Add a new task to get started!</p>
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
    taskElement.className = `task-item ${isCompleted ? 'completed' : ''} ${isOverdue ? 'overdue' : ''}`;
    taskElement.dataset.id = task.id;
    
    // Format dates
    const createdAt = formatDate(task.createdAt);
    const dueDate = task.dueAt ? formatDate(task.dueAt) : null;
    const dueText = getDueText(task.dueAt);
    
    taskElement.innerHTML = `
      <div class="task-header">
        <input type="checkbox" class="task-checkbox" ${isCompleted ? 'checked' : ''}>
        <span class="task-text ${isCompleted ? 'completed' : ''}">${task.text}</span>
        <div class="task-actions">
          <button class="task-btn add-subtask-btn" title="Add subtask">
            <i class="fas fa-plus-circle"></i>
          </button>
          <button class="task-btn delete-btn" title="Delete task">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
      <div class="task-details">
        ${dueDate ? `
          <span class="task-due ${isOverdue ? 'overdue' : ''}" title="Due at">
            <i class="far fa-clock"></i> ${dueText}
          </span>
        ` : ''}
      </div>
      ${task.subtasks && task.subtasks.length > 0 ? `
        <div class="subtasks">
          ${task.subtasks.map(subtask => createSubtaskElement(subtask)).join('')}
        </div>
      ` : ''}
      <form class="subtask-form" style="display: none;">
        <input type="text" placeholder="Add a subtask..." required>
        <button type="submit" class="btn-primary">Add</button>
      </form>
    `;
    
    // Add event listeners to the task
    const checkbox = taskElement.querySelector('.task-checkbox');
    const deleteBtn = taskElement.querySelector('.delete-btn');
    const addSubtaskBtn = taskElement.querySelector('.add-subtask-btn');
    const subtaskForm = taskElement.querySelector('.subtask-form');
    
    checkbox.addEventListener('change', () => toggleTaskCompletion(task.id, checkbox.checked));
    deleteBtn.addEventListener('click', () => deleteTask(task.id));
    addSubtaskBtn.addEventListener('click', () => {
      subtaskForm.style.display = 'flex';
    });
    
    subtaskForm.addEventListener('submit', function(e) {
      e.preventDefault();
      const input = this.querySelector('input');
      addSubtask(task.id, input.value, '');
      input.value = '';
      this.style.display = 'none';
    });
    
    return taskElement;
  }
  
  function createSubtaskElement(subtask) {
    const isCompleted = !!subtask.completedAt;
    const isOverdue = subtask.dueAt && !isCompleted && new Date(subtask.dueAt) < new Date();
    
    return `
      <div class="subtask-item ${isCompleted ? 'completed' : ''} ${isOverdue ? 'overdue' : ''}" data-id="${subtask.id}">
        <div class="task-header">
          <input type="checkbox" class="task-checkbox" ${isCompleted ? 'checked' : ''}>
          <span class="task-text ${isCompleted ? 'completed' : ''}">${subtask.text}</span>
          <div class="task-actions">
            <button class="task-btn delete-subtask-btn" title="Delete subtask">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
        ${subtask.dueAt ? `
          <div class="task-details">
            <span class="task-due ${isOverdue ? 'overdue' : ''}" title="Due at">
              <i class="far fa-clock"></i> ${getDueText(subtask.dueAt)}
            </span>
          </div>
        ` : ''}
      </div>
    `;
  }
  
  function handleAddTask(e) {
    e.preventDefault();
    
    const text = taskInput.value.trim();
    const cycle = taskCycle.value;
    
    if (!text) return;
    
    fetch('/api/task/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, cycle }),
    })
      .then(response => response.json())
      .then(newTask => {
        tasks.push(newTask);
        renderTasks();
        taskInput.value = '';
      })
      .catch(error => {
        console.error('Error adding task:', error);
        showError('Failed to add task');
      });
  }
  
  function toggleTaskCompletion(taskId, completed) {
    fetch('/api/task/complete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: taskId }),
    })
      .then(() => {
        const task = tasks.find(t => t.id === taskId);
        if (task) {
          if (completed) {
            task.completedAt = new Date().toISOString();
          } else {
            task.completedAt = null;
          }
        }
        renderTasks();
      })
      .catch(error => {
        console.error('Error toggling task completion:', error);
        showError('Failed to update task');
      });
  }
  
  function deleteTask(taskId) {
    if (!confirm('Are you sure you want to delete this task?')) return;
    
    fetch('/api/task/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: taskId }),
    })
      .then(() => {
        tasks = tasks.filter(task => task.id !== taskId);
        renderTasks();
      })
      .catch(error => {
        console.error('Error deleting task:', error);
        showError('Failed to delete task');
      });
  }
  
  function addSubtask(parentId, text, cycle) {
    fetch('/api/subtask/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ parentId, text, cycle }),
    })
      .then(response => response.json())
      .then(newSubtask => {
        const parentTask = tasks.find(task => task.id === parentId);
        if (parentTask) {
          if (!parentTask.subtasks) {
            parentTask.subtasks = [];
          }
          parentTask.subtasks.push(newSubtask);
          renderTasks();
        }
      })
      .catch(error => {
        console.error('Error adding subtask:', error);
        showError('Failed to add subtask');
      });
  }
  
  function toggleSubtaskCompletion(parentId, subtaskId, completed) {
    fetch('/api/subtask/complete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ parentId, id: subtaskId }),
    })
      .then(() => {
        const parentTask = tasks.find(task => task.id === parentId);
        if (parentTask && parentTask.subtasks) {
          const subtask = parentTask.subtasks.find(st => st.id === subtaskId);
          if (subtask) {
            if (completed) {
              subtask.completedAt = new Date().toISOString();
            } else {
              subtask.completedAt = null;
            }
          }
        }
        renderTasks();
      })
      .catch(error => {
        console.error('Error toggling subtask completion:', error);
        showError('Failed to update subtask');
      });
  }
  
  function deleteSubtask(parentId, subtaskId) {
    if (!confirm('Are you sure you want to delete this subtask?')) return;
    
    fetch('/api/subtask/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ parentId, id: subtaskId }),
    })
      .then(() => {
        const parentTask = tasks.find(task => task.id === parentId);
        if (parentTask && parentTask.subtasks) {
          parentTask.subtasks = parentTask.subtasks.filter(st => st.id !== subtaskId);
          renderTasks();
        }
      })
      .catch(error => {
        console.error('Error deleting subtask:', error);
        showError('Failed to delete subtask');
      });
  }
  
  // Helper functions
  function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  function getDueText(dueAt) {
    if (!dueAt) return '';
    
    const now = new Date();
    const dueDate = new Date(dueAt);
    const diffMs = dueDate - now;
    const diffDays = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((Math.abs(diffMs) % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const diffMinutes = Math.floor((Math.abs(diffMs) % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffMs < 0) {
        if (diffDays > 0) {
            return `Overdue by ${diffDays} day${diffDays > 1 ? 's' : ''}`;
        } else if (diffHours > 0) {
            return `Overdue by ${diffHours} hour${diffHours > 1 ? 's' : ''}`;
        } else {
            return `Overdue by ${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`;
        }
    } else if (diffDays > 0) {
        return `Due in ${diffDays} day${diffDays > 1 ? 's' : ''}`;
    } else if (diffHours > 0) {
        return `Due in ${diffHours} hour${diffHours > 1 ? 's' : ''}`;
    } else {
        return `Due in ${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`;
    }
  }
  
  function showError(message) {
    const alert = document.createElement('div');
    alert.className = 'alert-error';
    alert.textContent = message;
    document.body.appendChild(alert);
    
    setTimeout(() => {
      alert.remove();
    }, 3000);
  }
  
  // Event delegation for dynamically added elements
  tasksList.addEventListener('click', function(e) {
    // Handle subtask checkbox toggle
    if (e.target.classList.contains('task-checkbox') && e.target.closest('.subtask-item')) {
      const subtaskItem = e.target.closest('.subtask-item');
      const parentTask = subtaskItem.closest('.task-item');
      const parentId = parentTask.dataset.id;
      const subtaskId = subtaskItem.dataset.id;
      const isCompleted = e.target.checked;
      
      toggleSubtaskCompletion(parentId, subtaskId, isCompleted);
    }
    
    // Handle subtask delete
    if (e.target.classList.contains('delete-subtask-btn') || e.target.closest('.delete-subtask-btn')) {
      const subtaskItem = e.target.closest('.subtask-item');
      const parentTask = subtaskItem.closest('.task-item');
      const parentId = parentTask.dataset.id;
      const subtaskId = subtaskItem.dataset.id;
      
      deleteSubtask(parentId, subtaskId);
    }
  });
});

// Placeholder views for Kanban, Gantt, and Calendar
function setupPlaceholderViews() {
  const path = window.location.pathname;
  
  if (path === '/kanban') {
    document.querySelector('.content-body').innerHTML = `
      <div class="placeholder-view">
        <i class="fas fa-columns"></i>
        <h3>Kanban View</h3>
        <p>This view will display your tasks in a kanban board with columns for different statuses.</p>
        <p>Coming soon!</p>
      </div>
    `;
  } else if (path === '/gantt') {
    document.querySelector('.content-body').innerHTML = `
      <div class="placeholder-view">
        <i class="fas fa-chart-gantt"></i>
        <h3>Gantt Chart</h3>
        <p>This view will display your tasks in a timeline with dependencies and durations.</p>
        <p>Coming soon!</p>
      </div>
    `;
  } else if (path === '/calendar') {
    document.querySelector('.content-body').innerHTML = `
      <div class="placeholder-view">
        <i class="fas fa-calendar"></i>
        <h3>Calendar View</h3>
        <p>This view will display your tasks on a calendar based on their due dates.</p>
        <p>Coming soon!</p>
      </div>
    `;
  }
}

// Call this function when the page loads
setupPlaceholderViews();
