document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const viewControls = document.getElementById('view-controls');
    const dayViewBtn = document.getElementById('day-view');
    const weekViewBtn = document.getElementById('week-view');
    const monthViewBtn = document.getElementById('month-view');
    const prevPeriodBtn = document.getElementById('prev-period');
    const nextPeriodBtn = document.getElementById('next-period');
    const todayBtn = document.getElementById('today-btn');
    const currentPeriodEl = document.getElementById('current-period');
    const calendarView = document.getElementById('calendar-view');
    const toggleSidebarBtn = document.getElementById('toggle-sidebar');
    const sidebar = document.getElementById('sidebar');
    
    // State
    let currentDate = new Date();
    let currentView = 'month'; // Default view
    
    init();
    
    function init() {
        setupEventListeners();
        loadTasksAndRender();
        updateActiveViewButton();
    }
    
    function setupEventListeners() {
        viewControls.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') {
                switchView(e.target.id.replace('-view', ''));
            }
        });
        
        prevPeriodBtn.addEventListener('click', () => navigatePeriod(-1));
        nextPeriodBtn.addEventListener('click', () => navigatePeriod(1));
        todayBtn.addEventListener('click', goToToday);
        
        toggleSidebarBtn.addEventListener('click', function() {
            sidebar.classList.toggle('hidden');
        });
    }

    function updateActiveViewButton() {
        [monthViewBtn, weekViewBtn, dayViewBtn].forEach(btn => {
            btn.classList.remove('bg-mauve', 'text-crust');
            btn.classList.add('text-subtext1', 'hover:bg-surface1');
        });
        const activeBtn = document.getElementById(`${currentView}-view`);
        if (activeBtn) {
            activeBtn.classList.add('bg-mauve', 'text-crust');
            activeBtn.classList.remove('text-subtext1', 'hover:bg-surface1');
        }
    }
    
    function switchView(view) {
        currentView = view;
        updateActiveViewButton();
        loadTasksAndRender();
    }
    
    function navigatePeriod(direction) {
        if (currentView === 'day') {
            currentDate.setDate(currentDate.getDate() + direction);
        } else if (currentView === 'week') {
            currentDate.setDate(currentDate.getDate() + (7 * direction));
        } else { // month
            currentDate.setMonth(currentDate.getMonth() + direction);
        }
        loadTasksAndRender();
    }
    
    function goToToday() {
        currentDate = new Date();
        loadTasksAndRender();
    }
    
    function loadTasksAndRender() {
        updatePeriodDisplay();
        fetch('/api/tasks')
            .then(response => response.json())
            .then(tasks => {
                calendarView.innerHTML = '';
                if (currentView === 'day') renderDayView(tasks || []);
                else if (currentView === 'week') renderWeekView(tasks || []);
                else renderMonthView(tasks || []);
            })
            .catch(error => {
                console.error('Error loading tasks:', error);
                calendarView.innerHTML = `<div class="text-center py-10 text-red"><p>Failed to load tasks</p></div>`;
            });
    }
    
    function updatePeriodDisplay() {
        if (currentView === 'day') {
            currentPeriodEl.textContent = currentDate.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        } else if (currentView === 'week') {
            const weekStart = new Date(currentDate);
            weekStart.setDate(currentDate.getDate() - currentDate.getDay());
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            currentPeriodEl.textContent = `${weekStart.toLocaleDateString(undefined, {month: 'short', day: 'numeric'})} - ${weekEnd.toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})}`;
        } else { // month
            currentPeriodEl.textContent = currentDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
        }
    }
    
    function renderDayView(tasks) {
        const dayStart = new Date(currentDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(currentDate);
        dayEnd.setHours(23, 59, 59, 999);

        const dayTasks = tasks.filter(task => {
            if (!task.dueAt) return false;
            const dueDate = new Date(task.dueAt);
            return dueDate >= dayStart && dueDate <= dayEnd;
        }).sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));

        let html = '<div class="space-y-2">';
        if (dayTasks.length === 0) {
            html += `<div class="text-center text-subtext0 py-8">No tasks scheduled for today.</div>`;
        } else {
            dayTasks.forEach(task => {
                const timeStr = new Date(task.dueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                html += `
                    <div class="flex items-center gap-4 p-3 rounded-md ${task.completedAt ? 'bg-surface0 opacity-60' : 'bg-surface1'}">
                        <span class="font-semibold text-mauve w-20">${timeStr}</span>
                        <span class="truncate">${task.text}</span>
                    </div>`;
            });
        }
        html += `</div>`;
        calendarView.innerHTML = html;
    }

    function renderWeekView(tasks) {
        const weekStart = new Date(currentDate);
        weekStart.setDate(currentDate.getDate() - currentDate.getDay());
        weekStart.setHours(0, 0, 0, 0);

        let html = `<div class="grid grid-cols-1 md:grid-cols-7 gap-2">`;
        const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        for (let i = 0; i < 7; i++) {
            const dayDate = new Date(weekStart);
            dayDate.setDate(weekStart.getDate() + i);
            const dayStart = new Date(dayDate);
            const dayEnd = new Date(dayDate);
            dayEnd.setHours(23, 59, 59, 999);

            const dayTasks = tasks.filter(task => {
                if (!task.dueAt) return false;
                const dueDate = new Date(task.dueAt);
                return dueDate >= dayStart && dueDate <= dayEnd;
            }).sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
            
            html += `<div class="bg-crust rounded-lg p-2">
                <div class="text-center font-bold text-sm mb-2">${weekdays[i]} ${dayDate.getDate()}</div>
                <div class="space-y-1.5">
                    ${dayTasks.length === 0 ? '<div class="text-center text-xs text-subtext0 pt-2">...</div>' : dayTasks.map(task => `
                        <div title="${task.text}" class="p-1.5 rounded text-xs truncate ${task.completedAt ? 'bg-surface0/50 text-subtext0' : 'bg-blue text-crust'}">
                            ${task.text}
                        </div>
                    `).join('')}
                </div>
            </div>`;
        }
        html += `</div>`;
        calendarView.innerHTML = html;
    }

    function renderMonthView(tasks) {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        let html = `<div class="grid grid-cols-7 gap-1 text-sm">`;
        const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        html += weekdays.map(day => `<div class="font-bold text-center p-2 text-subtext0">${day}</div>`).join('');

        for (let i = 0; i < firstDay; i++) {
            html += `<div></div>`;
        }

        const today = new Date();
        for (let day = 1; day <= daysInMonth; day++) {
            const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
            const dayDate = new Date(year, month, day);
            const dayTasks = tasks.filter(task => {
                if (!task.dueAt) return false;
                const dueDate = new Date(task.dueAt);
                return dueDate.getFullYear() === year && dueDate.getMonth() === month && dueDate.getDate() === day;
            });
            
            html += `<div class="h-28 bg-crust rounded p-1.5 flex flex-col overflow-hidden ${isToday ? 'border-2 border-mauve' : ''}">
                <div class="font-semibold ${isToday ? 'text-mauve' : ''}">${day}</div>
                <div class="space-y-1 mt-1 overflow-y-auto">
                    ${dayTasks.map(task => `
                        <div title="${task.text}" class="p-1 rounded text-xs truncate ${task.completedAt ? 'bg-surface0/50 text-subtext0' : 'bg-sky text-crust'}">
                            ${task.text}
                        </div>
                    `).join('')}
                </div>
            </div>`;
        }
        html += `</div>`;
        calendarView.innerHTML = html;
    }
});
