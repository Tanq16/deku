package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
)

//go:embed templates static
var content embed.FS

// Task represents a task in the tracker
type Task struct {
	ID          string     `json:"id"`
	Text        string     `json:"text"`
	CreatedAt   time.Time  `json:"createdAt"`
	CompletedAt *time.Time `json:"completedAt,omitempty"`
	Cycle       string     `json:"cycle"`
	Subtasks    []*Task    `json:"subtasks,omitempty"`
}

// TaskStore manages task storage and operations
type TaskStore struct {
	Tasks  []*Task `json:"tasks"`
	mutex  sync.RWMutex
	dbPath string
}

// NewTaskStore creates a new task store
func NewTaskStore(dbPath string) (*TaskStore, error) {
	store := &TaskStore{
		Tasks:  make([]*Task, 0),
		dbPath: dbPath,
	}

	// Create directory if it doesn't exist
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}

	// Load existing tasks if file exists
	if _, err := os.Stat(dbPath); err == nil {
		data, err := os.ReadFile(dbPath)
		if err != nil {
			return nil, err
		}

		if len(data) > 0 {
			if err := json.Unmarshal(data, &store); err != nil {
				return nil, err
			}
		}
	}

	return store, nil
}

// Save saves the tasks to the JSON file
func (ts *TaskStore) Save() error {
	ts.mutex.RLock()
	defer ts.mutex.RUnlock()

	data, err := json.MarshalIndent(ts, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(ts.dbPath, data, 0644)
}

// AddTask adds a new task
func (ts *TaskStore) AddTask(text, cycle string) (*Task, error) {
	ts.mutex.Lock()
	defer ts.mutex.Unlock()

	task := &Task{
		ID:        uuid.New().String(),
		Text:      text,
		CreatedAt: time.Now(),
		Cycle:     cycle,
	}

	ts.Tasks = append(ts.Tasks, task)
	return task, ts.Save()
}

// AddSubtask adds a subtask to a parent task
func (ts *TaskStore) AddSubtask(parentID, text, cycle string) (*Task, error) {
	ts.mutex.Lock()
	defer ts.mutex.Unlock()

	subtask := &Task{
		ID:        uuid.New().String(),
		Text:      text,
		CreatedAt: time.Now(),
		Cycle:     cycle,
	}

	// Find parent task
	found := false
	for _, task := range ts.Tasks {
		if task.ID == parentID {
			if task.Subtasks == nil {
				task.Subtasks = make([]*Task, 0)
			}
			task.Subtasks = append(task.Subtasks, subtask)
			found = true
			break
		}
	}

	if !found {
		return nil, fmt.Errorf("parent task not found")
	}

	return subtask, ts.Save()
}

// UpdateTaskStatus toggles task completion status
func (ts *TaskStore) UpdateTaskStatus(id string, complete bool) error {
	ts.mutex.Lock()
	defer ts.mutex.Unlock()

	// Search in main tasks
	for _, task := range ts.Tasks {
		if task.ID == id {
			if complete {
				now := time.Now()
				task.CompletedAt = &now
			} else {
				task.CompletedAt = nil
			}
			return ts.Save()
		}

		// Check subtasks
		if task.Subtasks != nil {
			for _, subtask := range task.Subtasks {
				if subtask.ID == id {
					if complete {
						now := time.Now()
						subtask.CompletedAt = &now
					} else {
						subtask.CompletedAt = nil
					}

					// Check if all subtasks are complete to auto-complete parent
					allComplete := true
					for _, st := range task.Subtasks {
						if st.CompletedAt == nil {
							allComplete = false
							break
						}
					}

					if allComplete {
						now := time.Now()
						task.CompletedAt = &now
					} else {
						task.CompletedAt = nil
					}

					return ts.Save()
				}
			}
		}
	}

	return fmt.Errorf("task not found")
}

// DeleteTask removes a task
func (ts *TaskStore) DeleteTask(id string) error {
	ts.mutex.Lock()
	defer ts.mutex.Unlock()

	// Delete from main tasks
	for i, task := range ts.Tasks {
		if task.ID == id {
			ts.Tasks = append(ts.Tasks[:i], ts.Tasks[i+1:]...)
			return ts.Save()
		}

		// Check subtasks
		if task.Subtasks != nil {
			for i, subtask := range task.Subtasks {
				if subtask.ID == id {
					task.Subtasks = append(task.Subtasks[:i], task.Subtasks[i+1:]...)
					return ts.Save()
				}
			}
		}
	}

	return fmt.Errorf("task not found")
}

// GetAllTasks returns all tasks sorted by completion status and creation time
func (ts *TaskStore) GetAllTasks() []*Task {
	ts.mutex.RLock()
	defer ts.mutex.RUnlock()

	// Create a copy of tasks to sort
	tasksCopy := make([]*Task, len(ts.Tasks))
	copy(tasksCopy, ts.Tasks)

	// Sort tasks: incomplete first, then by creation time (newest at bottom)
	sort.SliceStable(tasksCopy, func(i, j int) bool {
		// If one is complete and the other isn't, incomplete comes first
		if (tasksCopy[i].CompletedAt == nil) != (tasksCopy[j].CompletedAt == nil) {
			return tasksCopy[i].CompletedAt == nil
		}
		// Otherwise sort by creation time (older first)
		return tasksCopy[i].CreatedAt.Before(tasksCopy[j].CreatedAt)
	})

	return tasksCopy
}

// Main application struct
type App struct {
	Router    *mux.Router
	Templates *template.Template
	Store     *TaskStore
}

func main() {
	dbPath := "data/tasks.json"
	store, err := NewTaskStore(dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize task store: %v", err)
	}

	// Parse templates
	templates, err := template.ParseFS(content, "templates/*.html")
	if err != nil {
		log.Fatalf("Failed to parse templates: %v", err)
	}

	// Initialize router
	router := mux.NewRouter()

	app := &App{
		Router:    router,
		Templates: templates,
		Store:     store,
	}

	// Static files
	router.PathPrefix("/static/").Handler(http.FileServer(http.FS(content)))

	// Routes
	router.HandleFunc("/", app.HandleHome).Methods("GET")
	router.HandleFunc("/kanban", app.HandleKanban).Methods("GET")
	router.HandleFunc("/gantt", app.HandleGantt).Methods("GET")
	router.HandleFunc("/calendar", app.HandleCalendar).Methods("GET")

	// API endpoints
	router.HandleFunc("/api/tasks", app.HandleGetTasks).Methods("GET")
	router.HandleFunc("/api/tasks", app.HandleAddTask).Methods("POST")
	router.HandleFunc("/api/tasks/{id}/subtask", app.HandleAddSubtask).Methods("POST")
	router.HandleFunc("/api/tasks/{id}/status", app.HandleUpdateTaskStatus).Methods("PATCH")
	router.HandleFunc("/api/tasks/{id}", app.HandleDeleteTask).Methods("DELETE")

	// Start server
	port := ":8080"
	log.Printf("Server starting on port %s", port)
	log.Fatal(http.ListenAndServe(port, router))
}

// HandleHome renders the home page
func (app *App) HandleHome(w http.ResponseWriter, r *http.Request) {
	app.Templates.ExecuteTemplate(w, "home.html", nil)
}

// HandleKanban renders the kanban page (placeholder)
func (app *App) HandleKanban(w http.ResponseWriter, r *http.Request) {
	app.Templates.ExecuteTemplate(w, "kanban.html", nil)
}

// HandleGantt renders the gantt page (placeholder)
func (app *App) HandleGantt(w http.ResponseWriter, r *http.Request) {
	app.Templates.ExecuteTemplate(w, "gantt.html", nil)
}

// HandleCalendar renders the calendar page (placeholder)
func (app *App) HandleCalendar(w http.ResponseWriter, r *http.Request) {
	app.Templates.ExecuteTemplate(w, "calendar.html", nil)
}

// API Handlers

// HandleGetTasks returns all tasks
func (app *App) HandleGetTasks(w http.ResponseWriter, r *http.Request) {
	tasks := app.Store.GetAllTasks()
	jsonResponse(w, tasks)
}

// HandleAddTask adds a new task
func (app *App) HandleAddTask(w http.ResponseWriter, r *http.Request) {
	var requestData struct {
		Text  string `json:"text"`
		Cycle string `json:"cycle"`
	}

	if err := json.NewDecoder(r.Body).Decode(&requestData); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	task, err := app.Store.AddTask(requestData.Text, requestData.Cycle)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	jsonResponse(w, task)
}

// HandleAddSubtask adds a subtask to a parent task
func (app *App) HandleAddSubtask(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	parentID := vars["id"]

	var requestData struct {
		Text  string `json:"text"`
		Cycle string `json:"cycle"`
	}

	if err := json.NewDecoder(r.Body).Decode(&requestData); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	subtask, err := app.Store.AddSubtask(parentID, requestData.Text, requestData.Cycle)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	jsonResponse(w, subtask)
}

// HandleUpdateTaskStatus updates a task's completion status
func (app *App) HandleUpdateTaskStatus(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	var requestData struct {
		Complete bool `json:"complete"`
	}

	if err := json.NewDecoder(r.Body).Decode(&requestData); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := app.Store.UpdateTaskStatus(id, requestData.Complete); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// HandleDeleteTask deletes a task
func (app *App) HandleDeleteTask(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	if err := app.Store.DeleteTask(id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// Helper function to send JSON responses
func jsonResponse(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}
