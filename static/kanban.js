document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const kanbanBoard = document.getElementById('kanban-board');
    const toggleSidebarBtn = document.getElementById('toggle-sidebar');
    const sidebar = document.getElementById('sidebar');
    
    // State
    let tasks = [];
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
                renderKanban();
            })
            .catch(error => {
                console.error('Error loading tasks:', error);
                kanbanBoard.innerHTML = `<div class="text-center py-10 text-red col-span-full"><p>Failed to load tasks</p></div>`;
            });
    }
    
    function renderKanban() {
        const columns = [
            { id: 'upcoming', title: 'Upcoming', tasks: [], color: 'sky' },
            { id: 'today', title: 'Today', tasks: [], color: 'blue' },
            { id: 'overdue', title: 'Overdue', tasks: [], color: 'red' },
            { id: 'completed', title: 'Completed', tasks: [], color: 'green' }
        ];
        
        const now = new Date();
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        
        tasks.forEach(task => {
            if (task.completedAt) {
                columns[3].tasks.push(task);
            } else if (!task.dueAt) {
                // No due date, maybe put in upcoming or a separate column
            } else {
                const dueDate = new Date(task.dueAt);
                if (dueDate < now) {
                    columns[2].tasks.push(task);
                } else if (dueDate <= todayEnd) {
                    columns[1].tasks.push(task);
                } else {
                    columns[0].tasks.push(task);
                }
            }
        });
        
        kanbanBoard.innerHTML = columns.map(column => `
            <div class="bg-base rounded-lg flex flex-col">
                <div class="p-4 font-bold border-b-4 border-${column.color} flex justify-between items-center">
                    <span class="text-text">${column.title}</span>
                    <span class="text-sm bg-${column.color} text-crust rounded-full px-2 py-0.5">${column.tasks.length}</span>
                </div>
                <div class="p-4 space-y-3 overflow-y-auto">
                    ${column.tasks.length === 0 ? 
                        `<div class="text-center text-subtext0 py-4">No tasks</div>` : 
                        column.tasks.map(task => createKanbanCard(task)).join('')}
                </div>
            </div>
        `).join('');
    }
    
    function createKanbanCard(task) {
        const isOverdue = task.dueAt && !task.completedAt && new Date(task.dueAt) < new Date();
        const dueText = task.dueAt ? getDueText(task.dueAt) : '';
        
        return `
            <div class="bg-surface0 p-3 rounded-md shadow-sm ${isOverdue ? 'border-l-4 border-red' : ''}" data-id="${task.id}">
                <div class="font-medium mb-1 truncate">${task.text}</div>
                ${task.dueAt ? `
                    <div class="text-xs text-subtext0 flex items-center gap-1.5">
                        <i class="far fa-clock"></i>
                        <span>${dueText}</span>
                    </div>
                ` : ''}
            </div>
        `;
    }
    
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
});
